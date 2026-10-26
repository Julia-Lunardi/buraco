"""Microsoft Entra ID (managed identity) authentication for Azure PostgreSQL.

When enabled, every new DB connection uses a freshly fetched Entra access token
as its password instead of a static credential. The credential object caches
tokens internally, so ``get_token()`` is cheap between refreshes (~hourly).

The backend uses ``create_async_engine`` with a
``NullPool`` (see ``app/db/session.py``), so a connection is never reused across
the 1-hour token boundary — every request opens a fresh connection and gets a
fresh (cached) token. That is also why we do not need ``pool_pre_ping`` here.

The event is registered on the ``Engine`` *class*, not an instance, so it also
covers the separate engine Alembic builds in ``alembic/env.py``.
"""

import os

from azure.identity import ManagedIdentityCredential
from sqlalchemy import event
from sqlalchemy.engine import Engine

_POSTGRES_TOKEN_SCOPE = "https://ossrdbms-aad.database.windows.net/.default"
_enabled = False


def enable_managed_identity_auth() -> None:
    """Register a connect-time hook that injects an Entra token as the password.

    Listening on the Engine class covers every engine in the process, including
    the async engine the app builds and the one Alembic builds. The asyncpg
    dialect fires ``do_connect`` and passes ``cparams`` straight to
    ``asyncpg.connect``, so setting ``cparams["password"]`` is all that is
    needed. Idempotent.
    """
    global _enabled
    if _enabled:
        return

    # AZURE_CLIENT_ID selects the user-assigned identity attached to the
    # Container App. Absent (e.g. system-assigned), pass None.
    credential = ManagedIdentityCredential(
        client_id=os.environ.get("AZURE_CLIENT_ID") or None
    )

    @event.listens_for(Engine, "do_connect")
    def _provide_token(dialect, conn_rec, cargs, cparams):
        cparams["password"] = credential.get_token(_POSTGRES_TOKEN_SCOPE).token

    _enabled = True
