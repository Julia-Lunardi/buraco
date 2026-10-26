import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_account
from app.db.session import get_db
from app.models import User, UserBlock
from app.services import chat
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    """In-app account deletion (App Store requirement). Everything the user owns goes
    with them through ON DELETE CASCADE; their seats at shared tables are handed to bots.
    Salvie shipped a client calling this route before it existed; it is tested here."""
    await db.delete(user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block(user_id: uuid.UUID, user: User = Depends(require_account),
                db: AsyncSession = Depends(get_db)) -> Response:
    """You stop seeing this player's messages at every table (App Store 1.2)."""
    await chat.block(db, user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(user_id: uuid.UUID, user: User = Depends(require_account),
                  db: AsyncSession = Depends(get_db)) -> Response:
    await chat.unblock(db, user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/blocks")
async def my_blocks(user: User = Depends(require_account), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await db.execute(select(User).join(UserBlock, UserBlock.blocked_id == User.id)
                            .where(UserBlock.blocker_id == user.id))
    return [{"id": str(u.id), "name": u.display_name} for u in rows.scalars()]
