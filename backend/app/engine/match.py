"""A match: rounds until a team reaches the target score (R-SCORE-*)."""

from __future__ import annotations

from .game import Phase, Round
from .presets import Preset
from .scoring import TeamScore, score_round


class Match:
    def __init__(self, preset: Preset, num_players: int, seed: int | str) -> None:
        self.preset = preset
        self.num_players = num_players
        self.seed = seed
        self.scores = [0, 0]
        self.history: list[list[TeamScore]] = []
        self.dealer = num_players - 1  # so seat 0 starts the first round (R-SEAT-3)
        self.round: Round | None = None

    def start_round(self) -> Round:
        if self.is_over:
            raise RuntimeError("the match is over")
        if self.round is not None and self.round.phase is not Phase.OVER:
            raise RuntimeError("the current round is still being played")
        first = (self.dealer + 1) % self.num_players
        self.round = Round(self.preset, self.num_players, seed=f"{self.seed}/{len(self.history)}", first_seat=first)
        return self.round

    def finish_round(self) -> list[TeamScore]:
        if self.round is None or self.round.phase is not Phase.OVER:
            raise RuntimeError("no finished round to score")
        result = score_round(self.round)
        self.history.append(result)
        self.scores = [s + r.total for s, r in zip(self.scores, result)]
        self.dealer = (self.dealer + 1) % self.num_players
        self.round = None
        return result

    @property
    def winner(self) -> int | None:
        """The leading team once someone reached the target; an exact tie plays on."""
        if max(self.scores) < self.preset.target_score or self.scores[0] == self.scores[1]:
            return None
        return 0 if self.scores[0] > self.scores[1] else 1

    @property
    def is_over(self) -> bool:
        return self.winner is not None
