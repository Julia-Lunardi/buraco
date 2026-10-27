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


# --- levels -----------------------------------------------------------------------

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from app.engine.bots import BOTS, RelaxedBot, SharpBot  # noqa: E402
from app.engine.game import Round  # noqa: E402
from app.engine.presets import ABERTO  # noqa: E402
from app.engine.simulate import play_round  # noqa: E402


def test_sharp_keeps_a_card_that_would_feed_the_opponents():
    # KC-QC and 4D-3D are pairs worth keeping, so 5H is the only loose card: the standard bot
    # throws it. But 5H extends the opponents' 6H-7H-8H, handing them the pile: sharp keeps it.
    rnd = rigged_round(["5H KC QC 4D 3D", "5S 6S"], melds=([], ["6H 7H 8H"]), phase=Phase.PLAY)
    assert labels(rnd, [GreedyBot().choose(rnd, 0).card_id]) == ["5H"]
    assert labels(rnd, [SharpBot().choose(rnd, 0).card_id]) != ["5H"]


@settings(max_examples=25, deadline=None)
@given(seed=st.integers(0, 2**32), n=st.sampled_from([2, 4]),
       levels=st.lists(st.sampled_from(sorted(BOTS)), min_size=4, max_size=4))
def test_every_level_plays_legally_to_the_end(seed, n, levels):
    rnd = play_round(Round(ABERTO, n, seed), bots=[BOTS[level] for level in levels[:n]])
    assert rnd.phase is Phase.OVER


def test_relaxed_bot_is_reproducible():
    first = play_round(Round(ABERTO, 2, "relaxed-replay"), bots=[RelaxedBot(), RelaxedBot()])
    second = play_round(Round(ABERTO, 2, "relaxed-replay"), bots=[RelaxedBot(), RelaxedBot()])
    assert first.history == second.history
