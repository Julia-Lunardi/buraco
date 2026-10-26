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
    target_score: int | None = Field(default=None, ge=500, le=10000)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class ActionIn(BaseModel):
    action: dict
