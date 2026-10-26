from app.engine.bots import GreedyBot
from app.engine.game import AddToMeld, Discard, Draw, LayDown, Phase, TakeDiscard

from .helpers import rigged_round

bot = GreedyBot()


def labels(rnd, ids):
    by_id = {c.id: c.label for c in rnd.cards_in_play()}
    return sorted(by_id[i] for i in ids)


def test_takes_pile_when_top_card_extends_a_meld():
    rnd = rigged_round(["9C KD QS", "5S 6S"], discard="4D 6H", melds=(["3H 4H 5H"], []))
    assert bot.choose(rnd, 0) == TakeDiscard()


def test_takes_pile_when_top_card_completes_a_new_meld():
    rnd = rigged_round(["9C 10C KD", "5S 6S"], discard="JC")
    assert bot.choose(rnd, 0) == TakeDiscard()


def test_draws_when_top_card_is_useless():
    rnd = rigged_round(["9C 10C KD", "5S 6S"], discard="4H")
    assert bot.choose(rnd, 0) == Draw()


def test_does_not_take_pile_for_a_wild():
    rnd = rigged_round(["9C 10C KD", "5S 6S"], discard="JK")
    assert bot.choose(rnd, 0) == Draw()


def test_extends_meld_with_natural_card_first():
    rnd = rigged_round(["6H 9C 10C JC KD", "5S 6S"], melds=(["3H 4H 5H"], []), phase=Phase.PLAY)
    action = bot.choose(rnd, 0)
    assert isinstance(action, AddToMeld) and labels(rnd, action.card_ids) == ["6H"]


def test_lays_down_a_natural_run():
    rnd = rigged_round(["9C 10C JC KD 4S", "5S 6S"], phase=Phase.PLAY)
    action = bot.choose(rnd, 0)
    assert isinstance(action, LayDown) and labels(rnd, action.card_ids) == ["10C", "9C", "JC"]


def test_uses_wild_only_to_complete_a_canastra():
    rnd = rigged_round(["JK 9D KD", "5S 6S"], melds=(["3H 4H 5H 6H 7H 8H"], []), phase=Phase.PLAY)
    action = bot.choose(rnd, 0)
    assert isinstance(action, AddToMeld) and labels(rnd, action.card_ids) == ["JK"]


def test_keeps_wild_on_a_short_meld():
    rnd = rigged_round(["JK 9D KS", "5S 6S"], melds=(["3H 4H 5H"], []), phase=Phase.PLAY)
    action = bot.choose(rnd, 0)
    assert isinstance(action, Discard) and labels(rnd, [action.card_id]) != ["JK"]


def test_discards_the_least_connected_card():
    rnd = rigged_round(["9C 10C 4D KS", "5S 6S"], phase=Phase.PLAY)
    action = bot.choose(rnd, 0)
    assert labels(rnd, [action.card_id]) == ["KS"]  # 4D and KS are both isolated; KS costs more


def test_goes_out_when_it_can():
    rnd = rigged_round(["4H", "5S 6S"], mortos=(None, "KD KC KS"),
                       melds=(["3S 4S 5S 6S 7S 8S 9S"], []), phase=Phase.PLAY)
    rnd.apply(0, bot.choose(rnd, 0))
    assert rnd.went_out == 0
