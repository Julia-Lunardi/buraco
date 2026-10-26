import asyncio
import os
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

load_dotenv()

config = context.config
if os.getenv("DATABASE_URL"):
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import app.models  # noqa: E402, F401  (registers every table on Base.metadata)
from app.db.base import Base  # noqa: E402
from app.db.url import prepare_asyncpg_url  # noqa: E402

# Alembic builds its own engine, separate from the app's. With managed identity it
# needs the Entra-token hook too, or migrations fail with "password authentication
# failed" while the app itself connects fine (Salvie, 28.07.2026).
if os.getenv("DB_USE_MANAGED_IDENTITY", "").lower() == "true":
    from app.db.azure_auth import enable_managed_identity_auth  # noqa: E402

    enable_managed_identity_auth()

_url, _connect_args = prepare_asyncpg_url(config.get_main_option("sqlalchemy.url"))
config.set_main_option("sqlalchemy.url", _url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=_url, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def _run(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=_connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_run)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
