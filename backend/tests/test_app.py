from fastapi.testclient import TestClient

from app.db.url import prepare_asyncpg_url
from app.main import app


def test_health():
    with TestClient(app) as client:
        res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "buraco-backend"}


def test_azure_url_sslmode_moves_to_connect_args():
    url, args = prepare_asyncpg_url(
        "postgresql://ca-buraco-de-id@psql-woddie-de.postgres.database.azure.com:5432/buraco_de?sslmode=require"
    )
    assert url == "postgresql+asyncpg://ca-buraco-de-id@psql-woddie-de.postgres.database.azure.com:5432/buraco_de"
    assert args == {"ssl": "require"}


def test_url_whitespace_from_a_pasted_secret_is_removed():
    url, _ = prepare_asyncpg_url(" postgresql+asyncpg://u:p@host :5432/db\n")
    assert url == "postgresql+asyncpg://u:p@host:5432/db"
