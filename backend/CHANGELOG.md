# Backend Changelog

## 26.10.2026 (5)

- `DELETE /users/me` (204): deletes the account and every session through `ON DELETE CASCADE`. In Salvie the app called this route before it existed, so account deletion always failed; here it is tested from the start.
- `POST /auth/guest`: bot play without an account, storing only an id and tokens.
  - When a guest signs in with Google or Apple while sending their guest token, the guest **becomes** that account and keeps its id and games.
  - If that Google or Apple account already exists, they are signed into it and the empty guest is deleted.
  - A real account's token is never merged into another account.
- `require_account` dependency: guests get 403 ("Sign in with Apple or Google to play with friends.") on anything involving friends.
- 10 tests.

## 26.10.2026 (4)

- `POST /auth/google` and `POST /auth/apple` (`services/oauth.py`), ported from Salvie's working version with every lesson kept:
  - Google is verified locally with `google-auth`, accepting all three client IDs as audiences.
  - The `ValueError` handler comes before `GoogleAuthError`, so a wrong-audience token gives 401, not 503.
  - Apple keys (JWKS) are cached for 1 hour.
  - `verify_at_hash=False` is set, because python-jose ≥ 3.5 would otherwise reject every Apple token.
  - A token without a `kid` gives 401; an unknown `kid` gives 503.
  - Verification runs off the event loop through `asyncio.to_thread`, with step-by-step logs.
  - The backend's error reason is returned as `detail`, so the app can show it.
- Two security fixes compared with Salvie:
  - **Account linking only uses emails the provider verified** (`email_verified`). Salvie linked an Apple sign-in to an existing account using an email the *app* sent, so anyone could take over an account by sending its email.
  - **The Apple nonce is required.** Salvie skipped the check when the app omitted it.
- A first Apple sign-in with a hidden email no longer fails with 400. Buraco accounts don't need an email.
- `google-auth`, `requests` and `httpx` are declared directly rather than arriving through other packages.
- 22 OAuth tests. The Apple ones sign real RS256 tokens with a test key, including an `at_hash` claim. Re-enabling `at_hash` verification makes 6 of them fail.

## 26.10.2026 (3)

- Users and sessions: `users` table (no password column: Apple, Google or guest only; `email` nullable) and `refresh_tokens` (SHA-256 hashes only). Migration `7c489de26eed`.
- `POST /auth/refresh` rotates the token pair. A spent token presented again revokes every session of that user, and the revoke is committed before the 401, because `get_db` rolls back on exceptions (the Salvie lesson).
- `POST /auth/logout` is deliberately unauthenticated. `GET /users/me` checks the access token.
- A missing bearer header returns 401, not FastAPI's default 403, because the mobile interceptor only refreshes on 401.
- The JWT's `sub` is the user id, not the email (Woddie uses the email).
- Response fields are `access_token` and `refresh_token`, as in Woddie, so its `AuthContext` ports unchanged.
- 14 API tests against a real Postgres (`TEST_DATABASE_URL`, `tests/conftest.py`).
- CI: creates the test database, and `alembic check` fails the build if models and migrations differ.

## 26.10.2026 (2)

- Scaffolded the API: FastAPI (`app/main.py`, `/health`), async SQLAlchemy (`app/db/`), Alembic, `Dockerfile` + `start.sh`, `docker-compose.yml` (Postgres 16 on 5434), and `.env.example`.
- Two pieces carried over from Salvie unchanged:
  - `db/url.py` turns Azure's `sslmode=require` into asyncpg's `ssl`, and strips whitespace pasted into secrets.
  - `db/azure_auth.py` provides Entra-token login to the database for both the app and Alembic.
- Differs from Salvie: the app does not call `create_all` at startup. Alembic is the only thing that creates or changes tables.
- Uses `NullPool`, so no connection outlives the 1-hour Entra token and idle pools don't hold slots on the shared server, whose connection limit all four apps share.
- CI now also applies the migrations to an empty Postgres and builds the Docker image.
- Not done yet: `docker compose up` failed locally because Docker Desktop's disk is read-only, a host problem. Migrations were checked against a throwaway Homebrew Postgres instead.

- Phase 1: the rules engine for **Aberto** (`app/engine/`), built from the approved `docs/rules/aberto.md`.
  - Pure, deterministic, seeded.
  - Every action validates before it mutates, so `check()` and `apply()` share one code path.
- Melds are re-judged from their full card set on every change. A 2 that lands in its natural slot therefore counts as natural (R-CARD-3), and a dirty meld can become clean that way.
- Building the engine settled three rule details, now written into the spec:
  - the stock-out check happens at each discard;
  - which morto becomes the stock first;
  - a team whose morto became the stock can still go out with a canastra, and still gets the −100 penalty.
- `GreedyBot` is the baseline bot. It only takes the discard pile for a natural card it can meld at once. That is good play, and it also stops the pile from bouncing between players forever.
- Not implemented yet:
  - Fechado's discard-pile rule, which raises `NotImplementedError`;
  - the relaxed and sharp bot levels.
- 103 tests, including Hypothesis property tests over full bot games. After every action they check that all 108 cards are accounted for, that the wild limit holds, that going out meets its requirements, and that no player's view shows another player's hand.
- CI: `.github/workflows/test.yml` runs the suite on every push.
