"""Table chat and its safety tools: word filter, report, block, rate limit, and the
host's switch to turn chat off. Both stores require report + block + filtering for
user-generated content (App Store 1.2, Play UGC policy)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, ChatReport, GameTable, User, UserBlock
from app.services.profanity import clean
from app.services.tables import TableError

MAX_LENGTH = 300
RATE_LIMIT = 5  # messages
RATE_WINDOW = timedelta(seconds=10)
HIDE_AFTER_REPORTS = 2  # distinct reporters before a message is hidden from everyone


def message_out(m: ChatMessage) -> dict:
    return {"id": m.id, "seat": m.seat, "user_id": str(m.user_id), "name": m.user.display_name if m.user else None,
            "text": m.text, "at": m.created_at.isoformat() if m.created_at else None}


async def post(db: AsyncSession, user: User, table_id: uuid.UUID, text: str) -> ChatMessage:
    table = await db.get(GameTable, table_id)
    seat = next((s.seat for s in table.seats if s.user_id == user.id), None) if table else None
    if seat is None:
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_table", "No such table.")
    if not table.chat_enabled:
        raise TableError(status.HTTP_403_FORBIDDEN, "chat_off", "Chat is turned off at this table.")
    text = " ".join(text.split())
    if not text:
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, "empty_message", "Write something first.")
    if len(text) > MAX_LENGTH:
        raise TableError(status.HTTP_422_UNPROCESSABLE_CONTENT, "message_too_long",
                         f"Messages can be up to {MAX_LENGTH} characters.")
    recent = (await db.execute(select(func.count()).select_from(ChatMessage).where(
        ChatMessage.table_id == table_id, ChatMessage.user_id == user.id,
        ChatMessage.created_at > datetime.now(timezone.utc) - RATE_WINDOW))).scalar_one()
    if recent >= RATE_LIMIT:
        raise TableError(status.HTTP_429_TOO_MANY_REQUESTS, "slow_down", "Slow down a little.")

    message = ChatMessage(table_id=table_id, user_id=user.id, seat=seat, text=clean(text))
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def history(db: AsyncSession, user: User, table_id: uuid.UUID, before: int | None = None,
                  limit: int = 50) -> list[ChatMessage]:
    """Newest last. Leaves out hidden messages, messages from people `user` blocked,
    and messages `user` reported."""
    table = await db.get(GameTable, table_id)
    if table is None or all(s.user_id != user.id for s in table.seats):
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_table", "No such table.")
    blocked = select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)
    reported = select(ChatReport.message_id).where(ChatReport.reporter_id == user.id,
                                                   ChatReport.message_id.is_not(None))
    query = (select(ChatMessage).where(ChatMessage.table_id == table_id, ChatMessage.hidden.is_(False),
                                       ChatMessage.user_id.not_in(blocked), ChatMessage.id.not_in(reported))
             .order_by(ChatMessage.id.desc()).limit(min(limit, 100)))
    if before is not None:
        query = query.where(ChatMessage.id < before)
    return list(reversed((await db.execute(query)).scalars().all()))


async def report(db: AsyncSession, user: User, message_id: int, reason: str = "") -> None:
    message = await db.get(ChatMessage, message_id)
    if message is None or message.user_id == user.id:
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_message", "No such message.")
    table = await db.get(GameTable, message.table_id)
    if all(s.user_id != user.id for s in table.seats):
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_message", "No such message.")
    await db.execute(insert(ChatReport).values(
        message_id=message.id, reporter_id=user.id, reported_user_id=message.user_id,
        text=message.text, reason=reason[:200]).on_conflict_do_nothing())
    reporters = (await db.execute(select(func.count()).select_from(ChatReport)
                                  .where(ChatReport.message_id == message.id))).scalar_one()
    if reporters >= HIDE_AFTER_REPORTS:
        message.hidden = True
    await db.flush()


async def block(db: AsyncSession, user: User, other_id: uuid.UUID) -> None:
    if other_id == user.id or await db.get(User, other_id) is None:
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_user", "No such player.")
    await db.execute(insert(UserBlock).values(blocker_id=user.id, blocked_id=other_id).on_conflict_do_nothing())


async def unblock(db: AsyncSession, user: User, other_id: uuid.UUID) -> None:
    block_row = await db.get(UserBlock, (user.id, other_id))
    if block_row is not None:
        await db.delete(block_row)


async def blocked_by(db: AsyncSession, sender_id: uuid.UUID) -> set[uuid.UUID]:
    """Everyone who must not receive `sender_id`'s messages."""
    rows = await db.execute(select(UserBlock.blocker_id).where(UserBlock.blocked_id == sender_id))
    return set(rows.scalars())


async def set_enabled(db: AsyncSession, user: User, table_id: uuid.UUID, enabled: bool) -> GameTable:
    table = await db.get(GameTable, table_id)
    if table is None or all(s.user_id != user.id for s in table.seats):
        raise TableError(status.HTTP_404_NOT_FOUND, "no_such_table", "No such table.")
    if table.host_id != user.id:
        raise TableError(status.HTTP_403_FORBIDDEN, "not_host", "Only the host can change this.")
    table.chat_enabled = enabled
    await db.flush()
    return table
