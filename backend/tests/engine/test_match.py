import pytest

from app.engine.match import Match
from app.engine.presets import ABERTO


def test_first_round_starts_at_seat_zero_and_dealer_rotates():
    match = Match(ABERTO, 4, seed=7)
    assert match.start_round().current == 0
    match.round._finish(went_out=None)
    match.finish_round()
    assert match.start_round().current == 1


def test_scores_accumulate():
    match = Match(ABERTO, 2, seed=7)
    match.start_round()._finish(went_out=None)
    result = match.finish_round()
    assert match.scores == [result[0].total, result[1].total]


def test_cannot_start_a_round_while_one_is_running():
    match = Match(ABERTO, 2, seed=7)
    match.start_round()
    with pytest.raises(RuntimeError):
        match.start_round()


@pytest.mark.parametrize("scores, winner", [
    ([3000, 1200], 0),
    ([2990, 3100], 1),
    ([3200, 3150], 0),
    ([3100, 3100], None),  # exact tie: play another round (R-SCORE-2)
    ([2999, 100], None),
])
def test_winner(scores, winner):
    match = Match(ABERTO, 2, seed=7)
    match.scores = scores
    assert match.winner == winner
