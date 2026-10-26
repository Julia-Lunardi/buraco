"""Table chat and its safety tools (App Store 1.2 / Play UGC)."""

import pytest
from fastapi.testclient import TestClient

from app.services.profanity import clean

from .test_tables_api import bearer, live, sign_in, sync_sign_in  # noqa: F401  (fixture)


# --- filter -----------------------------------------------------------------------------

@pytest.mark.parametrize("text, expected", [
    ("vai logo, porra", "vai logo, *****"),
    ("PORRA!", "*****!"),
    ("que FDP", "que ***"),
    ("Kælling", "*******"),
    ("you shit", "you ****"),
    ("bem jogado 😅", "bem jogado 😅"),
    ("macaco, bicha, piranha: everyday words stay", "macaco, bicha, piranha: everyday words stay"),
    ("Scunthorpe e cuidado", "Scunthorpe e cuidado"),  # whole words only
])
def test_filter_masks_whole_offensive_words(text, expected):
    assert clean(text) == expected


# --- REST -------------------------------------------------------------------------------

async def friends_table(client, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana))).json()
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    return table["id"], ana, bia


async def say(client, table_id, token, text):
    return await client.post(f"/tables/{table_id}/chat", json={"text": text}, headers=bearer(token))


async def test_post_and_read_history(client, sessions, monkeypatch):
    table_id, ana, bia = await friends_table(client, monkeypatch)
    sent = (await say(client, table_id, ana, "  Boa   sorte!  ")).json()
    assert sent["text"] == "Boa sorte!" and sent["name"] == "Ana" and sent["seat"] == 0
    await say(client, table_id, bia, "Vai logo, porra")
    history = (await client.get(f"/tables/{table_id}/chat", headers=bearer(ana))).json()
    assert [m["text"] for m in history] == ["Boa sorte!", "Vai logo, *****"]


async def test_strangers_and_guests_cannot_chat(client, sessions, monkeypatch):
    table_id, _, _ = await friends_table(client, monkeypatch)
    caio = await sign_in(client, monkeypatch, "g-caio", "Caio")
    assert (await say(client, table_id, caio, "oi")).status_code == 404
    guest = (await client.post("/auth/guest")).json()["access_token"]
    assert (await say(client, table_id, guest, "oi")).status_code == 403


async def test_long_and_empty_messages(client, sessions, monkeypatch):
    table_id, ana, _ = await friends_table(client, monkeypatch)
    assert (await say(client, table_id, ana, "x" * 301)).json()["code"] == "message_too_long"
    assert (await say(client, table_id, ana, "   ")).json()["code"] == "empty_message"


async def test_rate_limit(client, sessions, monkeypatch):
    table_id, ana, _ = await friends_table(client, monkeypatch)
    for i in range(5):
        assert (await say(client, table_id, ana, f"msg {i}")).status_code == 200
    res = await say(client, table_id, ana, "one too many")
    assert res.status_code == 429 and res.json()["code"] == "slow_down"


async def test_host_turns_chat_off(client, sessions, monkeypatch):
    table_id, ana, bia = await friends_table(client, monkeypatch)
    assert (await client.patch(f"/tables/{table_id}", json={"chat_enabled": False},
                                headers=bearer(bia))).status_code == 403  # only the host
    view = (await client.patch(f"/tables/{table_id}", json={"chat_enabled": False}, headers=bearer(ana))).json()
    assert view["chat_enabled"] is False
    assert (await say(client, table_id, bia, "oi")).json()["code"] == "chat_off"


async def test_block_hides_their_messages_everywhere(client, sessions, monkeypatch):
    table_id, ana, bia = await friends_table(client, monkeypatch)
    msg = (await say(client, table_id, bia, "oi Ana")).json()
    assert (await client.post(f"/users/{msg['user_id']}/block", headers=bearer(ana))).status_code == 204
    assert (await client.get(f"/tables/{table_id}/chat", headers=bearer(ana))).json() == []
    blocks = (await client.get("/users/me/blocks", headers=bearer(ana))).json()
    assert blocks == [{"id": msg["user_id"], "name": "Bia"}]
    # Bia still sees her own message; unblocking brings it back for Ana.
    assert len((await client.get(f"/tables/{table_id}/chat", headers=bearer(bia))).json()) == 1
    await client.delete(f"/users/{msg['user_id']}/block", headers=bearer(ana))
    assert len((await client.get(f"/tables/{table_id}/chat", headers=bearer(ana))).json()) == 1


async def test_report_hides_for_reporter_then_for_everyone(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    caio = await sign_in(client, monkeypatch, "g-caio", "Caio")
    dani = await sign_in(client, monkeypatch, "g-dani", "Dani")
    table = (await client.post("/tables", json={"num_players": 4, "seats": ["friend", "friend", "friend"]},
                               headers=bearer(ana))).json()
    for token in (bia, caio, dani):
        await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(token))
    msg = (await say(client, table["id"], bia, "something nasty")).json()
    url = f"/tables/{table['id']}/chat"

    await client.post(f"{url}/{msg['id']}/report", json={"reason": "rude"}, headers=bearer(ana))
    assert (await client.get(url, headers=bearer(ana))).json() == []  # gone for Ana at once
    assert len((await client.get(url, headers=bearer(dani))).json()) == 1  # still there for others

    await client.post(f"{url}/{msg['id']}/report", json={}, headers=bearer(caio))
    assert (await client.get(url, headers=bearer(dani))).json() == []  # two reports: hidden for all


async def test_cannot_report_own_message(client, sessions, monkeypatch):
    table_id, ana, _ = await friends_table(client, monkeypatch)
    msg = (await say(client, table_id, ana, "oi")).json()
    res = await client.post(f"/tables/{table_id}/chat/{msg['id']}/report", json={}, headers=bearer(ana))
    assert res.status_code == 404


async def test_deleting_an_account_deletes_its_messages(client, sessions, monkeypatch):
    table_id, ana, bia = await friends_table(client, monkeypatch)
    await say(client, table_id, bia, "tchau")
    await client.delete("/users/me", headers=bearer(bia))
    assert (await client.get(f"/tables/{table_id}/chat", headers=bearer(ana))).json() == []


# --- WebSocket --------------------------------------------------------------------------

def test_ws_chat_reaches_others_but_not_people_who_blocked_the_sender(live, monkeypatch):
    ana = sync_sign_in(live, monkeypatch, "g-ana", "Ana")
    bia = sync_sign_in(live, monkeypatch, "g-bia", "Bia")
    table = live.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana)).json()
    live.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))

    def connect(token):
        ws = live.websocket_connect(f"/tables/{table['id']}/ws").__enter__()
        ws.send_json({"type": "auth", "token": token})
        return ws

    def next_of(ws, kind):
        while True:
            msg = ws.receive_json()
            if msg["type"] == kind:
                return msg

    ws_ana, ws_bia = connect(ana), connect(bia)
    ws_bia.send_json({"type": "chat", "text": "Bem jogado!"})
    assert next_of(ws_ana, "chat")["message"]["text"] == "Bem jogado!"
    assert next_of(ws_bia, "chat")["message"]["name"] == "Bia"  # the sender gets it back too

    bia_id = live.get("/users/me", headers=bearer(bia)).json()["id"]
    live.post(f"/users/{bia_id}/block", headers=bearer(ana))
    ws_bia.send_json({"type": "chat", "text": "second"})
    assert next_of(ws_bia, "chat")["message"]["text"] == "second"
    ws_ana.send_json({"type": "ping"})
    assert next_of(ws_ana, "pong") == {"type": "pong"}  # nothing from Bia arrived first
    ws_ana.__exit__(None, None, None)
    ws_bia.__exit__(None, None, None)
