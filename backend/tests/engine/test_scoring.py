import pytest

from app.engine.game import Phase
from app.engine.presets import ABERTO
from app.engine.scoring import card_points, score_round

from .helpers import cards, rigged_round


@pytest.mark.parametrize("code, points", [
    ("JK", 20), ("2H", 10), ("AS", 15), ("KD", 10), ("8C", 10), ("7H", 5), ("3S", 5),
])
def test_card_values(code, points):
    assert card_points(cards(code)[0], ABERTO) == points


def test_two_keeps_its_value_in_natural_place():
    assert card_points(cards("2H")[0], ABERTO) == 10


def test_round_breakdown():
    # Team 0: a clean canastra (3..9 of spades = 5*5 + 2*10 = 45) and went out.
    # Team 1: a dirty trinca (K K JK = 40), never took its morto, 2 cards left (5+15).
    rnd = rigged_round(
        ["", "5S AH"],
        mortos=(None, "QD QC QS"),
        melds=(["3S 4S 5S 6S 7S 8S 9S"], ["KH KS JK"]),
        phase=Phase.OVER,
    )
    rnd.went_out = 0
    team0, team1 = score_round(rnd)

    assert (team0.melded, team0.canastra_bonus, team0.bater, team0.hand_penalty, team0.morto_penalty) \
        == (45, 200, 100, 0, 0)
    assert team0.total == 345
    assert (team1.melded, team1.canastra_bonus, team1.bater, team1.hand_penalty, team1.morto_penalty) \
        == (40, 0, 0, -20, -100)
    assert team1.total == -80


def test_dirty_and_real_canastra_bonuses():
    rnd = rigged_round(
        ["", ""],
        mortos=(None, None),
        melds=(["3S 4S 5S JK 7S 8S 9S", "AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH"], []),
        phase=Phase.OVER,
    )
    team0, _ = score_round(rnd)
    assert team0.canastras == {"suja": 1, "limpa": 0, "real": 1}
    assert team0.canastra_bonus == 100 + 500


def test_both_partners_hands_count_against_the_team():
    rnd = rigged_round(["KD", "5S", "QD", "5C"], mortos=(None, None), phase=Phase.OVER)
    team0, team1 = score_round(rnd)
    assert team0.hand_penalty == -20 and team1.hand_penalty == -10


def test_morto_turned_into_stock_still_costs_the_penalty():
    rnd = rigged_round(["", ""], mortos=(None, None), phase=Phase.OVER)
    rnd.teams[1].took_morto = False
    assert score_round(rnd)[1].morto_penalty == -100
