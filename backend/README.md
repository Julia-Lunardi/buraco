# Buraco backend

Phase 1 holds only the rules engine. The FastAPI app (REST + WebSockets), Postgres and the Azure
deploy follow the Woddie/Salvie layout in later phases.

```bash
uv sync
make test     # pytest: rules, scoring, bots, property tests over full games
make sim      # 200 bot-vs-bot matches with stats
```

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
