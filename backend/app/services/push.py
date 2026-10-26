"""Push notifications via the Expo Push API, ported from Woddie (made async).

Best effort: a push failure must never break the move that triggered it, so nothing
here raises. Tokens Expo reports as DeviceNotRegistered (an uninstall, or a reinstall
with a new token) are deleted so the table doesn't grow forever.

Calm by design: only "your turn" on async tables, "a friend joined", and "round/game
over", and only to people who are not looking at that table right now. No chat pushes.
"""

from __future__ import annotations

import logging
import uuid

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DeviceToken, GameTable, PlayMode, TableStatus

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH_SIZE = 100  # Expo's limit per request
TIMEOUT_SECONDS = 10
_transport: httpx.AsyncBaseTransport | None = None  # tests swap in a MockTransport

_TEXT = {
    "your_turn": {"pt-BR": "Sua vez na mesa {code}.", "en": "Your turn at table {code}.",
                  "da": "Din tur ved bord {code}."},
    "joined": {"pt-BR": "{name} entrou na sua mesa {code}.", "en": "{name} joined your table {code}.",
               "da": "{name} har sat sig ved dit bord {code}."},
    "round_over": {"pt-BR": "Rodada encerrada na mesa {code}.", "en": "Round over at table {code}.",
                   "da": "Runden er slut ved bord {code}."},
    "game_over": {"pt-BR": "Fim de jogo na mesa {code}.", "en": "Game over at table {code}.",
                  "da": "Spillet er slut ved bord {code}."},
}


def text_for(kind: str, locale: str, **values) -> str:
    texts = _TEXT[kind]
    lang = locale if locale in texts else locale.split("-")[0] if locale.split("-")[0] in texts else "pt-BR"
    return texts[lang].format(**values)


async def send(db: AsyncSession, user_ids: list[uuid.UUID], kind: str, data: dict, **values) -> int:
    """Send one notification kind to every device of `user_ids`, each in its own language.
    Returns how many Expo accepted."""
    if not user_ids:
        return 0
    devices = (await db.execute(select(DeviceToken).where(DeviceToken.user_id.in_(user_ids)))).scalars().all()
    messages = [{"to": d.token, "title": "Buraco", "body": text_for(kind, d.locale, **values),
                 "data": {"type": kind, **data}, "sound": "default"} for d in devices]
    accepted, dead = 0, []
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, transport=_transport) as client:
        for start in range(0, len(messages), BATCH_SIZE):
            batch = messages[start:start + BATCH_SIZE]
            try:
                response = await client.post(EXPO_PUSH_URL, json=batch)
                response.raise_for_status()
                receipts = response.json().get("data", [])
            except Exception:
                logger.warning("expo push batch failed", exc_info=True)
                continue
            for message, receipt in zip(batch, receipts):
                if receipt.get("status") == "ok":
                    accepted += 1
                elif receipt.get("details", {}).get("error") == "DeviceNotRegistered":
                    dead.append(message["to"])
    if dead:
        await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(dead)))
        await db.commit()
        logger.info("pruned %d unregistered push tokens", len(dead))
    return accepted


async def after_change(db: AsyncSession, table: GameTable, previous_seat: int | None,
                       previous_status: TableStatus, present: set[uuid.UUID]) -> None:
    """Decide what, if anything, to push after a table changed. `present` = users with
    the table open right now (they see it happen; a push would only be noise)."""
    people = {s.seat: s.user_id for s in table.seats if s.user_id is not None}
    away = [u for u in people.values() if u not in present]
    data = {"table_id": str(table.id)}

    if table.status is not previous_status and table.status in (TableStatus.ROUND_OVER, TableStatus.FINISHED):
        kind = "game_over" if table.status is TableStatus.FINISHED else "round_over"
        await send(db, away, kind, data, code=table.code)
        return
    if (table.mode is PlayMode.ASYNC and table.status is TableStatus.PLAYING
            and table.current_seat is not None and table.current_seat != previous_seat):
        user_id = people.get(table.current_seat)
        if user_id is not None and user_id not in present:
            await send(db, [user_id], "your_turn", data, code=table.code)


async def joined(db: AsyncSession, table: GameTable, name: str, present: set[uuid.UUID]) -> None:
    if table.host_id is not None and table.host_id not in present:
        await send(db, [table.host_id], "joined", {"table_id": str(table.id)}, name=name or "?", code=table.code)
