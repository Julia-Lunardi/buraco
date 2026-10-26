import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings


class InvalidToken(Exception):
    pass


def create_access_token(user_id: uuid.UUID, now: datetime | None = None) -> str:
    """1-hour JWT. `sub` is the user id: guests have no email and Apple may hide it."""
    now = now or datetime.now(timezone.utc)
    claims = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.access_token_expire_minutes)}
    return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> uuid.UUID:
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return uuid.UUID(claims["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise InvalidToken from exc


def create_refresh_token_value() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
