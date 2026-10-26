"""Private tables: create, join, start, play. The server is authoritative: clients
send intents, the engine validates, and every accepted action, bots' included, is
appended to the move log in the same transaction. The match is rebuilt by replay."""

from __future__ import annotations

import dataclasses
import secrets
import uuid
from collections import defaultdict
from typing import Literal

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.bots import GreedyBot
from app.engine.game import IllegalMove, Phase
from app.engine.match import Match
from app.engine.presets import PRESETS
from app.engine.serialize import action_from_dict, action_to_dict
from app.models import GameAction, GameTable, PlayMode, TableSeat, TableStatus, User

SeatKind = Literal["friend", "bot"]
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: codes are read aloud
_BOTS = {"standard": GreedyBot()}  # relaxed / sharp come later; all map to the baseline now


class TableError(Exception):
    def __init__(self, http_status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.http_status, self.code, self.message = http_status, code, message


# --- lifecycle ----------------------------------------------------------------------

async def create_table(db: AsyncSession, host: User, *, num_players: int, seats: list[SeatKind],
                       mode: PlayMode = PlayMode.LIVE, preset: str = "aberto", chat_enabled: bool = True,
                       target_score: int | None = None) -> GameTable:
    """The host takes seat 0; `seats` describes seats 1..n-1. A table with only bots
    starts at once; otherwise it waits in the lobby for friends."""
    if preset not in PRESETS:
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_preset", f"Unknown mode {preset!r}.")
    if num_players not in (2, 4) or len(seats) != num_players - 1:
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, "bad_seats", "A table has 2 or 4 seats.")
    if host.is_guest and "friend" in seats:
        raise TableError(status.HTTP_403_FORBIDDEN, "account_required",
                         "Sign in with Apple or Google to play with friends.")
    target = target_score or PRESETS[preset].target_score
    if not (500 <= target <= 10000 and target % 500 == 0):
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, "bad_target", "Target score must be 500 to 10000.")

    table = GameTable(code=await _free_code(db), host_id=host.id, preset=preset, num_players=num_players,
                      mode=mode, chat_enabled=chat_enabled, target_score=target, seed=secrets.token_hex(16))
    table.seats = [TableSeat(seat=0, user_id=host.id)] + [
        TableSeat(seat=i, bot_level="standard" if kind == "bot" else None) for i, kind in enumerate(seats, 1)
    ]
    db.add(table)
    await db.flush()
    if "friend" not in seats:
        await _start(db, table)
    return table


async def join(db: AsyncSession, user: User, code: str) -> GameTable:
    if user.is_guest:
        raise TableError(status.HTTP_403_FORBIDDEN, "account_required",
                         "Sign in with Apple or Google to play with friends.")
    table = (await db.execute(select(GameTable).where(GameTable.code == code.strip().upper())
                              .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if table is None:
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_table", "No table with that code.")
    if _seat_of(table, user) is not None:
        return table
    if table.status is not TableStatus.LOBBY:
        raise TableError(status.HTTP_409_CONFLICT, "already_started", "This game has already started.")
    open_seat = next((s for s in table.seats if s.user_id is None and s.bot_level is None), None)
    if open_seat is None:
        raise TableError(status.HTTP_409_CONFLICT, "table_full", "This table is full.")
    open_seat.user_id = user.id
    await db.flush()
    return table


async def start(db: AsyncSession, user: User, table_id: uuid.UUID) -> GameTable:
    """Host only. Seats still open become bots (bots fill empty seats)."""
    table = await _locked(db, table_id)
    if table.host_id != user.id:
        raise TableError(status.HTTP_403_FORBIDDEN, "not_host", "Only the host can start the game.")
    if table.status is not TableStatus.LOBBY:
        raise TableError(status.HTTP_409_CONFLICT, "already_started", "This game has already started.")
    for seat in table.seats:
        if seat.user_id is None and seat.bot_level is None:
            seat.bot_level = "standard"
    await _start(db, table)
    return table


async def act(db: AsyncSession, user: User, table_id: uuid.UUID, action: dict,
              covered: frozenset[int] = frozenset()) -> tuple[GameTable, Match]:
    """Apply one player action, then let bots play until a person's turn or the round ends.
    `covered`: seats of disconnected players a bot is holding (live tables only)."""
    table = await _locked(db, table_id)
    seat = _seat_of(table, user)
    if seat is None:
        raise TableError(status.HTTP_403_FORBIDDEN, "not_seated", "You are not playing at this table.")
    if table.status is not TableStatus.PLAYING:
        raise TableError(status.HTTP_409_CONFLICT, "not_playing", "There is no round in progress.")
    try:
        parsed = action_from_dict(action)
    except ValueError as exc:
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, "malformed_action", str(exc))

    match = await load_match(db, table)
    try:
        _apply(db, table, match, seat, parsed)
    except IllegalMove as exc:  # the engine's code + plain-language reason ("why was that illegal?")
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, exc.code, exc.message)
    _advance(db, table, match, covered)
    await db.flush()
    return table, match


async def next_round(db: AsyncSession, user: User, table_id: uuid.UUID,
                     covered: frozenset[int] = frozenset()) -> tuple[GameTable, Match]:
    table = await _locked(db, table_id)
    if _seat_of(table, user) is None:
        raise TableError(status.HTTP_403_FORBIDDEN, "not_seated", "You are not playing at this table.")
    if table.status is not TableStatus.ROUND_OVER:
        return table, await load_match(db, table)  # someone else already started it: not an error
    match = await load_match(db, table)
    match.start_round()
    table.rounds_started += 1
    table.status = TableStatus.PLAYING
    _advance(db, table, match, covered)
    await db.flush()
    return table, match


async def cover(db: AsyncSession, table_id: uuid.UUID, covered: frozenset[int]) -> tuple[GameTable, Match] | None:
    """A live player dropped: if it is a covered seat's turn, the bot plays it now."""
    table = await _locked(db, table_id)
    if table.mode is not PlayMode.LIVE or table.status is not TableStatus.PLAYING:
        return None
    match = await load_match(db, table)
    _advance(db, table, match, covered)
    await db.flush()
    return table, match


async def get_for(db: AsyncSession, user: User, table_id: uuid.UUID) -> tuple[GameTable, Match]:
    table = await db.get(GameTable, table_id)
    if table is None or _seat_of(table, user) is None:
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_table", "No such table.")
    return table, await load_match(db, table)


async def tables_of(db: AsyncSession, user: User) -> list[GameTable]:
    """The user's unfinished tables, theirs-to-play first, then most recent."""
    rows = (await db.execute(
        select(GameTable).join(TableSeat).where(TableSeat.user_id == user.id,
                                                GameTable.status != TableStatus.FINISHED)
        .order_by(GameTable.updated_at.desc()))).scalars().all()
    return sorted(rows, key=lambda t: _seat_of(t, user) != t.current_seat)


def table_view(table: GameTable, match: Match, user: User, *, connected: set[uuid.UUID] = frozenset(),
               covered: frozenset[int] = frozenset()) -> dict:
    """Everything one player may see. Never includes the seed or other hands."""
    me = _seat_of(table, user)
    return {
        "id": str(table.id),
        "code": table.code,
        "preset": table.preset,
        "num_players": table.num_players,
        "mode": table.mode.value,
        "chat_enabled": table.chat_enabled,
        "target_score": table.target_score,
        "status": table.status.value,
        "is_host": table.host_id == user.id,
        "my_seat": me,
        "current_seat": table.current_seat,
        "seats": [{
            "seat": s.seat,
            "team": s.seat % 2,
            "name": s.user.display_name if s.user else None,
            "is_you": s.seat == me,
            "bot": s.user_id is None and (s.bot_level is not None or table.status is not TableStatus.LOBBY),
            "open": s.user_id is None and s.bot_level is None and table.status is TableStatus.LOBBY,
            "connected": s.user_id in connected if s.user_id else None,
            "covered_by_bot": s.seat in covered,
        } for s in table.seats],
        "scores": list(match.scores),
        "rounds": [[{**dataclasses.asdict(t), "total": t.total} for t in r] for r in match.history],
        "winner": match.winner,
        "game": match.round.view_for(me) if match.round is not None and me is not None else None,
    }


async def refreshed(db: AsyncSession, table: GameTable) -> GameTable:
    """The table with seats and their players freshly loaded. Views read `seat.user`, and
    async SQLAlchemy cannot lazy-load it after a write."""
    return (await db.execute(select(GameTable).where(GameTable.id == table.id)
                             .options(selectinload(GameTable.seats).selectinload(TableSeat.user))
                             .execution_options(populate_existing=True))).scalar_one()


# --- replay -------------------------------------------------------------------------

async def load_match(db: AsyncSession, table: GameTable) -> Match:
    rows = (await db.execute(select(GameAction).where(GameAction.table_id == table.id)
                             .order_by(GameAction.round_no, GameAction.seq))).scalars()
    by_round: dict[int, list[GameAction]] = defaultdict(list)
    for row in rows:
        by_round[row.round_no].append(row)

    preset = dataclasses.replace(PRESETS[table.preset], target_score=table.target_score)
    match = Match(preset, table.num_players, table.seed)
    for round_no in range(table.rounds_started):
        rnd = match.start_round()
        for row in by_round[round_no]:
            rnd.apply(row.seat, action_from_dict(row.action))
        if rnd.phase is Phase.OVER:
            match.finish_round()
    return match


# --- internals ----------------------------------------------------------------------

async def _start(db: AsyncSession, table: GameTable) -> None:
    match = await load_match(db, table)
    match.start_round()
    table.rounds_started = 1
    table.status = TableStatus.PLAYING
    _advance(db, table, match)
    await db.flush()


def _apply(db: AsyncSession, table: GameTable, match: Match, seat: int, action) -> None:
    rnd = match.round
    rnd.apply(seat, action)
    db.add(GameAction(table_id=table.id, round_no=table.rounds_started - 1, seq=len(rnd.history) - 1,
                      seat=seat, action=action_to_dict(action)))


def _advance(db: AsyncSession, table: GameTable, match: Match, covered: frozenset[int] = frozenset()) -> None:
    rnd = match.round
    while rnd.phase is not Phase.OVER and _bot_controls(table, rnd.current, covered):
        level = table.seats[rnd.current].bot_level or "standard"
        _apply(db, table, match, rnd.current, _BOTS.get(level, _BOTS["standard"]).choose(rnd, rnd.current))
    if rnd.phase is Phase.OVER:
        match.finish_round()
        table.status = TableStatus.FINISHED if match.is_over else TableStatus.ROUND_OVER
        table.current_seat = None
    else:
        table.current_seat = rnd.current


def _bot_controls(table: GameTable, seat: int, covered: frozenset[int]) -> bool:
    """Bots play bot seats, seats without a person (e.g. a deleted account), and on live
    tables the seat of a player who dropped (until they come back)."""
    return table.seats[seat].user_id is None or seat in covered


def _seat_of(table: GameTable, user: User) -> int | None:
    return next((s.seat for s in table.seats if s.user_id == user.id), None)


async def _locked(db: AsyncSession, table_id: uuid.UUID) -> GameTable:
    """Row lock: two players' (or two devices') actions on one table never interleave."""
    # populate_existing: if this session already loaded the table (e.g. to remember the turn
    # before a move), the locked read must replace that copy, not keep possibly stale values.
    table = (await db.execute(select(GameTable).where(GameTable.id == table_id).with_for_update()
                              .execution_options(populate_existing=True))).scalar_one_or_none()
    if table is None:
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_table", "No such table.")
    return table


async def _free_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if (await db.execute(select(GameTable.id).where(GameTable.code == code))).first() is None:
            return code
    raise RuntimeError("could not find a free table code")
