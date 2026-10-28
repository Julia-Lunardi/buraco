"""Live tables: who is connected, each turn's clock, which seats a bot is covering, and
pushing each player their own view after every change.

In-process state, so the API runs as ONE replica (Container App max_replicas = 1).
Scaling out needs a shared channel first (Postgres LISTEN/NOTIFY is the cheap one).
Nothing here is the source of truth: losing it (a restart) only drops connections,
which clients re-open, bot cover (the next missed turn brings it back) and the turn clock,
which restarts in full on the next change or connection.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable

from fastapi import WebSocket

from app.config import settings
from app.models import GameTable, PlayMode, TableStatus, User
from app.engine.match import Match

logger = logging.getLogger(__name__)

# The app replays bot moves at a person's pace (mobile realtime/pacing.ts: 1.1-1.6 s each, plus
# jitter) before the next turn shows, so a turn's clock gets this much extra per replayed move.
REPLAY_SECONDS_PER_STEP = 2.0


class Hub:
    def __init__(self) -> None:
        self._sockets: dict[uuid.UUID, dict[uuid.UUID, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))
        self._covered: dict[uuid.UUID, set[int]] = defaultdict(set)
        self._turns: dict[uuid.UUID, tuple[tuple[int, int, int], float, asyncio.Task]] = {}
        self._background: set[asyncio.Task] = set()
        # Set by the router: what to do when a live turn's clock runs out (table, seat, turn).
        self.on_turn_timeout: Callable[[uuid.UUID, int, int], Awaitable[None]] | None = None

    def spawn(self, coro) -> None:
        """Run work that must outlive a connection. A closing WebSocket's handler can be
        cancelled mid-`finally`, so disconnect handling must not live there. The set keeps
        a strong reference: the event loop holds tasks only weakly."""
        async def guarded():
            try:
                await coro
            except Exception:
                logger.exception("background task failed")
        task = asyncio.create_task(guarded())
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    def connected(self, table_id: uuid.UUID) -> set[uuid.UUID]:
        return {u for u, socks in self._sockets[table_id].items() if socks}

    def covered(self, table_id: uuid.UUID) -> frozenset[int]:
        return frozenset(self._covered[table_id])

    def join(self, table_id: uuid.UUID, user_id: uuid.UUID, seat: int, ws: WebSocket) -> None:
        self._sockets[table_id][user_id].add(ws)
        self._covered[table_id].discard(seat)  # they are back: the bot lets go

    def cover(self, table_id: uuid.UUID, seat: int) -> None:
        """A bot plays this seat's turns until its player connects again."""
        self._covered[table_id].add(seat)

    def leave(self, table_id: uuid.UUID, user_id: uuid.UUID, ws: WebSocket) -> bool:
        """True if that was the user's last connection to the table."""
        socks = self._sockets[table_id][user_id]
        socks.discard(ws)
        return not socks

    def seconds_left(self, table_id: uuid.UUID) -> float | None:
        turn = self._turns.get(table_id)
        return max(0.0, turn[1] - time.time()) if turn else None

    def stop_clock(self, table_id: uuid.UUID) -> None:
        turn = self._turns.pop(table_id, None)
        if turn:
            turn[2].cancel()

    def arm_turn(self, table: GameTable, match: Match) -> None:
        """Start the clock for a person's live turn. Called on every broadcast: the same turn
        keeps its clock, a new turn gets a fresh one, anything else stops it."""
        from app.services.tables import replay_steps, turn_number

        seat = table.current_seat
        person = seat is not None and any(s.seat == seat and s.user_id for s in table.seats)
        if (table.mode is not PlayMode.LIVE or table.status is not TableStatus.PLAYING or not person
                or seat in self._covered[table.id] or match.round is None):
            self.stop_clock(table.id)
            return
        key = (table.rounds_started, seat, turn_number(match.round))
        running = self._turns.get(table.id)
        if running and running[0] == key:
            return
        self.stop_clock(table.id)
        deadline = time.time() + settings.live_turn_seconds + REPLAY_SECONDS_PER_STEP * replay_steps(match)
        table_id = table.id

        async def ring() -> None:
            await asyncio.sleep(max(0.0, deadline - time.time()))
            if self._turns.get(table_id, (None,))[0] == key:
                del self._turns[table_id]
            if self.on_turn_timeout is None:
                return
            try:
                await self.on_turn_timeout(table_id, seat, key[2])
            except Exception:  # a background task's error is otherwise lost silently
                logger.exception("live turn timeout failed table=%s seat=%s", table_id, seat)
        self._turns[table_id] = (key, deadline, asyncio.create_task(ring()))

    async def send_chat(self, table_id: uuid.UUID, message: dict, skip: set[uuid.UUID]) -> None:
        """Deliver a chat message to everyone connected except `skip` (who blocked the sender)."""
        for user_id, socks in list(self._sockets[table_id].items()):
            if user_id in skip:
                continue
            for ws in list(socks):
                try:
                    await ws.send_json({"type": "chat", "message": message})
                except Exception:
                    socks.discard(ws)

    async def broadcast(self, table: GameTable, match: Match, view_for) -> None:
        """Send every connected player their own view (hands differ per seat)."""
        self.arm_turn(table, match)
        for user_id, socks in list(self._sockets[table.id].items()):
            seat = next((s for s in table.seats if s.user_id == user_id), None)
            if seat is None or not socks:
                continue
            message = {"type": "state", "table": view_for(seat.user)}
            for ws in list(socks):
                try:
                    await ws.send_json(message)
                except Exception:  # a dead socket; its own handler cleans up
                    socks.discard(ws)


hub = Hub()


def viewer(table: GameTable, match: Match):
    """A view_for(user) bound to the hub's live presence for this table."""
    from app.services.tables import table_view

    def view_for(user: User) -> dict:
        return table_view(table, match, user, connected=hub.connected(table.id), covered=hub.covered(table.id),
                          seconds_left=hub.seconds_left(table.id))
    return view_for
