"""Push notifications: calm, only to people who aren't looking, in their language."""

import asyncio
import json

import httpx
import pytest
from sqlalchemy import select

from app.db import session as db_session
from app.models import DeviceToken
from app.realtime import hub
from app.services import push

from .test_tables_api import bearer, sign_in


@pytest.fixture
def expo(monkeypatch, sessions):
    """Capture what would go to Expo; tokens containing 'dead' are reported unregistered."""
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        batch = json.loads(request.content)
        sent.extend(batch)
        return httpx.Response(200, json={"data": [
            {"status": "error", "details": {"error": "DeviceNotRegistered"}} if "dead" in m["to"]
            else {"status": "ok"} for m in batch]})

    monkeypatch.setattr(push, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(db_session, "SessionLocal", sessions)
    return sent


async def settle():
    """Pushes go out from background tasks after the response."""
    for _ in range(20):
        await asyncio.sleep(0.02)
        if not hub._background:
            return


async def register(client, token, push_token, locale="pt-BR"):
    return await client.post("/users/me/push-token", headers=bearer(token),
                             json={"token": push_token, "platform": "ios", "locale": locale})


def test_texts_follow_the_device_language():
    assert push.text_for("your_turn", "pt-BR", code="K7Q2MX") == "Sua vez na mesa K7Q2MX."
    assert push.text_for("your_turn", "en-GB", code="K7Q2MX") == "Your turn at table K7Q2MX."
    assert push.text_for("your_turn", "da", code="K7Q2MX") == "Din tur ved bord K7Q2MX."
    assert push.text_for("your_turn", "fr", code="K7Q2MX") == "Sua vez na mesa K7Q2MX."  # pt-BR first


async def test_token_must_be_an_expo_token(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    assert (await register(client, ana, "not-a-token")).status_code == 422
    assert (await register(client, ana, "ExponentPushToken[abc]")).status_code == 204


async def your_async_turn_setup(client, monkeypatch, mode="async"):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    await register(client, bia, "ExponentPushToken[bia-phone]", locale="en")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"], "mode": mode},
                               headers=bearer(ana))).json()
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    await client.post(f"/tables/{table['id']}/start", headers=bearer(ana))
    drew = (await client.post(f"/tables/{table['id']}/actions", json={"action": {"type": "draw"}},
                              headers=bearer(ana))).json()
    await client.post(f"/tables/{table['id']}/actions", headers=bearer(ana), json={"action": {
        "type": "discard", "card": drew["game"]["hand"][0]["id"]}})
    return table


async def test_async_turn_pushes_the_next_player_in_their_language(client, expo, monkeypatch):
    table = await your_async_turn_setup(client, monkeypatch)
    await settle()
    turn = [m for m in expo if m["data"]["type"] == "your_turn"]
    assert len(turn) == 1
    assert turn[0]["to"] == "ExponentPushToken[bia-phone]"
    assert turn[0]["body"] == f"Your turn at table {table['code']}."
    assert turn[0]["data"]["table_id"] == table["id"]


async def test_live_tables_send_no_turn_pushes(client, expo, monkeypatch):
    await your_async_turn_setup(client, monkeypatch, mode="live")
    await settle()
    assert [m for m in expo if m["data"]["type"] == "your_turn"] == []


async def test_host_hears_when_a_friend_joins(client, expo, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    await register(client, ana, "ExponentPushToken[ana-phone]")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana))).json()
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    await settle()
    assert [m["body"] for m in expo] == [f"Bia entrou na sua mesa {table['code']}."]


async def test_unregistered_tokens_are_pruned(client, sessions, expo, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    await register(client, ana, "ExponentPushToken[dead-phone]")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana))).json()
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    await settle()
    async with sessions() as db:
        assert (await db.execute(select(DeviceToken))).scalars().all() == []


async def test_sign_out_removes_the_token(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    await register(client, ana, "ExponentPushToken[ana-phone]")
    res = await client.post("/users/me/push-token/remove", headers=bearer(ana),
                            json={"token": "ExponentPushToken[ana-phone]"})
    assert res.status_code == 204
    async with sessions() as db:
        assert (await db.execute(select(DeviceToken))).scalars().all() == []


async def test_a_token_follows_whoever_signed_in_last(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    await register(client, ana, "ExponentPushToken[shared-ipad]")
    await register(client, bia, "ExponentPushToken[shared-ipad]")
    async with sessions() as db:
        [device] = (await db.execute(select(DeviceToken))).scalars().all()
    me = (await client.get("/users/me", headers=bearer(bia))).json()
    assert str(device.user_id) == me["id"]


async def test_push_failure_never_breaks_the_move(client, sessions, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("expo is down")
    monkeypatch.setattr(push, "_transport", httpx.MockTransport(broken))
    monkeypatch.setattr(db_session, "SessionLocal", sessions)
    table = await your_async_turn_setup(client, monkeypatch)
    await settle()
    ana_view = (await client.get(f"/tables/{table['id']}", headers=bearer(
        await sign_in(client, monkeypatch, "g-ana", "Ana")))).json()
    assert ana_view["current_seat"] == 1  # the move went through
