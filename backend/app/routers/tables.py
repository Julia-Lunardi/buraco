"""Tables over REST (create, join, start, list; async play) and a WebSocket per table
for live play. Both paths go through services.tables, and both push every change to
whoever is connected, so a REST move in an async game also reaches a live viewer."""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user, require_account
from app.core.security import InvalidToken, decode_access_token
from app.db import session as db_session
from app.db.session import get_db
from app.models import GameTable, PlayMode, User
from app.realtime import hub, viewer
from app.schemas.tables import ActionIn, JoinIn, TableCreate
from app.services import tables
from app.services.tables import TableError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tables", tags=["tables"])


async def table_error_handler(_: Request, exc: TableError) -> JSONResponse:
    """`code` is stable for the app's i18n; `detail` is the plain-language reason."""
    return JSONResponse(status_code=exc.http_status, content={"code": exc.code, "detail": exc.message})


async def _publish(db: AsyncSession, table: GameTable, match, user: User) -> dict:
    """Commit first, then tell everyone: nobody is ever shown a move that rolled back."""
    await db.commit()
    table = await tables.refreshed(db, table)
    await hub.broadcast(table, match, viewer(table, match))
    return viewer(table, match)(user)


@router.post("")
async def create(body: TableCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    table = await tables.create_table(db, user, num_players=body.num_players, seats=body.seats, mode=body.mode,
                                      preset=body.preset, chat_enabled=body.chat_enabled,
                                      target_score=body.target_score)
    return await _publish(db, table, await tables.load_match(db, table), user)


@router.get("")
async def mine(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Home screen: unfinished tables, the ones waiting for you first."""
    rows = await tables.tables_of(db, user)
    return [{"id": str(t.id), "code": t.code, "status": t.status.value, "mode": t.mode.value,
             "num_players": t.num_players,
             "your_turn": t.current_seat is not None and
             any(s.user_id == user.id and s.seat == t.current_seat for s in t.seats),
             "players": [s.user.display_name if s.user else None for s in t.seats]} for t in rows]


@router.post("/join")
async def join(body: JoinIn, user: User = Depends(require_account), db: AsyncSession = Depends(get_db)):
    table = await tables.join(db, user, body.code)
    return await _publish(db, table, await tables.load_match(db, table), user)


@router.get("/{table_id}")
async def get(table_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    table, match = await tables.get_for(db, user, table_id)
    return viewer(await tables.refreshed(db, table), match)(user)


@router.post("/{table_id}/start")
async def start(table_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    table = await tables.start(db, user, table_id)
    return await _publish(db, table, await tables.load_match(db, table), user)


@router.post("/{table_id}/actions")
async def act(table_id: uuid.UUID, body: ActionIn, user: User = Depends(get_current_user),
              db: AsyncSession = Depends(get_db)):
    table, match = await tables.act(db, user, table_id, body.action, hub.covered(table_id))
    return await _publish(db, table, match, user)


@router.post("/{table_id}/next-round")
async def next_round(table_id: uuid.UUID, user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    table, match = await tables.next_round(db, user, table_id, hub.covered(table_id))
    return await _publish(db, table, match, user)


# --- WebSocket ------------------------------------------------------------------------
#
# Client → server: {"type": "auth", "token": "<access token>"} first (tokens stay out of
#   URLs and access logs), then {"type": "action", "action": {...}}, {"type": "next_round"}
#   or {"type": "ping"}.
# Server → client: {"type": "state", "table": {...}} after every change,
#   {"type": "error", "code", "detail"} for that client only, {"type": "pong"}.

@router.websocket("/{table_id}/ws")
async def live(ws: WebSocket, table_id: uuid.UUID):
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        user_id = decode_access_token(first.get("token", "")) if first.get("type") == "auth" else None
    except (asyncio.TimeoutError, InvalidToken, ValueError, WebSocketDisconnect):
        user_id = None
    if user_id is None:
        await ws.close(code=4401, reason="Not signed in.")
        return

    async with db_session.SessionLocal() as db:
        user = await db.get(User, user_id)
        table = await db.get(GameTable, table_id)
        seat = next((s.seat for s in table.seats if user and s.user_id == user.id), None) if table else None
        if seat is None:
            await ws.close(code=4404, reason="No such table.")
            return
        hub.join(table_id, user.id, seat, ws)
        match = await tables.load_match(db, table)
        await hub.broadcast(table, match, viewer(table, match))  # includes "connected" for the others

    try:
        while True:
            message = await ws.receive_json()
            if message.get("type") == "ping":
                await ws.send_json({"type": "pong"})
                continue
            async with db_session.SessionLocal() as db:
                user = await db.get(User, user_id)
                try:
                    if message.get("type") == "action":
                        table, match = await tables.act(db, user, table_id, message.get("action") or {},
                                                        hub.covered(table_id))
                    elif message.get("type") == "next_round":
                        table, match = await tables.next_round(db, user, table_id, hub.covered(table_id))
                    else:
                        await ws.send_json({"type": "error", "code": "unknown_message", "detail": "Unknown message."})
                        continue
                except TableError as exc:
                    await db.rollback()
                    await ws.send_json({"type": "error", "code": exc.code, "detail": exc.message})
                    continue
                await db.commit()
                table = await tables.refreshed(db, table)
                await hub.broadcast(table, match, viewer(table, match))
    except WebSocketDisconnect:
        pass
    except Exception:
        # Unexpected: log it (a silent socket death leaves nothing to debug), tell the client.
        logger.exception("live table socket failed table=%s user=%s", table_id, user_id)
        await ws.close(code=1011, reason="Server error.")
    finally:
        if hub.leave(table_id, user_id, ws):
            hub.spawn(_after_last_disconnect(table_id, user_id, seat))


async def _after_last_disconnect(table_id: uuid.UUID, user_id: uuid.UUID, seat: int) -> None:
    async with db_session.SessionLocal() as db:
        table = await db.get(GameTable, table_id)
        if table is None:
            return
        match = await tables.load_match(db, table)
        await hub.broadcast(table, match, viewer(table, match))  # others see "disconnected"
        if table.mode is not PlayMode.LIVE:
            return  # async tables simply wait for the person

    async def take_over() -> None:
        async with db_session.SessionLocal() as db:
            result = await tables.cover(db, table_id, hub.covered(table_id))
            await db.commit()
            if result:
                table, match = await tables.refreshed(db, result[0]), result[1]
                await hub.broadcast(table, match, viewer(table, match))

    hub.schedule_takeover(table_id, user_id, seat, settings.live_takeover_seconds, take_over)
