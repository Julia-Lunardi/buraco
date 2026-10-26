"""Access + refresh token pairs (Woddie AUTH.md): rotation on every refresh,
reuse detection, logout revocation."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_access_token, create_refresh_token_value, hash_refresh_token
from app.models import RefreshToken, User
from app.schemas.auth import TokenPair, UserOut


class RefreshRejected(Exception):
    pass


async def issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    raw = create_refresh_token_value()
    db.add(RefreshToken(
        token_hash=hash_refresh_token(raw),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    ))
    await db.flush()
    return TokenPair(access_token=create_access_token(user.id), refresh_token=raw,
                     user=UserOut.model_validate(user))


async def rotate(db: AsyncSession, raw: str) -> TokenPair:
    """Spend a refresh token for a new pair. Raises RefreshRejected (→ 401)."""
    now = datetime.now(timezone.utc)
    rt = await _find(db, raw)
    if rt is None:
        raise RefreshRejected("Invalid refresh token.")
    if rt.revoked_at is not None:
        # A spent token came back: someone else holds a copy. Revoke the whole family.
        await db.execute(update(RefreshToken)
                         .where(RefreshToken.user_id == rt.user_id, RefreshToken.revoked_at.is_(None))
                         .values(revoked_at=now))
        # Commit before raising: get_db rolls back on any exception, which would
        # silently undo the revoke-all (Salvie).
        await db.commit()
        raise RefreshRejected("Invalid refresh token.")
    if rt.expires_at < now:
        raise RefreshRejected("Refresh token expired.")
    user = await db.get(User, rt.user_id)
    if user is None:
        raise RefreshRejected("Invalid refresh token.")
    rt.revoked_at = now
    return await issue_token_pair(db, user)


async def revoke(db: AsyncSession, raw: str) -> None:
    rt = await _find(db, raw)
    if rt is not None and rt.revoked_at is None:
        rt.revoked_at = datetime.now(timezone.utc)


async def _find(db: AsyncSession, raw: str) -> RefreshToken | None:
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw)))
    return result.scalar_one_or_none()
