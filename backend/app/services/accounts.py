"""Find or create the user behind a verified Google or Apple identity."""

from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.oauth import Identity

Provider = Literal["google", "apple"]
_SUB_COLUMN = {"google": User.google_sub, "apple": User.apple_sub}


async def user_for_identity(db: AsyncSession, provider: Provider, identity: Identity) -> User:
    """1. Same provider account → that user.
    2. Else a user with the same *provider-verified* email → link this provider to it.
       Only verified emails link: an email the app merely sends could hijack an account.
    3. Else a new user."""
    column = _SUB_COLUMN[provider]
    user = (await db.execute(select(User).where(column == identity.sub))).scalar_one_or_none()
    if user is None and identity.email:
        user = (await db.execute(select(User).where(User.email == identity.email))).scalar_one_or_none()
        if user is not None:
            setattr(user, column.key, identity.sub)
    if user is None:
        user = User(email=identity.email, display_name=identity.name[:40])
        setattr(user, column.key, identity.sub)
        db.add(user)
    elif not user.display_name and identity.name:
        user.display_name = identity.name[:40]
    await db.flush()
    return user
