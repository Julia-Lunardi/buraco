# Backend Changelog

## 27.10.2026

- Three bot levels (`engine/bots.py`), as the design asks:
  - **Standard**: the existing GreedyBot.
  - **Sharp**: also never feeds the opponents. In Aberto anyone may take the whole pile, so it keeps cards that would extend, or sit right next to, an opponent's meld.
  - **Relaxed**: makes human slips, about a third of discards a little careless and sometimes waits before laying down. Seeded from the game state, so replays are identical.
- Measured over 800 two-player matches per pairing (each side starting half of them): sharp beats standard 61%, standard beats relaxed 65%, sharp beats relaxed 72.5%. `simulate --team-a/--team-b` reproduces this.
- `game_tables.bot_level` (migration `d05b9a14db05`, default `standard`) is used for the bot seats chosen at creation, for open seats filled at start, and for seats a bot covers. `POST /tables` takes `bot_level`.
- `scripts/chat_reports.py --delete-user`: close an abusive account (terms §3). It works like in-app deletion and the report keeps its copy. The script's actions are now functions with tests.
- Tests: legal play to the end for every mix of levels (property test), relaxed reproducibility, sharp keeping a card that standard would throw to the opponents, bot level on seats, moderation. 225 in total.

## 26.10.2026 (9)

- Push notifications (`services/push.py`), ported from Woddie and made async.
  - Best effort: an Expo outage never blocks a move (tested).
  - `DeviceNotRegistered` tokens are pruned.
  - Migration `b8b5c43aef49`.
- Calm by design: pushes go only to people who don't have the table open.
  - "Your turn" on **async** tables.
  - "{name} joined your table" to the host.
  - "Round over" and "game over".
  - No chat pushes, and no turn pushes on live tables.
- Each device registers its language (`POST /users/me/push-token` with `locale`), so pushes arrive in pt-BR, en or da, falling back to pt-BR. A token follows whoever signed in last on that device. `POST /users/me/push-token/remove` is for sign-out.
- **Fixed a race in the table lock.** A row the session had already loaded came back from `SELECT … FOR UPDATE` with its old in-memory values, so a move could be validated against stale state. The locked reads now use `populate_existing`.
- 9 tests; 217 in total.

## 26.10.2026 (8)

- Table chat with the safety tools both stores require for user content (App Store 1.2, Play's UGC policy). Migration `2ee5ed9ec752`.
- Messages:
  - Sent over `POST /tables/{id}/chat` or the `chat` WebSocket message; history via `GET /tables/{id}/chat?before=`.
  - Whitespace is collapsed, up to 300 characters, at most 5 per 10 seconds (429 `slow_down`).
  - Players at the table only, and not guests.
- Word filter (`services/profanity.py`): masks whole offensive words in pt-BR, English and Danish, ignoring case and accents. Words with an everyday meaning ("macaco", "bicha", "piranha") are deliberately left out so normal table talk isn't mangled.
- **Report** keeps a copy of the text. The message is hidden for the reporter at once, and for everyone after 2 distinct reporters. `scripts/chat_reports.py` lists open reports and can hide a message or resolve a report.
- **Block** is account-wide: a blocked player's messages never reach the blocker, in history or live. Endpoints: `POST`/`DELETE /users/{id}/block`, `GET /users/me/blocks`. Mute stays in the app.
- `PATCH /tables/{id}`: the host turns chat on or off, and all players see the change.
- Deleting an account deletes its messages (CASCADE). Its reports keep their copied text for review.
- 18 tests; 208 in total.

## 26.10.2026 (7)

- Tables over REST (`routers/tables.py`):
  - `POST /tables`, `GET /tables` (home screen: unfinished tables, yours-to-play first), `POST /tables/join`, `GET /tables/{id}`, `POST /tables/{id}/start`, `POST /tables/{id}/actions` and `POST /tables/{id}/next-round`.
  - Errors return `{"code", "detail"}`: a stable code for i18n and the engine's plain-language reason.
- Live play over `WS /tables/{id}/ws`.
  - The first message is `{"type": "auth", "token": …}`, which keeps tokens out of URLs and access logs.
  - The client then sends `action`, `next_round` or `ping`.
  - After every change, each connected player receives **their own** view; hands differ per seat.
  - Moves are committed before they are broadcast, so nobody is shown a move that then rolls back. REST moves are broadcast too, so an async move reaches a live viewer.
- Live tables: a player who drops is shown as disconnected, and after `LIVE_TAKEOVER_SECONDS` (20) a bot plays their seat until they reconnect. Async tables just wait.
- The player view now sends cards as `{id, label}`. There are two of every card, so actions name cards by id. Melds also carry their canastra kind.
- `app/realtime.py` keeps presence and bot cover in one process, so the API must run as **one replica** (noted on the runbook's infra step).
- Lessons from building it:
  - Work after a disconnect runs as a spawned task, not in the socket handler's `finally`, which can be cancelled.
  - Background tasks and unexpected socket errors are logged instead of dying silently.
  - Starlette's TestClient doesn't deliver a mid-test disconnect to the server handler, so the takeover is tested directly with async tests.
- 10 tests (REST, WebSocket, takeover); 190 in total.

## 26.10.2026 (6)

- Tables and games are saved after every action (`services/tables.py`, migration `b41f2948a34e`):
  - `game_tables` holds the settings: mode `live` or `async`, chat on or off, target score, a secret seed, and status lobby → playing → round_over → finished.
  - `table_seats` records who sits where: a person, a bot, or open.
  - `game_actions` is the move log, bots' moves included.
- **The match is never stored as state.** It is rebuilt by replaying the seed plus the move log, which the deterministic engine makes exact. A test plays, reloads in a fresh session and compares all four players' views and the scores. The seed never leaves the server, because it reveals every hand.
- The flow:
  - A table with only bots starts at once. Friend tables wait in the lobby and are joined with a 6-character code (no 0/O/1/I/L, since codes get read aloud).
  - The host starts the game, and seats still open become bots.
  - After each action, bots play until it's a person's turn.
  - `next_round` is idempotent: if two players press "next round", only one round starts.
- Every action locks the table row (`SELECT … FOR UPDATE`), so two devices can never interleave moves.
- Illegal moves return 422 with the engine's code and its plain-language reason, which feeds the "why was that illegal?" explanation.
- Guests can create bot tables only. A player who deletes their account mid-game has their seat covered by a bot (`ON DELETE SET NULL`).
- Async tables simply wait for each person. Live-mode bot takeover of a disconnected seat comes with the WebSocket layer (step 17).
- `engine/serialize.py`: actions to and from plain dicts, with strict validation of client input.
- The migration's undo now drops its Postgres enum types, which autogenerate leaves behind. CI also undoes and redoes all migrations.
- 28 tests, including a whole match played through the service until it finishes.

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
