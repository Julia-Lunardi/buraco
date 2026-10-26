# Import every model here so Alembic autogenerate (and standalone scripts) see
# all tables. Woddie hit a relationship error when a script imported one model alone.
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = ["RefreshToken", "User"]
