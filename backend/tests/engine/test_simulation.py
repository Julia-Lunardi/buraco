"""Phase-1 definition of done: bots play complete games with no illegal states."""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.engine.game import Phase, Round
from app.engine.presets import ABERTO
from app.engine.scoring import score_round
from app.engine.simulate import play_match, play_round

seeds = st.integers(min_value=0, max_value=2**32)
players = st.sampled_from([2, 4])


def check_invariants(rnd: Round, *_):
    cards = rnd.cards_in_play()
    assert len(cards) == 108 and len({c.id for c in cards}) == 108  # R-CARD-4
    assert all(len(h) > 0 for h in rnd.hands) or rnd.phase is Phase.OVER
    for team in rnd.teams:
        for meld in team.melds:
            assert meld.shape.wilds <= rnd.preset.max_wilds_per_meld
            assert len(meld.cards) >= 3


@settings(max_examples=60, deadline=None)
@given(seed=seeds, n=players)
def test_every_round_ends_with_108_cards_accounted_for(seed, n):
    rnd = play_round(Round(ABERTO, n, seed), on_action=check_invariants)
    assert rnd.phase is Phase.OVER


@settings(max_examples=60, deadline=None)
@given(seed=seeds, n=players)
def test_going_out_always_meets_the_requirements(seed, n):
    rnd = play_round(Round(ABERTO, n, seed))
    if rnd.went_out is not None:
        team = rnd.teams[rnd.team_of(rnd.went_out)]
        assert team.morto is None
        assert any(len(m.cards) >= ABERTO.canastra_size for m in team.melds)
        assert rnd.hands[rnd.went_out] == []


@settings(max_examples=60, deadline=None)
@given(seed=seeds, n=players)
def test_views_never_leak_other_hands(seed, n):
    def check(rnd, *_):
        for seat in range(n):
            view = rnd.view_for(seat)
            assert view["hand"] == [{"id": c.id, "label": c.label} for c in rnd.hands[seat]]
            assert "hands" not in view and "stock" not in view
    play_round(Round(ABERTO, n, seed), on_action=check)


@pytest.mark.parametrize("n", [2, 4])
def test_full_matches_reach_the_target(n):
    for seed in range(5):
        match = play_match(ABERTO, n, seed=f"m{seed}")
        assert match.winner is not None
        assert max(match.scores) >= ABERTO.target_score
        assert sum(r.total for r in [h[match.winner] for h in match.history]) == match.scores[match.winner]


def test_replay_is_deterministic():
    first = play_round(Round(ABERTO, 4, seed="replay"))
    second = Round(ABERTO, 4, seed="replay")
    for seat, action in first.history:
        second.apply(seat, action)
    assert score_round(first) == score_round(second)
    assert second.phase is Phase.OVER
