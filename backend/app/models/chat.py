import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    table_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("game_tables.id", ondelete="CASCADE"), index=True)
    # CASCADE: deleting an account deletes what that person wrote.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    seat: Mapped[int]
    text: Mapped[str] = mapped_column(String(300))
    # Hidden from everyone: reported by enough players, or removed after review.
    hidden: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", lazy="selectin")


class UserBlock(Base):
    """`blocker` never sees `blocked`'s messages, at any table (App Store 1.2)."""

    __tablename__ = "user_blocks"

    blocker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatReport(Base):
    """A report keeps a copy of the text, so it can be reviewed even if the message goes."""

    __tablename__ = "chat_reports"
    __table_args__ = (UniqueConstraint("message_id", "reporter_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"), index=True)
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    reported_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(String(300))
    reason: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
