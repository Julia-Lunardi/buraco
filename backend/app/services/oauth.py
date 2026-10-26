"""Verifying Google and Apple identity tokens. Ported from Salvie's working
version (backend CHANGELOG 19.09.2026), with every lesson from Woddie and Salvie kept:

- Google: local verification with google-auth (no deprecated tokeninfo call),
  all three client IDs as audiences, ValueError caught BEFORE GoogleAuthError.
- Apple: cached JWKS, `verify_at_hash=False` (python-jose >= 3.5 would reject every
  Apple token), missing `kid` is a 401, nonce compared as SHA256(raw).
- Both run their sync network calls off the event loop and log every step,
  because store-review failures otherwise leave nothing to debug.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
import time
from dataclasses import dataclass

import httpx
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import jwk, jwt
from jose.exceptions import JWTError

from app.config import settings

logger = logging.getLogger(__name__)

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
_JWKS_TTL = 3600


class TokenRejected(Exception):
    """The token is bad (→ 401). The user can retry the sign-in."""


class ProviderUnavailable(Exception):
    """We could not check the token (→ 503): provider down or not configured."""


@dataclass(frozen=True)
class Identity:
    sub: str
    email: str | None  # only when the provider verified it
    name: str


# --- Google ------------------------------------------------------------------------

def google_audiences() -> list[str]:
    return [c for c in (settings.google_client_id, settings.google_ios_client_id,
                        settings.google_android_client_id) if c]


def _verify_google_sync(raw: str) -> dict:
    audiences = google_audiences()
    if not audiences:
        raise ProviderUnavailable("Google sign-in isn't configured.")
    try:
        return google_id_token.verify_oauth2_token(raw, google_requests.Request(), audiences)
    # InvalidValue subclasses BOTH ValueError and GoogleAuthError. This arm must come
    # first, or a wrong-audience token reads as an outage and the app retries forever.
    except ValueError as exc:
        logger.warning("google_auth rejected: %s | audiences=%s", exc, audiences)
        raise TokenRejected("Invalid Google token.") from exc
    except GoogleAuthError as exc:
        logger.error("google_auth transport_error: %s", exc)
        raise ProviderUnavailable("Couldn't verify with Google. Try again.") from exc


async def verify_google(raw: str) -> Identity:
    claims = await asyncio.to_thread(_verify_google_sync, raw)
    sub = claims.get("sub")
    if not sub:
        raise TokenRejected("Google token missing its subject.")
    verified = claims.get("email_verified") in (True, "true")
    name = claims.get("given_name") or (claims.get("name") or "").split(" ")[0]
    logger.info("google_auth ok sub=%s aud=%s email_verified=%s", sub, claims.get("aud"), verified)
    return Identity(sub=sub, email=claims.get("email") if verified else None, name=name)


# --- Apple -------------------------------------------------------------------------

_jwks_lock = threading.Lock()
_jwks_cache: list[dict] | None = None
_jwks_time = 0.0


def apple_public_key(kid: str) -> dict | None:
    """Apple's signing key for `kid`, from a 1-hour cache (Apple rate-limits the endpoint)."""
    global _jwks_cache, _jwks_time
    with _jwks_lock:
        cache, age = _jwks_cache, time.monotonic() - _jwks_time
    if cache and age < _JWKS_TTL:
        key = next((k for k in cache if k.get("kid") == kid), None)
        if key:
            logger.info("apple_jwks cache_hit kid=%s", kid)
            return key
    try:
        res = httpx.get(APPLE_KEYS_URL, timeout=5)
        res.raise_for_status()
        keys = res.json()["keys"]
    except Exception as exc:  # network, HTTP or JSON: all mean "can't check right now"
        logger.warning("apple_jwks fetch_failed kid=%s error=%s", kid, exc)
        with _jwks_lock:  # a stale key beats failing the sign-in over one bad fetch
            return next((k for k in (_jwks_cache or []) if k.get("kid") == kid), None)
    with _jwks_lock:
        _jwks_cache, _jwks_time = keys, time.monotonic()
    key = next((k for k in keys if k.get("kid") == kid), None)
    logger.info("apple_jwks fetched kid=%s found=%s", kid, key is not None)
    return key


async def verify_apple(identity_token: str, raw_nonce: str, full_name: str | None) -> Identity:
    """`raw_nonce` is the value the app kept; the app sent SHA256(raw_nonce) to Apple,
    and Apple put exactly that in the token's `nonce` claim."""
    try:
        header = jwt.get_unverified_header(identity_token)
    except JWTError as exc:
        raise TokenRejected("Invalid Apple token.") from exc
    kid = header.get("kid")
    if not kid:
        logger.warning("apple_auth missing_kid header=%s", header)
        raise TokenRejected("Invalid Apple token.")

    logger.info("apple_auth start kid=%s expected_aud=%s", kid, settings.apple_bundle_id)
    key = await asyncio.to_thread(apple_public_key, kid)
    if key is None:
        raise ProviderUnavailable("Couldn't verify with Apple. Try again.")

    try:
        claims = jwt.decode(
            identity_token,
            jwk.construct(key),
            algorithms=["RS256"],
            audience=settings.apple_bundle_id,
            issuer=APPLE_ISSUER,
            options={"verify_at_hash": False},  # REQUIRED, see module docstring
        )
    except JWTError as exc:
        logger.warning("apple_auth decode_failed %s: %s", type(exc).__name__, exc)
        raise TokenRejected("Invalid Apple token.") from exc

    expected = hashlib.sha256(raw_nonce.encode()).hexdigest()
    if claims.get("nonce") != expected:
        logger.warning("apple_auth nonce_mismatch sub=%s has_nonce=%s", claims.get("sub"), "nonce" in claims)
        raise TokenRejected("Invalid Apple token.")

    verified = claims.get("email_verified") in (True, "true")
    logger.info("apple_auth decode_ok sub=%s aud=%s has_email=%s", claims["sub"], claims.get("aud"),
                bool(claims.get("email")))
    return Identity(sub=claims["sub"], email=claims.get("email") if verified else None,
                    name=(full_name or "").strip())
