# Import every model here so Alembic autogenerate (and standalone scripts) see
# all tables. Woddie hit a relationship error when a script imported one model alone.
from app.models.chat import ChatMessage, ChatReaction, ChatReport, UserBlock
from app.models.device import DeviceToken
from app.models.refresh_token import RefreshToken
from app.models.table import GameAction, GameTable, PlayMode, TableSeat, TableStatus
from app.models.user import User

__all__ = ["ChatMessage", "ChatReaction", "ChatReport", "DeviceToken", "GameAction", "GameTable", "PlayMode", "RefreshToken", "TableSeat", "TableStatus", "User", "UserBlock"]
