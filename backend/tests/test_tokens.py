"""Access + refresh tokens (Woddie AUTH.md, "Verification" section)."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.security import create_access_token, decode_access_token, hash_refresh_token
from app.models import RefreshToken, User
from app.services.tokens import issue_token_pair


async def signed_in(sessions, **user_fields):
    async with sessions() as db:
        user = User(display_name="Ana", **user_fields)
        db.add(user)
        await db.flush()
        pair = await issue_token_pair(db, user)
        await db.commit()
        return user, pair


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- access token -------------------------------------------------------------

def test_access_token_carries_the_user_id_and_lasts_an_hour():
    from jose import jwt

    user_id = uuid.uuid4()
    token = create_access_token(user_id)
    claims = jwt.get_unverified_claims(token)
    assert decode_access_token(token) == user_id
    assert claims["exp"] - claims["iat"] == 3600


async def test_me_with_valid_token(client, sessions):
    user, pair = await signed_in(sessions, email="ana@example.com")
    res = await client.get("/users/me", headers=bearer(pair.access_token))
    assert res.status_code == 200
    assert res.json() == {"id": str(user.id), "display_name": "Ana", "email": "ana@example.com", "is_guest": False}


async def test_missing_token_is_401_not_403(client, sessions):
    assert (await client.get("/users/me")).status_code == 401


async def test_garbage_token_is_401(client, sessions):
    assert (await client.get("/users/me", headers=bearer("not-a-jwt"))).status_code == 401


async def test_expired_access_token_is_401(client, sessions):
    user, _ = await signed_in(sessions)
    old = create_access_token(user.id, now=datetime.now(timezone.utc) - timedelta(hours=2))
    assert (await client.get("/users/me", headers=bearer(old))).status_code == 401


async def test_token_of_a_deleted_user_is_401(client, sessions):
    user, pair = await signed_in(sessions)
    async with sessions() as db:
        await db.delete(await db.get(User, user.id))
        await db.commit()
    assert (await client.get("/users/me", headers=bearer(pair.access_token))).status_code == 401


# --- refresh --------------------------------------------------------------------

async def test_refresh_rotates_the_pair(client, sessions):
    _, pair = await signed_in(sessions)
    res = await client.post("/auth/refresh", json={"refresh_token": pair.refresh_token})
    assert res.status_code == 200
    new = res.json()
    assert new["refresh_token"] != pair.refresh_token
    assert (await client.get("/users/me", headers=bearer(new["access_token"]))).status_code == 200
    # The new refresh token works once more.
    assert (await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})).status_code == 200


async def test_reusing_a_spent_refresh_token_revokes_every_session(client, sessions):
    user, pair = await signed_in(sessions)
    new = (await client.post("/auth/refresh", json={"refresh_token": pair.refresh_token})).json()

    reused = await client.post("/auth/refresh", json={"refresh_token": pair.refresh_token})
    assert reused.status_code == 401

    # The legitimate newer token is revoked too: theft boots every device.
    assert (await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})).status_code == 401
    async with sessions() as db:
        rows = (await db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id))).scalars().all()
    assert rows and all(r.revoked_at is not None for r in rows)


async def test_expired_refresh_token_is_401(client, sessions):
    _, pair = await signed_in(sessions)
    async with sessions() as db:
        rt = (await db.execute(select(RefreshToken))).scalar_one()
        rt.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    assert (await client.post("/auth/refresh", json={"refresh_token": pair.refresh_token})).status_code == 401


async def test_unknown_refresh_token_is_401(client, sessions):
    assert (await client.post("/auth/refresh", json={"refresh_token": "nope"})).status_code == 401


async def test_refresh_tokens_are_stored_hashed(client, sessions):
    _, pair = await signed_in(sessions)
    async with sessions() as db:
        rt = (await db.execute(select(RefreshToken))).scalar_one()
    assert rt.token_hash == hash_refresh_token(pair.refresh_token)
    assert pair.refresh_token not in rt.token_hash


# --- logout -----------------------------------------------------------------------

async def test_logout_revokes_the_refresh_token(client, sessions):
    _, pair = await signed_in(sessions)
    assert (await client.post("/auth/logout", json={"refresh_token": pair.refresh_token})).json() == {"ok": True}
    assert (await client.post("/auth/refresh", json={"refresh_token": pair.refresh_token})).status_code == 401


async def test_logout_with_unknown_token_still_succeeds(client, sessions):
    assert (await client.post("/auth/logout", json={"refresh_token": "nope"})).status_code == 200


async def test_deleting_a_user_deletes_their_refresh_tokens(client, sessions):
    user, _ = await signed_in(sessions)
    async with sessions() as db:
        await db.delete(await db.get(User, user.id))
        await db.commit()
        assert (await db.execute(select(RefreshToken))).scalars().all() == []
