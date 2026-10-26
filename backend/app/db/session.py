from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.db.url import prepare_asyncpg_url

# Register the Entra-token connect hook before the engine exists, so the first
# connection already authenticates with a token instead of a password.
if settings.db_use_managed_identity:
    from app.db.azure_auth import enable_managed_identity_auth

    enable_managed_identity_auth()

_url, _connect_args = prepare_asyncpg_url(settings.database_url)

# NullPool: every request opens a fresh connection, so none outlives the 1-hour
# Entra token, and the shared server's connection cap is not held by idle pools.
engine = create_async_engine(_url, poolclass=NullPool, connect_args=_connect_args)

SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
