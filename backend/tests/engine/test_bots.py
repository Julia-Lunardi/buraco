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


# --- STBL ---------------------------------------------------------------------------

from app.engine.presets import STBL  # noqa: E402


def test_stbl_bot_keeps_its_wild_until_the_team_has_a_clean_canastra():
    rnd = rigged_round(["JK 9D KS", "5S 6S"], melds=(["3H 4H 5H 6H 7H 8H"], []), phase=Phase.PLAY, preset=STBL)
    action = GreedyBot().choose(rnd, 0)
    assert not (isinstance(action, AddToMeld) and labels(rnd, action.card_ids) == ["JK"])


def test_stbl_bot_uses_the_wild_once_a_clean_canastra_exists():
    rnd = rigged_round(["JK 9D KS", "5S 6S"], melds=(["3H 4H 5H 6H 7H 8H", "4D 5D 6D 7D 8D 9D 10D"], []),
                       phase=Phase.PLAY, preset=STBL)
    action = GreedyBot().choose(rnd, 0)
    assert isinstance(action, AddToMeld) and labels(rnd, action.card_ids) == ["JK"]


@settings(max_examples=25, deadline=None)
@given(seed=st.integers(0, 2**32), n=st.sampled_from([2, 4]),
       levels=st.lists(st.sampled_from(sorted(BOTS)), min_size=4, max_size=4))
def test_stbl_rounds_end_and_going_out_is_always_clean(seed, n, levels):
    rnd = play_round(Round(STBL, n, seed), bots=[BOTS[level] for level in levels[:n]])
    assert rnd.phase is Phase.OVER
    if rnd.went_out is not None:
        melds = rnd.teams[rnd.team_of(rnd.went_out)].melds
        assert any(len(m.cards) >= 7 and m.shape.wilds == 0 for m in melds)
    for team in rnd.teams:
        assert all(m.shape.kind.value == "sequence" for m in team.melds)  # no trincas


@settings(max_examples=25, deadline=None)
@given(seed=st.integers(0, 2**32), n=st.sampled_from([2, 4]),
       levels=st.lists(st.sampled_from(sorted(BOTS)), min_size=4, max_size=4))
def test_fechado_rounds_end_with_every_bot_level(seed, n, levels):
    from app.engine.presets import FECHADO
    rnd = play_round(Round(FECHADO, n, seed), bots=[BOTS[level] for level in levels[:n]])
    assert rnd.phase is Phase.OVER


# --- lavadeiras (trincas) are a last resort -------------------------------------------

from app.engine.bots import LAVADEIRA_AFTER, stuck_turns  # noqa: E402


def stall(rnd, seat, turns):
    """Pretend `seat` played `turns` turns that drew and discarded without melding."""
    for _ in range(turns):
        rnd.history += [(seat, Draw()), (seat, Discard(-1))]


def test_holds_a_lavadeira_back_while_not_stuck():
    rnd = rigged_round(["7C 7D 7S KH 2D", "5S 6S"], phase=Phase.PLAY)
    stall(rnd, 0, LAVADEIRA_AFTER)
    assert isinstance(bot.choose(rnd, 0), Discard)


def test_lays_a_lavadeira_after_too_many_stuck_turns():
    rnd = rigged_round(["7C 7D 7S KH 2D", "5S 6S"], phase=Phase.PLAY)
    stall(rnd, 0, LAVADEIRA_AFTER + 1)
    action = bot.choose(rnd, 0)
    assert isinstance(action, LayDown) and labels(rnd, action.card_ids) == ["7C", "7D", "7S"]


def test_does_not_take_the_pile_for_a_lavadeira_while_not_stuck():
    rnd = rigged_round(["7C 7D KH 2D", "5S 6S"], discard="4H 7S")
    assert bot.choose(rnd, 0) == Draw()
    stall(rnd, 0, LAVADEIRA_AFTER + 1)
    assert bot.choose(rnd, 0) == TakeDiscard()


def test_still_grows_a_lavadeira_already_on_the_table():
    rnd = rigged_round(["7H KH 2D", "5S 6S"], melds=(["7C 7D 7S"], []), phase=Phase.PLAY)
    action = bot.choose(rnd, 0)
    assert isinstance(action, AddToMeld) and labels(rnd, action.card_ids) == ["7H"]


def test_a_meld_resets_the_stuck_count():
    rnd = rigged_round(["7C 7D 7S KH 2D", "5S 6S"], phase=Phase.PLAY)
    stall(rnd, 0, 5)
    rnd.history += [(1, Draw()), (1, Discard(-2)), (0, Draw()), (0, LayDown((1, 2, 3))), (0, Discard(-3))]
    stall(rnd, 0, 2)
    assert stuck_turns(rnd, 0) == 2
    rnd.history.append((0, LayDown((4, 5, 6))))  # this turn already melded
    assert stuck_turns(rnd, 0) == 0


def test_takes_pile_for_a_useful_card_below_the_top():
    rnd = rigged_round(["9C 10C KD", "5S 6S"], discard="JC 4H")
    assert bot.choose(rnd, 0) == TakeDiscard()


def test_takes_pile_when_a_buried_card_extends_a_meld():
    rnd = rigged_round(["9C KD QS", "5S 6S"], discard="6H 2C 4D", melds=(["3H 4H 5H"], []))
    assert bot.choose(rnd, 0) == TakeDiscard()


def test_draws_when_nothing_in_the_pile_is_useful():
    rnd = rigged_round(["9C 10C KD", "5S 6S"], discard="4H 7D JK")
    assert bot.choose(rnd, 0) == Draw()
