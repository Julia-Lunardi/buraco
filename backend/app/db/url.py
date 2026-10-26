"""Helpers for normalizing database URLs for the asyncpg driver.

Azure Postgres (and most managed Postgres providers) hand out connection
strings with a ``?sslmode=require`` query parameter. That is a libpq/psycopg
parameter — the asyncpg driver does not accept ``sslmode`` and raises
``TypeError: connect() got an unexpected keyword argument 'sslmode'``.

asyncpg does, however, accept the *same* set of values under the key ``ssl``
(``disable``/``allow``/``prefer``/``require``/``verify-ca``/``verify-full``)
when passed via ``connect_args``. This helper moves the value across so the
URL works unchanged regardless of provider.
"""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def prepare_asyncpg_url(url: str) -> tuple[str, dict]:
    """Return (clean_url, connect_args) safe for create_async_engine.

    Strips ``sslmode`` (and a stray ``ssl``) from the query string and returns
    the equivalent value under ``connect_args["ssl"]`` for asyncpg.
    """
    # Guard against stray whitespace in the secret (leading/trailing, or a
    # space around the host:port) which would otherwise become part of the
    # hostname and fail DNS resolution.
    parts = urlsplit("".join(url.split()))

    # Force the asyncpg driver. The app uses create_async_engine, which rejects
    # the bare sync scheme ("postgresql://" -> psycopg2) that managed providers
    # and Terraform often emit.
    scheme = parts.scheme
    if scheme in ("postgresql", "postgres"):
        parts = parts._replace(scheme="postgresql+asyncpg")

    query = dict(parse_qsl(parts.query, keep_blank_values=True))

    connect_args: dict = {}
    ssl_mode = query.pop("sslmode", None) or query.pop("ssl", None)
    if ssl_mode:
        connect_args["ssl"] = ssl_mode

    clean_url = urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )
    return clean_url, connect_args
