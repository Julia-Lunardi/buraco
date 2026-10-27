"""The moderation tool behind scripts/chat_reports.py (terms §3: hide, resolve, close accounts)."""

from sqlalchemy import select

from app.models import ChatMessage, ChatReport, User
from scripts import chat_reports

from .test_chat import friends_table, say
from .test_tables_api import bearer


async def test_hide_resolve_and_delete_an_abusive_account(client, sessions, monkeypatch):
    table_id, ana, bia = await friends_table(client, monkeypatch)
    msg = (await say(client, table_id, bia, "something nasty")).json()
    await client.post(f"/tables/{table_id}/chat/{msg['id']}/report", json={"reason": "rude"}, headers=bearer(ana))

    async with sessions() as db:
        [report] = await chat_reports.open_reports(db)
        assert report.text == "something nasty"
        assert await chat_reports.hide(db, msg["id"])
        assert await chat_reports.resolve(db, report.id)
        await db.commit()
        assert await chat_reports.open_reports(db) == []

    # Hidden for everyone now, including players who never reported it.
    assert (await client.get(f"/tables/{table_id}/chat", headers=bearer(ana))).json() == []

    async with sessions() as db:
        assert await chat_reports.delete_user(db, report.reported_user_id)
        await db.commit()
        assert await db.get(User, report.reported_user_id) is None
        # Their messages went with the account; the report keeps its copy for the record.
        assert (await db.execute(select(ChatMessage))).scalars().all() == []
        kept = (await db.execute(select(ChatReport))).scalars().one()
        assert kept.text == "something nasty" and kept.reported_user_id is None

    # The deleted player's session no longer works.
    assert (await client.get("/users/me", headers=bearer(bia))).status_code == 401


async def test_unknown_ids_are_reported_not_ignored(sessions):
    import uuid
    async with sessions() as db:
        assert not await chat_reports.hide(db, 999999)
        assert not await chat_reports.resolve(db, 999999)
        assert not await chat_reports.delete_user(db, uuid.uuid4())
