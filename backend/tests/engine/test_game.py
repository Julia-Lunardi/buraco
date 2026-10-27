import pytest

from app.engine.game import (
    AddToMeld,
    Discard,
    Draw,
    IllegalMove,
    LayDown,
    Phase,
    Round,
    TakeDiscard,
)
from app.engine.presets import ABERTO

from .helpers import rigged_round


def ids(rnd: Round, seat: int, codes: str) -> tuple[int, ...]:
    """Ids of cards in a seat's hand, by code, picking distinct copies."""
    hand = list(rnd.hands[seat])
    out = []
    for code in codes.split():
        card = next(c for c in hand if c.label == code)
        hand.remove(card)
        out.append(card.id)
    return tuple(out)


def illegal(rnd: Round, seat: int, action, code: str) -> None:
    with pytest.raises(IllegalMove) as exc:
        rnd.apply(seat, action)
    assert exc.value.code == code


# --- deal (R-DEAL-*) --------------------------------------------------------

@pytest.mark.parametrize("players", [2, 4])
def test_deal(players):
    rnd = Round(ABERTO, players, seed=1)
    assert [len(h) for h in rnd.hands] == [11] * players
    assert [len(t.morto) for t in rnd.teams] == [11, 11]
    assert len(rnd.discard) == 1
    assert len(rnd.cards_in_play()) == 108
    assert sorted(c.id for c in rnd.cards_in_play()) == list(range(108))


def test_same_seed_same_deal():
    a, b = Round(ABERTO, 4, seed="table-42"), Round(ABERTO, 4, seed="table-42")
    assert a.hands == b.hands and a.stock == b.stock


def test_only_two_or_four_players():
    with pytest.raises(ValueError):
        Round(ABERTO, 3, seed=1)


def test_partners_sit_opposite():
    rnd = Round(ABERTO, 4, seed=1)
    assert [rnd.team_of(s) for s in range(4)] == [0, 1, 0, 1]


# --- turn order and phases --------------------------------------------------

def test_draw_from_stock():
    rnd = rigged_round(["3H 4H", "5S 6S"], discard="KD")
    top = rnd.stock[-1]
    rnd.apply(0, Draw())
    assert top in rnd.hands[0] and rnd.phase is Phase.PLAY


def test_take_whole_discard_pile_in_aberto():
    rnd = rigged_round(["3H 4H", "5S 6S"], discard="KD 9C 7S")
    rnd.apply(0, TakeDiscard())
    assert len(rnd.hands[0]) == 5 and rnd.discard == []


def test_cannot_take_empty_pile():
    rnd = rigged_round(["3H 4H", "5S 6S"])
    illegal(rnd, 0, TakeDiscard(), "discard_empty")


def test_not_your_turn():
    rnd = rigged_round(["3H 4H", "5S 6S"])
    illegal(rnd, 1, Draw(), "not_your_turn")


def test_must_draw_before_discarding():
    rnd = rigged_round(["3H 4H", "5S 6S"])
    illegal(rnd, 0, Discard(ids(rnd, 0, "3H")[0]), "wrong_phase")


def test_cannot_draw_twice():
    rnd = rigged_round(["3H 4H", "5S 6S"])
    rnd.apply(0, Draw())
    illegal(rnd, 0, Draw(), "wrong_phase")


def test_discard_passes_the_turn():
    rnd = rigged_round(["3H 4H", "5S 6S"])
    rnd.apply(0, Draw())
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert rnd.current == 1 and rnd.phase is Phase.DRAW
    assert rnd.discard[-1].label == "3H"


def test_turn_order_with_four_players():
    rnd = rigged_round(["3H 4H", "5S 6S", "7D 8D", "9C 10C"], current=3)
    rnd.apply(3, Draw())
    rnd.apply(3, Discard(ids(rnd, 3, "9C")[0]))
    assert rnd.current == 0


def test_card_must_be_in_hand():
    rnd = rigged_round(["3H 4H", "5S 6S"])
    rnd.apply(0, Draw())
    illegal(rnd, 0, Discard(ids(rnd, 1, "5S")[0]), "not_in_hand")


# --- melding (R-MELD-*) -----------------------------------------------------

def test_lay_down_a_sequence():
    rnd = rigged_round(["3H 4H 5H 9C KD", "5S 6S"], phase=Phase.PLAY)
    rnd.apply(0, LayDown(ids(rnd, 0, "3H 4H 5H")))
    assert len(rnd.teams[0].melds) == 1 and len(rnd.hands[0]) == 2


def test_lay_down_invalid_meld():
    rnd = rigged_round(["3H 4H 6H 9C KD", "5S 6S"], phase=Phase.PLAY)
    illegal(rnd, 0, LayDown(ids(rnd, 0, "3H 4H 6H")), "invalid_meld")


def test_extend_own_team_meld():
    rnd = rigged_round(["6H 9C KD", "5S 6S"], melds=(["3H 4H 5H"], []), phase=Phase.PLAY)
    meld = rnd.teams[0].melds[0]
    rnd.apply(0, AddToMeld(meld.id, ids(rnd, 0, "6H")))
    assert len(meld.cards) == 4


def test_cannot_extend_opponents_meld():
    rnd = rigged_round(["6H 9C KD", "5S 6S"], melds=([], ["3H 4H 5H"]), phase=Phase.PLAY)
    meld = rnd.teams[1].melds[0]
    illegal(rnd, 0, AddToMeld(meld.id, ids(rnd, 0, "6H")), "not_your_meld")


def test_partner_extends_team_meld():
    rnd = rigged_round(["9C KD", "5S 6S", "6H QC JD", "8D 9D"], melds=(["3H 4H 5H"], []),
                       current=2, phase=Phase.PLAY)
    meld = rnd.teams[0].melds[0]
    rnd.apply(2, AddToMeld(meld.id, ids(rnd, 2, "6H")))
    assert len(meld.cards) == 4


def test_extension_must_stay_valid():
    rnd = rigged_round(["8H 9C KD", "5S 6S"], melds=(["3H 4H 5H"], []), phase=Phase.PLAY)
    meld = rnd.teams[0].melds[0]
    illegal(rnd, 0, AddToMeld(meld.id, ids(rnd, 0, "8H")), "cannot_extend")


def test_second_wild_is_rejected():
    rnd = rigged_round(["JK 9C KD", "5S 6S"], melds=(["3H 2S 5H"], []), phase=Phase.PLAY)
    meld = rnd.teams[0].melds[0]
    illegal(rnd, 0, AddToMeld(meld.id, ids(rnd, 0, "JK")), "cannot_extend")


def test_canastra_keeps_growing():
    rnd = rigged_round(["10H 9C KD", "5S 6S"], melds=(["3H 4H 5H 6H 7H 8H 9H"], []),
                       phase=Phase.PLAY)
    meld = rnd.teams[0].melds[0]
    rnd.apply(0, AddToMeld(meld.id, ids(rnd, 0, "10H")))
    assert len(meld.cards) == 8


# --- morto (R-MORTO-*) ------------------------------------------------------

def test_morto_direto_when_hand_empties_by_melding():
    rnd = rigged_round(["3H 4H 5H", "5S 6S"], mortos=("9C 9D 9S", "KD KC KS"), phase=Phase.PLAY)
    rnd.apply(0, LayDown(ids(rnd, 0, "3H 4H 5H")))
    assert [c.label for c in rnd.hands[0]] == ["9C", "9D", "9S"]
    assert rnd.teams[0].took_morto and rnd.teams[0].morto is None
    assert rnd.current == 0 and rnd.phase is Phase.PLAY  # keeps playing


def test_morto_indireto_when_hand_empties_by_discarding():
    rnd = rigged_round(["3H", "5S 6S"], mortos=("9C 9D 9S", "KD KC KS"), phase=Phase.PLAY)
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert [c.label for c in rnd.hands[0]] == ["9C", "9D", "9S"]
    assert rnd.current == 1  # the turn still passes


def test_partner_cannot_take_the_team_morto_twice():
    rnd = rigged_round(["3H 4H 5H", "5S 6S", "7D 8D", "9C 10C"],
                       mortos=(None, "KD KC KS"), current=0, phase=Phase.PLAY)
    illegal(rnd, 0, LayDown(ids(rnd, 0, "3H 4H 5H")), "keep_a_card")


# --- going out (R-OUT-*) ----------------------------------------------------

CANASTRA = "3S 4S 5S 6S 7S 8S 9S"


def test_go_out_by_discarding_last_card():
    rnd = rigged_round(["3H", "5S 6S"], mortos=(None, "KD KC KS"), melds=([CANASTRA], []),
                       phase=Phase.PLAY)
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert rnd.phase is Phase.OVER and rnd.went_out == 0


def test_go_out_by_melding_last_cards():
    rnd = rigged_round(["3H 4H 5H", "5S 6S"], mortos=(None, "KD KC KS"), melds=([CANASTRA], []),
                       phase=Phase.PLAY)
    rnd.apply(0, LayDown(ids(rnd, 0, "3H 4H 5H")))
    assert rnd.phase is Phase.OVER and rnd.went_out == 0


def test_canastra_made_this_turn_counts_for_going_out():
    rnd = rigged_round(["9S 3H", "5S 6S"], mortos=(None, "KD KC KS"),
                       melds=(["3S 4S 5S 6S 7S 8S"], []), phase=Phase.PLAY)
    rnd.apply(0, AddToMeld(rnd.teams[0].melds[0].id, ids(rnd, 0, "9S")))
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert rnd.went_out == 0


def test_cannot_go_out_without_a_canastra():
    rnd = rigged_round(["3H", "5S 6S"], mortos=(None, "KD KC KS"), phase=Phase.PLAY)
    illegal(rnd, 0, Discard(ids(rnd, 0, "3H")[0]), "cannot_discard_last")


def test_cannot_meld_down_to_one_card_without_a_canastra():
    rnd = rigged_round(["3H 4H 5H 9C", "5S 6S"], mortos=(None, "KD KC KS"), phase=Phase.PLAY)
    illegal(rnd, 0, LayDown(ids(rnd, 0, "3H 4H 5H")), "keep_a_card")


def test_cannot_go_out_while_morto_waits():
    # A canastra is not enough: the team still has its morto, so emptying the hand takes it.
    rnd = rigged_round(["3H", "5S 6S"], mortos=("9C 9D 9S", "KD KC KS"), melds=([CANASTRA], []),
                       phase=Phase.PLAY)
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert rnd.phase is not Phase.OVER and rnd.teams[0].took_morto


def test_no_moves_after_round_is_over():
    rnd = rigged_round(["3H", "5S 6S"], mortos=(None, "KD KC KS"), melds=([CANASTRA], []),
                       phase=Phase.PLAY)
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    illegal(rnd, 1, Draw(), "round_over")


# --- stock runs out (R-MORTO-3, R-OUT-3) ------------------------------------

def test_untaken_morto_becomes_the_stock():
    rnd = rigged_round(["3H 4H", "5S 6S"], stock="", mortos=(None, "KD KC KS"), phase=Phase.PLAY)
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert [c.label for c in rnd.stock] == ["KD", "KC", "KS"]
    assert rnd.teams[1].morto is None and not rnd.teams[1].took_morto


def test_round_ends_when_stock_and_mortos_are_gone():
    rnd = rigged_round(["3H 4H", "5S 6S"], stock="", mortos=(None, None), phase=Phase.PLAY)
    rnd.apply(0, Discard(ids(rnd, 0, "3H")[0]))
    assert rnd.phase is Phase.OVER and rnd.went_out is None


def test_team_whose_morto_became_stock_can_go_out_with_a_canastra():
    rnd = rigged_round(["3H 4H", "6S"], stock="QH QD", mortos=(None, None),
                       melds=([], [CANASTRA]), current=1, phase=Phase.PLAY)
    rnd.teams[1].took_morto = False  # its morto was turned into the stock earlier
    rnd.apply(1, Discard(ids(rnd, 1, "6S")[0]))
    assert rnd.went_out == 1


# --- check() never mutates ---------------------------------------------------

def test_check_does_not_change_state():
    rnd = rigged_round(["3H 4H 5H 9C", "5S 6S"], phase=Phase.PLAY)
    before = [list(h) for h in rnd.hands]
    rnd.check(0, LayDown(ids(rnd, 0, "3H 4H 5H")))
    assert rnd.hands == before and rnd.teams[0].melds == []


# --- hidden information -----------------------------------------------------

def test_view_shows_only_own_hand():
    rnd = Round(ABERTO, 4, seed=3)
    view = rnd.view_for(2)
    assert view["hand"] == [{"id": c.id, "label": c.label} for c in rnd.hands[2]]
    assert view["hand_sizes"] == [11, 11, 11, 11]
    assert "hands" not in view and "stock" not in view
    assert view["stock_size"] == len(rnd.stock)


# --- Fechado: the pile only by using its top card (R-PILE-F) ------------------------

from app.engine.presets import FECHADO  # noqa: E402


def test_fechado_refuses_a_plain_pickup():
    rnd = rigged_round(["5H 6H KC", "5S 6S"], discard="QD 7H", preset=FECHADO)
    illegal(rnd, 0, TakeDiscard(), "must_use_top_card")


def test_fechado_pickup_with_a_new_meld():
    rnd = rigged_round(["5H 6H KC", "5S 6S"], discard="QD 7H", preset=FECHADO)
    rnd.apply(0, TakeDiscard(use_with=ids(rnd, 0, "5H 6H")))
    [meld] = rnd.teams[0].melds
    assert sorted(c.label for c in meld.cards) == ["5H", "6H", "7H"]
    assert sorted(c.label for c in rnd.hands[0]) == ["KC", "QD"]  # the rest of the pile joins the hand
    assert rnd.discard == [] and rnd.phase is Phase.PLAY


def test_fechado_pickup_extending_a_team_meld():
    rnd = rigged_round(["KC QS", "5S 6S"], discard="QD 7H", melds=(["4H 5H 6H"], []), preset=FECHADO)
    meld = rnd.teams[0].melds[0]
    rnd.apply(0, TakeDiscard(meld_id=meld.id))
    assert len(meld.cards) == 4 and sorted(c.label for c in rnd.hands[0]) == ["KC", "QD", "QS"]


def test_fechado_top_card_must_actually_fit():
    rnd = rigged_round(["5H 9H KC", "5S 6S"], discard="QD 7H", melds=([], ["4D 5D 6D"]), preset=FECHADO)
    illegal(rnd, 0, TakeDiscard(use_with=ids(rnd, 0, "5H 9H")), "invalid_meld")
    illegal(rnd, 0, TakeDiscard(meld_id=rnd.teams[1].melds[0].id), "not_your_meld")
    assert rnd.discard and rnd.phase is Phase.DRAW  # nothing moved


def test_aberto_pickup_takes_no_meld():
    rnd = rigged_round(["5H 6H KC", "5S 6S"], discard="QD 7H")
    illegal(rnd, 0, TakeDiscard(use_with=ids(rnd, 0, "5H 6H")), "pile_is_free")
