"""Live tables: who is connected, which seats a bot is covering, and pushing each
player their own view after every change.

In-process state, so the API runs as ONE replica (Container App max_replicas = 1).
Scaling out needs a shared channel first (Postgres LISTEN/NOTIFY is the cheap one).
Nothing here is the source of truth: losing it (a restart) only drops connections,
which clients re-open, and bot cover, which re-arms on the next disconnect.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict

from fastapi import WebSocket

from app.models import GameTable, User
from app.engine.match import Match

logger = logging.getLogger(__name__)


class Hub:
    def __init__(self) -> None:
        self._sockets: dict[uuid.UUID, dict[uuid.UUID, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))
        self._covered: dict[uuid.UUID, set[int]] = defaultdict(set)
        self._takeovers: dict[tuple[uuid.UUID, uuid.UUID], asyncio.Task] = {}
        self._background: set[asyncio.Task] = set()

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
        task = self._takeovers.pop((table_id, user_id), None)
        if task:
            task.cancel()

    def leave(self, table_id: uuid.UUID, user_id: uuid.UUID, ws: WebSocket) -> bool:
        """True if that was the user's last connection to the table."""
        socks = self._sockets[table_id][user_id]
        socks.discard(ws)
        return not socks

    def schedule_takeover(self, table_id: uuid.UUID, user_id: uuid.UUID, seat: int, after: float, run) -> None:
        async def later() -> None:
            await asyncio.sleep(after)
            if user_id not in self.connected(table_id):
                self._covered[table_id].add(seat)
                try:
                    await run()
                except Exception:  # a background task's error is otherwise lost silently
                    logger.exception("live takeover failed table=%s seat=%s", table_id, seat)
        self._takeovers[(table_id, user_id)] = asyncio.create_task(later())

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
        return table_view(table, match, user, connected=hub.connected(table.id), covered=hub.covered(table.id))
    return view_for
