"""Google and Apple sign-in. Covers Salvie's 12 OAuth cases plus Buraco's
stricter rules (required nonce, only provider-verified emails link accounts)."""

import hashlib
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from google.auth.exceptions import InvalidValue, TransportError
from jose import jwk, jwt
from sqlalchemy import select

from app.config import settings
from app.models import User
from app.services import oauth

WEB, IOS, ANDROID = "web.apps.googleusercontent.com", "ios.apps.googleusercontent.com", "and.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", WEB)
    monkeypatch.setattr(settings, "google_ios_client_id", IOS)
    monkeypatch.setattr(settings, "google_android_client_id", ANDROID)


def fake_google(monkeypatch, result):
    seen = {}

    def verify(token, request, audience):
        seen["audience"] = audience
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(oauth.google_id_token, "verify_oauth2_token", verify)
    return seen


async def users(sessions) -> list[User]:
    async with sessions() as db:
        return list((await db.execute(select(User))).scalars())


# --- Google ------------------------------------------------------------------------

GOOGLE_CLAIMS = {"sub": "g-123", "email": "ana@gmail.com", "email_verified": True, "given_name": "Ana", "aud": WEB}


async def test_google_creates_a_user_and_accepts_all_three_audiences(client, sessions, monkeypatch):
    seen = fake_google(monkeypatch, GOOGLE_CLAIMS)
    res = await client.post("/auth/google", json={"id_token": "t"})
    assert res.status_code == 200
    assert res.json()["user"]["display_name"] == "Ana"
    assert seen["audience"] == [WEB, IOS, ANDROID]
    [user] = await users(sessions)
    assert (user.google_sub, user.email) == ("g-123", "ana@gmail.com")


async def test_google_returning_user_gets_the_same_account(client, sessions, monkeypatch):
    fake_google(monkeypatch, GOOGLE_CLAIMS)
    first = (await client.post("/auth/google", json={"id_token": "t"})).json()["user"]["id"]
    second = (await client.post("/auth/google", json={"id_token": "t"})).json()["user"]["id"]
    assert first == second and len(await users(sessions)) == 1


async def test_google_not_configured_is_503(client, sessions, monkeypatch):
    for name in ("google_client_id", "google_ios_client_id", "google_android_client_id"):
        monkeypatch.setattr(settings, name, "")
    assert (await client.post("/auth/google", json={"id_token": "t"})).status_code == 503


async def test_google_invalid_token_is_401(client, sessions, monkeypatch):
    fake_google(monkeypatch, ValueError("Token expired"))
    res = await client.post("/auth/google", json={"id_token": "t"})
    assert res.status_code == 401 and res.json()["detail"] == "Invalid Google token."


async def test_google_audience_mismatch_is_401_not_503(client, sessions, monkeypatch):
    # InvalidValue is BOTH a ValueError and a GoogleAuthError: it must read as a bad token.
    fake_google(monkeypatch, InvalidValue("Token has wrong audience"))
    assert (await client.post("/auth/google", json={"id_token": "t"})).status_code == 401


async def test_google_outage_is_503(client, sessions, monkeypatch):
    fake_google(monkeypatch, TransportError("certs unreachable"))
    assert (await client.post("/auth/google", json={"id_token": "t"})).status_code == 503


async def test_google_token_without_subject_is_401(client, sessions, monkeypatch):
    fake_google(monkeypatch, {**GOOGLE_CLAIMS, "sub": ""})
    assert (await client.post("/auth/google", json={"id_token": "t"})).status_code == 401


async def test_unverified_google_email_is_not_stored(client, sessions, monkeypatch):
    fake_google(monkeypatch, {**GOOGLE_CLAIMS, "email_verified": False})
    assert (await client.post("/auth/google", json={"id_token": "t"})).status_code == 200
    [user] = await users(sessions)
    assert user.email is None


# --- Apple -------------------------------------------------------------------------

_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIVATE_PEM = _private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption()).decode()
PUBLIC_JWK = {**jwk.construct(_private.public_key().public_bytes(
    serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode(), "RS256").to_dict(),
    "kid": "test-kid"}
RAW_NONCE = "4f2a9c1e0b7d"


def apple_token(**overrides) -> str:
    claims = {
        "iss": oauth.APPLE_ISSUER,
        "aud": settings.apple_bundle_id,
        "sub": "a-001.abc",
        "iat": int(time.time()),
        "exp": int(time.time()) + 600,
        "nonce": hashlib.sha256(RAW_NONCE.encode()).hexdigest(),
        "email": "ana@privaterelay.appleid.com",
        "email_verified": "true",
        # Apple tokens carry at_hash; python-jose >= 3.5 rejects them unless told not to check it.
        "at_hash": "dGhpcyBpcyBub3QgY2hlY2tlZA",
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    headers = {"kid": "test-kid"} if "kid" not in overrides else {}
    return jwt.encode(claims, PRIVATE_PEM, algorithm="RS256", headers=headers)


@pytest.fixture(autouse=True)
def apple_keys(monkeypatch):
    monkeypatch.setattr(oauth, "apple_public_key", lambda kid: PUBLIC_JWK if kid == "test-kid" else None)


async def apple(client, token=None, nonce=RAW_NONCE, **extra):
    return await client.post("/auth/apple", json={"identity_token": token or apple_token(), "nonce": nonce, **extra})


async def test_apple_valid_token_signs_in(client, sessions):
    res = await apple(client, full_name="Ana Souza")
    assert res.status_code == 200
    [user] = await users(sessions)
    assert (user.apple_sub, user.email, user.display_name) == ("a-001.abc", "ana@privaterelay.appleid.com", "Ana Souza")


async def test_apple_returning_user_without_email_or_name(client, sessions):
    first = (await apple(client, full_name="Ana Souza")).json()["user"]["id"]
    second = await apple(client, apple_token(email=None, email_verified=None))
    assert second.status_code == 200 and second.json()["user"]["id"] == first


async def test_apple_first_sign_in_with_hidden_email_still_works(client, sessions):
    res = await apple(client, apple_token(email=None, email_verified=None))
    assert res.status_code == 200
    [user] = await users(sessions)
    assert user.email is None


async def test_apple_missing_kid_is_401(client, sessions):
    token = jwt.encode({"sub": "x"}, PRIVATE_PEM, algorithm="RS256")
    assert (await apple(client, token)).status_code == 401


async def test_apple_unknown_kid_is_503(client, sessions):
    token = jwt.encode({"sub": "x"}, PRIVATE_PEM, algorithm="RS256", headers={"kid": "rotated-away"})
    assert (await apple(client, token)).status_code == 503


async def test_apple_nonce_mismatch_is_401(client, sessions):
    assert (await apple(client, nonce="some-other-nonce")).status_code == 401


async def test_apple_raw_nonce_sent_to_apple_is_401(client, sessions):
    # The classic bug: the app passed the RAW nonce to Apple instead of its hash.
    assert (await apple(client, apple_token(nonce=RAW_NONCE))).status_code == 401


async def test_apple_nonce_is_required(client, sessions):
    res = await client.post("/auth/apple", json={"identity_token": apple_token()})
    assert res.status_code == 422


async def test_apple_wrong_audience_is_401(client, sessions):
    assert (await apple(client, apple_token(aud="com.someone.else"))).status_code == 401


async def test_apple_expired_token_is_401(client, sessions):
    assert (await apple(client, apple_token(exp=int(time.time()) - 60))).status_code == 401


async def test_apple_token_signed_by_someone_else_is_401(client, sessions):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    forged = jwt.encode({"sub": "a-001.abc", "aud": settings.apple_bundle_id, "iss": oauth.APPLE_ISSUER,
                         "exp": int(time.time()) + 600}, other, algorithm="RS256", headers={"kid": "test-kid"})
    assert (await apple(client, forged)).status_code == 401


# --- account linking ------------------------------------------------------------------

async def test_verified_email_links_apple_to_existing_google_account(client, sessions, monkeypatch):
    fake_google(monkeypatch, {**GOOGLE_CLAIMS, "email": "ana@icloud.com"})
    google_id = (await client.post("/auth/google", json={"id_token": "t"})).json()["user"]["id"]
    apple_id = (await apple(client, apple_token(email="ana@icloud.com"))).json()["user"]["id"]
    assert apple_id == google_id
    [user] = await users(sessions)
    assert (user.google_sub, user.apple_sub) == ("g-123", "a-001.abc")


async def test_unverified_email_never_links_accounts(client, sessions, monkeypatch):
    fake_google(monkeypatch, {**GOOGLE_CLAIMS, "email": "ana@icloud.com"})
    victim = (await client.post("/auth/google", json={"id_token": "t"})).json()["user"]["id"]
    attacker = (await apple(client, apple_token(sub="a-evil", email="ana@icloud.com", email_verified="false"))).json()
    assert attacker["user"]["id"] != victim


async def test_full_name_from_the_app_cannot_link_accounts(client, sessions, monkeypatch):
    # Salvie trusted an email sent by the app; Buraco's Apple payload has no email field at all.
    res = await client.post("/auth/apple", json={"identity_token": apple_token(sub="a-2", email=None,
                            email_verified=None), "nonce": RAW_NONCE, "email": "ana@gmail.com"})
    assert res.status_code == 200 and res.json()["user"]["email"] is None
