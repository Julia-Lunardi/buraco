"""Database fixtures. API tests run against a real Postgres (token rotation and
revocation are database behaviour, so mocks would test nothing). Set
TEST_DATABASE_URL to an empty database; CI does. Without it those tests skip."""

import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401  (registers tables)
from app.db.base import Base
from app.db.session import get_db
from app.db.url import prepare_asyncpg_url
from app.main import app


@pytest.fixture(scope="session")
def database_url() -> tuple[str, dict]:
    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TEST_DATABASE_URL is not set")
    url, args = prepare_asyncpg_url(raw)

    async def reset_schema():
        engine = create_async_engine(url, poolclass=NullPool, connect_args=args)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(reset_schema())
    return url, args


@pytest.fixture
async def sessions(database_url):
    url, args = database_url
    engine = create_async_engine(url, poolclass=NullPool, connect_args=args)
    yield async_sessionmaker(engine, expire_on_commit=False)
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    await engine.dispose()


@pytest.fixture
async def client(sessions):
    async def test_db():  # same commit/rollback contract as app.db.session.get_db
        async with sessions() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = test_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
