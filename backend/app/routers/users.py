import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_account
from app.db.session import get_db
from app.models import DeviceToken, User, UserBlock
from app.services import chat
from app.schemas.auth import ProfileIn, PushTokenIn, PushTokenOut, UserOut
from app.services.profanity import clean

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> User:
    """The name other players see at the table and in chat. Apple sends a name only on the
    first sign-in and guests have none, so the app asks for one before playing with friends.
    The chat word filter applies here too: a name is user content other players see."""
    name = " ".join(body.display_name.split())
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Choose a name.")
    user.display_name = clean(name)[:40]
    await db.flush()
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


@router.post("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(body: PushTokenIn, user: User = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)) -> Response:
    """Called after the player allows notifications (asked only after their first table).
    A token moves to whoever signed in last on that device."""
    device = await db.get(DeviceToken, body.token)
    if device is None:
        db.add(DeviceToken(token=body.token, user_id=user.id, platform=body.platform, locale=body.locale))
    else:
        device.user_id, device.platform, device.locale = user.id, body.platform, body.locale
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/push-token/remove", status_code=status.HTTP_204_NO_CONTENT)
async def remove_push_token(body: PushTokenOut, user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)) -> Response:
    """On sign-out, so the next person on this phone doesn't get the previous one's pushes."""
    device = await db.get(DeviceToken, body.token)
    if device is not None and device.user_id == user.id:
        await db.delete(device)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
