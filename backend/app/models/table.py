import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PlayMode(str, enum.Enum):
    LIVE = "live"  # everyone at the table now; a bot covers a disconnected seat
    ASYNC = "async"  # take your turn whenever; "your turn" push notifications


class TableStatus(str, enum.Enum):
    LOBBY = "lobby"
    PLAYING = "playing"
    ROUND_OVER = "round_over"  # scored; waiting for someone to start the next round
    FINISHED = "finished"


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda members: [m.value for m in members])


class GameTable(Base):
    """A private table and its match. The match itself is never stored as state: it is
    rebuilt by replaying `seed` + the move log, which the deterministic engine makes exact."""

    __tablename__ = "game_tables"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    host_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    preset: Mapped[str] = mapped_column(String(20))
    num_players: Mapped[int] = mapped_column(Integer)
    mode: Mapped[PlayMode] = mapped_column(_enum(PlayMode, "play_mode"))
    chat_enabled: Mapped[bool] = mapped_column(default=True)
    # relaxed | standard | sharp: for bot seats chosen at creation and open seats filled at start.
    bot_level: Mapped[str] = mapped_column(String(10), default="standard", server_default="standard")
    target_score: Mapped[int] = mapped_column(Integer)
    status: Mapped[TableStatus] = mapped_column(_enum(TableStatus, "table_status"), default=TableStatus.LOBBY)
    # Secret: whoever knows the seed knows every hand. Never sent to clients.
    seed: Mapped[str] = mapped_column(String(64))
    rounds_started: Mapped[int] = mapped_column(Integer, default=0)
    # Denormalised from the replay so "your turn" lists and pushes need no replay.
    current_seat: Mapped[int | None] = mapped_column(Integer)
    # "Jogar de novo com o mesmo grupo": the table that continues this group, once someone asks.
    rematch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("game_tables.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())

    seats: Mapped[list["TableSeat"]] = relationship(back_populates="table", cascade="all, delete-orphan",
                                                    order_by="TableSeat.seat", lazy="selectin")


class TableSeat(Base):
    """`user_id` set: a person. `bot_level` set: a bot. Neither: an open seat in the
    lobby, or, once playing, a seat a bot covers (e.g. its player deleted their account)."""

    __tablename__ = "table_seats"

    table_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("game_tables.id", ondelete="CASCADE"), primary_key=True)
    seat: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    bot_level: Mapped[str | None] = mapped_column(String(10))

    table: Mapped[GameTable] = relationship(back_populates="seats")
    user = relationship("User", lazy="selectin")


class GameAction(Base):
    """The move log: one row per engine action, bots' included, in order."""

    __tablename__ = "game_actions"
    __table_args__ = (UniqueConstraint("table_id", "round_no", "seq"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    table_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("game_tables.id", ondelete="CASCADE"), index=True)
    round_no: Mapped[int] = mapped_column(Integer)
    seq: Mapped[int] = mapped_column(Integer)
    seat: Mapped[int] = mapped_column(Integer)
    action: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
