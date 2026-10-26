# Backend Changelog

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
