"""Test-only helpers: name cards by code ("AH", "10S", "2C", "JK") and rig rounds."""

from __future__ import annotations

from app.engine.cards import Card, build_deck
from app.engine.game import Phase, Round
from app.engine.melds import analyse
from app.engine.presets import ABERTO, Preset

_RANKS = {"A": 1, "J": 11, "Q": 12, "K": 13}


class CardPool:
    """Hands out distinct physical cards by code, like taking them from two real decks."""

    def __init__(self) -> None:
        self._free = build_deck()

    def take(self, code: str) -> Card:
        rank, suit = _parse(code)
        for i, card in enumerate(self._free):
            if card.rank == rank and (card.suit.value if card.suit else None) == suit:
                return self._free.pop(i)
        raise ValueError(f"no copy of {code} left")

    def cards(self, codes: str) -> list[Card]:
        return [self.take(c) for c in codes.split()]

    def rest(self) -> list[Card]:
        rest, self._free = self._free, []
        return rest


def _parse(code: str) -> tuple[int, str | None]:
    if code == "JK":
        return 0, None
    rank, suit = code[:-1], code[-1]
    return (_RANKS[rank] if rank in _RANKS else int(rank)), suit


def cards(codes: str) -> list[Card]:
    return CardPool().cards(codes)


def rigged_round(
    hands: list[str],
    *,
    discard: str = "",
    stock: str | None = None,
    mortos: tuple[str | None, str | None] | None = None,
    melds: tuple[list[str], list[str]] = ([], []),
    preset: Preset = ABERTO,
    current: int = 0,
    phase: Phase = Phase.DRAW,
) -> Round:
    """A round with chosen cards. Unnamed cards fill the stock unless `stock` is given
    (then they are dropped, so the 108-card invariant does not hold for rigged rounds)."""
    rnd = Round(preset, num_players=len(hands), seed=0)
    pool = CardPool()
    rnd.hands = [pool.cards(h) for h in hands]
    rnd.discard = pool.cards(discard)
    for team, team_melds in zip(rnd.teams, melds):
        team.melds = []
        for codes in team_melds:
            meld_cards = pool.cards(codes)
            shape = analyse(meld_cards, preset)
            assert shape is not None, f"rigged meld {codes} is not valid"
            rnd._add_meld(rnd.teams.index(team), meld_cards, shape)
    for team, morto in zip(rnd.teams, mortos or (None, None)):
        team.morto = pool.cards(morto) if morto is not None else None
        team.took_morto = morto is None
    if mortos is None:
        for team in rnd.teams:
            team.morto = [pool.take(c) for c in ("3C", "4C", "5C")]
            team.took_morto = False
    rnd.stock = pool.cards(stock) if stock is not None else pool.rest()
    rnd.current = current
    rnd.phase = phase
    return rnd
