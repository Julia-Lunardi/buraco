"""Find or create the user behind a verified Google or Apple identity, and turn
guests into real accounts."""

from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GameTable, TableSeat, User
from app.services.oauth import Identity

Provider = Literal["google", "apple"]
_SUB_COLUMN = {"google": User.google_sub, "apple": User.apple_sub}


async def create_guest(db: AsyncSession) -> User:
    user = User(is_guest=True)
    db.add(user)
    await db.flush()
    return user


async def user_for_identity(db: AsyncSession, provider: Provider, identity: Identity,
                            guest: User | None = None) -> User:
    """1. Same provider account → that user. A guest signing in to an existing account
          brings its games along (seats and hosted tables move over); the guest is deleted.
    2. Else a user with the same *provider-verified* email → link this provider to it.
       Only verified emails link: an email the app merely sends could hijack an account.
    3. Else the guest who is signing in becomes this account, keeping its games.
    4. Else a new user."""
    column = _SUB_COLUMN[provider]
    user = (await db.execute(select(User).where(column == identity.sub))).scalar_one_or_none()
    if user is None and identity.email:
        user = (await db.execute(select(User).where(User.email == identity.email))).scalar_one_or_none()
        if user is not None:
            setattr(user, column.key, identity.sub)

    guest = guest if guest is not None and guest.is_guest else None
    if user is None and guest is not None:
        user, guest = guest, None
        user.is_guest = False
        user.email = identity.email
        setattr(user, column.key, identity.sub)
    if user is None:
        user = User(email=identity.email)
        setattr(user, column.key, identity.sub)
        db.add(user)
    if not user.display_name and identity.name:
        user.display_name = identity.name[:40]
    if guest is not None:
        # Guests only play bots, so a guest never shares a table with the account it joins.
        await db.execute(update(TableSeat).where(TableSeat.user_id == guest.id).values(user_id=user.id))
        await db.execute(update(GameTable).where(GameTable.host_id == guest.id).values(host_id=user.id))
        await db.delete(guest)
    await db.flush()
    return user
