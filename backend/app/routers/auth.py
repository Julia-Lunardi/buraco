from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.auth import RefreshIn, TokenPair
from app.services import tokens

router = APIRouter(prefix="/auth", tags=["auth"])


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
