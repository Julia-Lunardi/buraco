from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import User
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
