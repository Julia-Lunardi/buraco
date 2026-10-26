from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_optional_user
from app.db.session import get_db
from app.models import User
from app.schemas.auth import AppleSignIn, GoogleSignIn, RefreshIn, TokenPair
from app.services import oauth, tokens
from app.services.accounts import create_guest, user_for_identity

router = APIRouter(prefix="/auth", tags=["auth"])


def _http_error(exc: Exception) -> HTTPException:
    """The detail reaches the app's error message (Salvie: show the backend's reason)."""
    if isinstance(exc, oauth.ProviderUnavailable):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@router.post("/guest", response_model=TokenPair)
async def guest(db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Play against bots without an account. No personal data: just an id and tokens.
    Signing in with Apple or Google later (sending the guest's bearer token) keeps it."""
    return await tokens.issue_token_pair(db, await create_guest(db))


@router.post("/google", response_model=TokenPair)
async def google(body: GoogleSignIn, db: AsyncSession = Depends(get_db),
                 current: User | None = Depends(get_optional_user)) -> TokenPair:
    try:
        identity = await oauth.verify_google(body.id_token)
    except (oauth.TokenRejected, oauth.ProviderUnavailable) as exc:
        raise _http_error(exc)
    user = await user_for_identity(db, "google", identity, guest=current)
    return await tokens.issue_token_pair(db, user)


@router.post("/apple", response_model=TokenPair)
async def apple(body: AppleSignIn, db: AsyncSession = Depends(get_db),
                current: User | None = Depends(get_optional_user)) -> TokenPair:
    try:
        identity = await oauth.verify_apple(body.identity_token, body.nonce, body.full_name)
    except (oauth.TokenRejected, oauth.ProviderUnavailable) as exc:
        raise _http_error(exc)
    user = await user_for_identity(db, "apple", identity, guest=current)
    return await tokens.issue_token_pair(db, user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Only a 401 from here logs the app out; network errors and 5xx never do."""
    try:
        return await tokens.rotate(db, body.refresh_token)
    except tokens.RefreshRejected as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@router.post("/logout")
async def logout(body: RefreshIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Unauthenticated on purpose: you can only revoke a token you hold."""
    await tokens.revoke(db, body.refresh_token)
    return {"ok": True}
