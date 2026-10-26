# Backend Changelog

## 26.10.2026

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
