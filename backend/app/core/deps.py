from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import InvalidToken, decode_access_token
from app.db.session import get_db
from app.models import User

# auto_error=False so a missing header is a 401 (the mobile interceptor refreshes
# on 401 only), not FastAPI's default 403.
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Not signed in.")
    try:
        user_id = decode_access_token(credentials.credentials)
    except InvalidToken:
        raise _unauthorized("Invalid or expired token.")
    user = await db.get(User, user_id)
    if user is None:
        raise _unauthorized("Account not found.")
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """The signed-in user if a valid token came along, else None (never an error)."""
    if credentials is None:
        return None
    try:
        return await db.get(User, decode_access_token(credentials.credentials))
    except InvalidToken:
        return None


async def require_account(user: User = Depends(get_current_user)) -> User:
    """Guests may only play against bots; anything with friends needs Apple or Google."""
    if user.is_guest:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Sign in with Apple or Google to play with friends.")
    return user
