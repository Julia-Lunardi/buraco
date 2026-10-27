from typing import Literal

from pydantic import BaseModel, Field

from app.models import PlayMode


class TableCreate(BaseModel):
    num_players: Literal[2, 4]
    # Seats 1..n-1 (the host sits at 0): a friend to invite, or a bot.
    seats: list[Literal["friend", "bot"]]
    mode: PlayMode = PlayMode.LIVE
    preset: str = "aberto"
    chat_enabled: bool = True
    bot_level: Literal["relaxed", "standard", "sharp"] = "standard"
    target_score: int | None = Field(default=None, ge=500, le=10000)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class ActionIn(BaseModel):
    action: dict


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)  # trimmed and capped at 300 by the service


class ReportIn(BaseModel):
    reason: str = Field(default="", max_length=200)


class TableSettingsIn(BaseModel):
    chat_enabled: bool
