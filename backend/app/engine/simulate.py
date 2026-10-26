"""Bot-vs-bot simulator. Used by the property tests and runnable by hand:

    uv run python -m app.engine.simulate --games 200 --players 4
"""

from __future__ import annotations

import argparse
from collections import Counter
from collections.abc import Callable

from .bots import GreedyBot
from .game import Action, Phase, Round
from .match import Match
from .presets import PRESETS, Preset

MAX_ACTIONS_PER_ROUND = 5000
MAX_ROUNDS_PER_MATCH = 100

OnAction = Callable[[Round, int, Action], None]


def play_round(rnd: Round, bots: list | None = None, on_action: OnAction | None = None) -> Round:
    bots = bots or [GreedyBot() for _ in range(rnd.num_players)]
    actions = 0
    while rnd.phase is not Phase.OVER:
        actions += 1
        if actions > MAX_ACTIONS_PER_ROUND:
            raise RuntimeError(f"round with seed {rnd.seed!r} did not finish")
        seat = rnd.current
        action = bots[seat].choose(rnd, seat)
        rnd.apply(seat, action)
        if on_action:
            on_action(rnd, seat, action)
    return rnd


def play_match(preset: Preset, num_players: int, seed: int | str,
               bots: list | None = None, on_action: OnAction | None = None) -> Match:
    match = Match(preset, num_players, seed)
    while not match.is_over:
        if len(match.history) >= MAX_ROUNDS_PER_MATCH:
            raise RuntimeError(f"match with seed {seed!r} did not finish")
        play_round(match.start_round(), bots, on_action)
        match.finish_round()
    return match


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--preset", default="aberto", choices=sorted(PRESETS))
    parser.add_argument("--players", type=int, default=4, choices=(2, 4))
    parser.add_argument("--games", type=int, default=100)
    parser.add_argument("--seed", default="sim")
    args = parser.parse_args()

    wins, endings, rounds, turns = Counter(), Counter(), [], []
    for g in range(args.games):
        def track(rnd: Round, _seat: int, _action: Action) -> None:
            if rnd.phase is Phase.OVER:
                endings["bater" if rnd.went_out is not None else "stock ran out"] += 1
                turns.append(rnd.turns)

        match = play_match(PRESETS[args.preset], args.players, f"{args.seed}/{g}", on_action=track)
        wins[match.winner] += 1
        rounds.append(len(match.history))

    print(f"{args.games} matches, {args.preset}, {args.players} players")
    print(f"  wins by team:     {dict(sorted(wins.items()))}")
    print(f"  rounds per match: avg {sum(rounds) / len(rounds):.1f}, max {max(rounds)}")
    print(f"  turns per round:  avg {sum(turns) / len(turns):.1f}, max {max(turns)}")
    print(f"  round endings:    {dict(endings)}")


if __name__ == "__main__":
    main()
