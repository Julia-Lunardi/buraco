# Buraco backend

FastAPI + async SQLAlchemy + Alembic on Postgres, using the Woddie/Salvie stack, plus the rules engine.

```bash
uv sync
cp .env.example .env
make db        # local Postgres 16 on port 5434 (docker compose)
make migrate   # alembic upgrade head
make dev       # API on 0.0.0.0:8001, reachable from a phone on the LAN
make test      # pytest: rules, scoring, bots, property tests, API
make sim       # 200 bot-vs-bot matches with stats
```

Ports: 5434 and 8001, so Buraco runs alongside Woddie and Salvie, which use 5432/5433 and 8000.

Alembic owns the schema: the container's `start.sh` runs `alembic upgrade head` before uvicorn, and
the app never calls `create_all`. In Azure, `DB_USE_MANAGED_IDENTITY=true` makes both the app and
Alembic sign in to the shared `psql-woddie-de` server with an Entra token instead of a password
(`app/db/azure_auth.py`, copied from Salvie).

## Engine (`app/engine/`)

Pure Python with no I/O, so every game is reproducible from its seed and the list of actions. The
rules come from [docs/rules/aberto.md](../docs/rules/aberto.md); test names and comments refer to its
rule ids (`R-MELD-4`, …).

| Module | What it does |
|---|---|
| `cards.py` | The 108-card deck. Each card has an `id` (0..107) that tells the two copies apart |
| `presets.py` | `Preset` flags (one row per spec §9). `ABERTO` is the only preset so far |
| `melds.py` | `analyse()` judges sequences and trincas, wild limits and canastra kinds |
| `game.py` | `Round`: deal, turn phases, morto, going out, stock running out, `view_for(seat)` |
| `scoring.py` | Card values and the per-team round breakdown |
| `match.py` | Rounds until the target score, rotating the dealer |
| `bots.py` | `GreedyBot`, the baseline bot, which uses the same `check()`/`apply()` as players |
| `simulate.py` | Bot-vs-bot runner used by the property tests and `make sim` |

Every action handler validates before it mutates anything. `Round.check()` reuses the same handler
without committing, so the API, the bots and the "why is this illegal?" explanation all share one
code path. An `IllegalMove` carries a stable `code` (for i18n) and an English `message`.
