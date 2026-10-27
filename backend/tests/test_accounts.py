"""Account deletion (step 14) and guest sessions (step 15)."""

from fastapi import Depends
from sqlalchemy import select

from app.core.deps import require_account
from app.main import app
from app.models import RefreshToken, User
from app.services import oauth

from .test_oauth import GOOGLE_CLAIMS, apple_token, fake_google, RAW_NONCE  # noqa: F401  (fixtures too)
from .test_oauth import apple_keys, google_configured  # noqa: F401


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def all_users(sessions) -> list[User]:
    async with sessions() as db:
        return list((await db.execute(select(User))).scalars())


# --- deletion -------------------------------------------------------------------

async def test_delete_account_removes_user_and_sessions(client, sessions, monkeypatch):
    fake_google(monkeypatch, GOOGLE_CLAIMS)
    pair = (await client.post("/auth/google", json={"id_token": "t"})).json()

    res = await client.delete("/users/me", headers=bearer(pair["access_token"]))
    assert res.status_code == 204
    assert await all_users(sessions) == []
    async with sessions() as db:
        assert (await db.execute(select(RefreshToken))).scalars().all() == []
    assert (await client.get("/users/me", headers=bearer(pair["access_token"]))).status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})).status_code == 401


async def test_signing_in_again_after_deletion_starts_fresh(client, sessions, monkeypatch):
    fake_google(monkeypatch, GOOGLE_CLAIMS)
    first = (await client.post("/auth/google", json={"id_token": "t"})).json()
    await client.delete("/users/me", headers=bearer(first["access_token"]))
    second = (await client.post("/auth/google", json={"id_token": "t"})).json()
    assert second["user"]["id"] != first["user"]["id"]


async def test_delete_requires_sign_in(client, sessions):
    assert (await client.delete("/users/me")).status_code == 401


# --- guests ---------------------------------------------------------------------

async def test_guest_session_has_no_personal_data(client, sessions):
    res = await client.post("/auth/guest")
    assert res.status_code == 200
    user = res.json()["user"]
    assert user["is_guest"] is True and user["email"] is None and user["display_name"] == ""
    assert (await client.get("/users/me", headers=bearer(res.json()["access_token"]))).status_code == 200


async def test_guest_refreshes_like_anyone_else(client, sessions):
    pair = (await client.post("/auth/guest")).json()
    assert (await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})).status_code == 200


async def test_guest_becomes_the_account_on_first_sign_in(client, sessions, monkeypatch):
    fake_google(monkeypatch, GOOGLE_CLAIMS)
    guest = (await client.post("/auth/guest")).json()
    signed = (await client.post("/auth/google", json={"id_token": "t"},
                                headers=bearer(guest["access_token"]))).json()
    assert signed["user"]["id"] == guest["user"]["id"]  # same id: their bot games stay theirs
    assert signed["user"]["is_guest"] is False
    [user] = await all_users(sessions)
    assert (user.google_sub, user.email, user.display_name) == ("g-123", "ana@gmail.com", "Ana")


async def test_guest_signing_in_to_an_existing_account_is_merged_away(client, sessions, monkeypatch):
    fake_google(monkeypatch, GOOGLE_CLAIMS)
    existing = (await client.post("/auth/google", json={"id_token": "t"})).json()["user"]["id"]
    guest = (await client.post("/auth/guest")).json()
    signed = (await client.post("/auth/google", json={"id_token": "t"},
                                headers=bearer(guest["access_token"]))).json()
    assert signed["user"]["id"] == existing
    assert [str(u.id) for u in await all_users(sessions)] == [existing]  # the empty guest is gone


async def test_apple_sign_in_upgrades_a_guest_too(client, sessions):
    guest = (await client.post("/auth/guest")).json()
    res = await client.post("/auth/apple", json={"identity_token": apple_token(), "nonce": RAW_NONCE,
                                                 "full_name": "Ana"}, headers=bearer(guest["access_token"]))
    assert res.json()["user"]["id"] == guest["user"]["id"] and res.json()["user"]["is_guest"] is False


async def test_a_real_account_token_is_never_merged_into_another(client, sessions, monkeypatch):
    # Bob is signed in with Google and then signs in with Apple as someone else:
    # Bob's account must not be absorbed or deleted.
    fake_google(monkeypatch, GOOGLE_CLAIMS)
    bob = (await client.post("/auth/google", json={"id_token": "t"})).json()
    res = await client.post("/auth/apple", json={"identity_token": apple_token(sub="a-other", email=None,
                            email_verified=None), "nonce": RAW_NONCE}, headers=bearer(bob["access_token"]))
    assert res.json()["user"]["id"] != bob["user"]["id"]
    assert len(await all_users(sessions)) == 2


async def test_guests_cannot_use_friend_features(client, sessions):
    @app.get("/_test/friends-only")
    async def friends_only(user: User = Depends(require_account)):
        return {"ok": True}

    try:
        guest = (await client.post("/auth/guest")).json()
        res = await client.get("/_test/friends-only", headers=bearer(guest["access_token"]))
        assert res.status_code == 403
        assert res.json()["detail"] == "Sign in with Apple or Google to play with friends."
    finally:
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", "") != "/_test/friends-only"]


# --- display name -------------------------------------------------------------------

async def test_change_display_name_is_trimmed_and_filtered(client, sessions):
    guest = (await client.post("/auth/guest")).json()
    res = await client.patch("/users/me", json={"display_name": "  Ana   Souza "}, headers=bearer(guest["access_token"]))
    assert res.status_code == 200 and res.json()["display_name"] == "Ana Souza"
    res = await client.patch("/users/me", json={"display_name": "porra"}, headers=bearer(guest["access_token"]))
    assert res.json()["display_name"] == "*****"


async def test_display_name_must_not_be_blank_or_too_long(client, sessions):
    token = (await client.post("/auth/guest")).json()["access_token"]
    assert (await client.patch("/users/me", json={"display_name": "   "}, headers=bearer(token))).status_code == 422
    assert (await client.patch("/users/me", json={"display_name": "x" * 41}, headers=bearer(token))).status_code == 422
