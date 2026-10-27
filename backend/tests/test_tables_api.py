"""Step 17: tables over REST, live play over a WebSocket."""

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.db import session as db_session
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import GameTable, TableStatus
from app.services import oauth

from .test_oauth import GOOGLE_CLAIMS


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def google_as(monkeypatch, sub: str, name: str) -> None:
    monkeypatch.setattr(settings, "google_client_id", "web")
    claims = {**GOOGLE_CLAIMS, "sub": sub, "given_name": name, "email": f"{sub}@example.com"}
    monkeypatch.setattr(oauth.google_id_token, "verify_oauth2_token", lambda *a: claims)


# --- REST -----------------------------------------------------------------------------

async def sign_in(client, monkeypatch, sub: str, name: str) -> str:
    google_as(monkeypatch, sub, name)
    return (await client.post("/auth/google", json={"id_token": "t"})).json()["access_token"]


async def test_create_join_start_and_play_over_rest(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")

    created = (await client.post("/tables", json={"num_players": 4, "seats": ["friend", "bot", "bot"],
                                                  "mode": "async"}, headers=bearer(ana))).json()
    assert created["status"] == "lobby" and created["mode"] == "async" and created["is_host"]
    assert [s["open"] for s in created["seats"]] == [False, True, False, False]

    joined = (await client.post("/tables/join", json={"code": created["code"]}, headers=bearer(bia))).json()
    assert joined["my_seat"] == 1 and joined["seats"][1]["name"] == "Bia"

    started = (await client.post(f"/tables/{created['id']}/start", headers=bearer(ana))).json()
    assert started["status"] == "playing" and started["current_seat"] == 0
    hand = started["game"]["hand"]
    assert len(hand) == 11 and {"id", "label"} <= set(hand[0])

    drew = (await client.post(f"/tables/{created['id']}/actions", json={"action": {"type": "draw"}},
                              headers=bearer(ana))).json()
    assert len(drew["game"]["hand"]) == 12

    # Bia sees only her own hand, and that it is not her turn yet.
    bias_view = (await client.get(f"/tables/{created['id']}", headers=bearer(bia))).json()
    assert bias_view["my_seat"] == 1 and len(bias_view["game"]["hand"]) == 11
    assert "seed" not in str(bias_view)


async def test_illegal_move_returns_code_and_reason(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["bot"]}, headers=bearer(ana))).json()
    card = table["game"]["hand"][0]["id"]
    res = await client.post(f"/tables/{table['id']}/actions", json={"action": {"type": "discard", "card": card}},
                            headers=bearer(ana))
    assert res.status_code == 422
    assert res.json() == {"code": "wrong_phase", "detail": "Draw a card or take the discard pile first."}


async def test_home_lists_my_tables_with_my_turn_first(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    lobby = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana))).json()
    playing = (await client.post("/tables", json={"num_players": 2, "seats": ["bot"]}, headers=bearer(ana))).json()
    mine = (await client.get("/tables", headers=bearer(ana))).json()
    assert [t["id"] for t in mine] == [playing["id"], lobby["id"]]
    assert mine[0]["your_turn"] is True and mine[1]["your_turn"] is False
    assert (await client.get("/tables", headers=bearer(bia))).json() == []


async def test_home_rows_carry_rules_scores_and_whose_turn(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"], "preset": "stbl",
                                                "target_score": 2000}, headers=bearer(ana))).json()
    [row] = (await client.get("/tables", headers=bearer(ana))).json()
    assert row["preset"] == "stbl" and row["target_score"] == 2000 and row["my_seat"] == 0
    assert row["scores"] is None and row["turn_of"] is None  # still in the lobby
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    await client.post(f"/tables/{table['id']}/start", headers=bearer(ana))
    [row] = (await client.get("/tables", headers=bearer(bia))).json()
    assert row["my_seat"] == 1 and row["scores"] == [0, 0]
    assert row["your_turn"] is False and row["turn_of"] == {"name": "Ana", "bot": False}


async def test_strangers_cannot_see_a_table(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    caio = await sign_in(client, monkeypatch, "g-caio", "Caio")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["bot"]}, headers=bearer(ana))).json()
    assert (await client.get(f"/tables/{table['id']}", headers=bearer(caio))).status_code == 404


async def test_guest_cannot_join_friends(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana))).json()
    guest = (await client.post("/auth/guest")).json()["access_token"]
    res = await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(guest))
    assert res.status_code == 403


# --- WebSocket ----------------------------------------------------------------------------

@pytest.fixture
def live(database_url, monkeypatch):
    """A sync TestClient wired to the test database (WebSockets need TestClient)."""
    url, args = database_url
    engine = create_async_engine(url, poolclass=NullPool, connect_args=args)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(db_session, "SessionLocal", maker)

    async def test_db():
        async with maker() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()

    async def truncate():
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE {', '.join(t.name for t in Base.metadata.sorted_tables)} CASCADE"))
        await engine.dispose()
    asyncio.run(truncate())


def sync_sign_in(client, monkeypatch, sub, name) -> str:
    google_as(monkeypatch, sub, name)
    return client.post("/auth/google", json={"id_token": "t"}).json()["access_token"]


def next_state(ws) -> dict:
    while True:
        msg = ws.receive_json()
        if msg["type"] == "state":
            return msg["table"]


def test_ws_requires_a_valid_token_first(live, monkeypatch):
    ana = sync_sign_in(live, monkeypatch, "g-ana", "Ana")
    table = live.post("/tables", json={"num_players": 2, "seats": ["bot"]}, headers=bearer(ana)).json()
    with live.websocket_connect(f"/tables/{table['id']}/ws") as ws:
        ws.send_json({"type": "auth", "token": "nope"})
        with pytest.raises(Exception):
            ws.receive_json()


def test_ws_play_and_both_players_see_each_move(live, monkeypatch):
    ana = sync_sign_in(live, monkeypatch, "g-ana", "Ana")
    bia = sync_sign_in(live, monkeypatch, "g-bia", "Bia")
    table = live.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana)).json()
    live.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    live.post(f"/tables/{table['id']}/start", headers=bearer(ana))

    with live.websocket_connect(f"/tables/{table['id']}/ws") as ws_ana, \
         live.websocket_connect(f"/tables/{table['id']}/ws") as ws_bia:
        ws_ana.send_json({"type": "auth", "token": ana})
        assert next_state(ws_ana)["my_seat"] == 0
        ws_bia.send_json({"type": "auth", "token": bia})
        bia_state = next_state(ws_bia)
        assert bia_state["my_seat"] == 1
        assert next_state(ws_ana)["seats"][1]["connected"] is True  # Ana sees Bia arrive

        ws_ana.send_json({"type": "action", "action": {"type": "draw"}})
        ana_after = next_state(ws_ana)
        bia_after = next_state(ws_bia)
        assert len(ana_after["game"]["hand"]) == 12
        assert bia_after["game"]["hand_sizes"][0] == 12 and len(bia_after["game"]["hand"]) == 11

        ws_bia.send_json({"type": "action", "action": {"type": "draw"}})
        err = ws_bia.receive_json()
        assert err == {"type": "error", "code": "not_your_turn", "detail": "It is not your turn."}

        ws_ana.send_json({"type": "ping"})
        assert ws_ana.receive_json() == {"type": "pong"}


# --- live takeover (tested without TestClient: it does not deliver a mid-test
# disconnect to the server handler the way a real server does) ----------------------

async def live_game_after_anas_turn(client, monkeypatch, mode="live"):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"], "mode": mode},
                               headers=bearer(ana))).json()
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    await client.post(f"/tables/{table['id']}/start", headers=bearer(ana))
    drew = (await client.post(f"/tables/{table['id']}/actions", json={"action": {"type": "draw"}},
                              headers=bearer(ana))).json()
    after = (await client.post(f"/tables/{table['id']}/actions", json={"action": {
        "type": "discard", "card": drew["game"]["hand"][0]["id"]}}, headers=bearer(ana))).json()
    assert after["current_seat"] == 1  # Bia's turn
    return table["id"], ana


async def test_takeover_timer_covers_the_seat_and_reconnect_cancels_it():
    from app.realtime import Hub
    hub, ran = Hub(), []

    async def run():
        ran.append(True)

    table_id, user_id = uuid.uuid4(), uuid.uuid4()
    hub.schedule_takeover(table_id, user_id, 1, 0.05, run)
    await asyncio.sleep(0.15)
    assert hub.covered(table_id) == {1} and ran == [True]

    hub.join(table_id, user_id, 1, ws=object())  # back: the bot lets go
    assert hub.covered(table_id) == set()

    hub.leave(table_id, user_id, ws=object())
    hub.schedule_takeover(table_id, user_id, 1, 0.05, run)
    hub.join(table_id, user_id, 1, ws=object())  # back before the grace period ends
    await asyncio.sleep(0.15)
    assert ran == [True] and hub.covered(table_id) == set()


async def test_dropped_live_player_is_played_by_a_bot(client, sessions, monkeypatch):
    from app.realtime import hub
    from app.routers.tables import _after_last_disconnect

    table_id, ana = await live_game_after_anas_turn(client, monkeypatch)
    monkeypatch.setattr(db_session, "SessionLocal", sessions)
    monkeypatch.setattr(settings, "live_takeover_seconds", 0.05)
    bia_not_connected = uuid.uuid4()  # whoever it is, nobody by that id has a socket open
    await _after_last_disconnect(uuid.UUID(table_id), bia_not_connected, 1)
    await asyncio.sleep(0.3)

    view = (await client.get(f"/tables/{table_id}", headers=bearer(ana))).json()
    assert view["seats"][1]["covered_by_bot"] is True
    assert view["current_seat"] == 0  # the bot played Bia's turn and handed back
    hub._covered.clear()


async def test_async_tables_never_hand_a_seat_to_a_bot(client, sessions, monkeypatch):
    from app.routers.tables import _after_last_disconnect

    table_id, ana = await live_game_after_anas_turn(client, monkeypatch, mode="async")
    monkeypatch.setattr(db_session, "SessionLocal", sessions)
    monkeypatch.setattr(settings, "live_takeover_seconds", 0.05)
    await _after_last_disconnect(uuid.UUID(table_id), uuid.uuid4(), 1)
    await asyncio.sleep(0.3)
    view = (await client.get(f"/tables/{table_id}", headers=bearer(ana))).json()
    assert view["current_seat"] == 1 and view["seats"][1]["covered_by_bot"] is False


# --- practice hint ------------------------------------------------------------------------

async def test_hint_suggests_a_legal_move_in_practice_games(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["bot"]}, headers=bearer(ana))).json()
    hint = (await client.get(f"/tables/{table['id']}/hint", headers=bearer(ana))).json()["action"]
    assert hint["type"] in ("draw", "take_discard")  # start of the turn
    played = await client.post(f"/tables/{table['id']}/actions", json={"action": hint}, headers=bearer(ana))
    assert played.status_code == 200  # the hint is always a legal move


async def test_no_hints_when_playing_with_friends(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    bia = await sign_in(client, monkeypatch, "g-bia", "Bia")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["friend"]}, headers=bearer(ana))).json()
    await client.post("/tables/join", json={"code": table["code"]}, headers=bearer(bia))
    await client.post(f"/tables/{table['id']}/start", headers=bearer(ana))
    res = await client.get(f"/tables/{table['id']}/hint", headers=bearer(ana))
    assert res.status_code == 403 and res.json()["code"] == "hint_practice_only"


async def test_rematch_endpoint_points_the_old_table_to_the_new_one(client, sessions, monkeypatch):
    ana = await sign_in(client, monkeypatch, "g-ana", "Ana")
    table = (await client.post("/tables", json={"num_players": 2, "seats": ["bot"]}, headers=bearer(ana))).json()
    res = await client.post(f"/tables/{table['id']}/rematch", headers=bearer(ana))
    assert res.status_code == 409 and res.json()["code"] == "not_finished"
    async with sessions() as db:
        old = await db.get(GameTable, uuid.UUID(table["id"]))
        old.status = TableStatus.FINISHED
        await db.commit()
    new = (await client.post(f"/tables/{table['id']}/rematch", headers=bearer(ana))).json()
    assert new["id"] != table["id"] and new["status"] == "playing" and new["rematch_id"] is None
    old_view = (await client.get(f"/tables/{table['id']}", headers=bearer(ana))).json()
    assert old_view["rematch_id"] == new["id"]
