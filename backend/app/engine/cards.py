"""The 108-card buraco deck (R-CARD-1)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

JOKER = 0
ACE = 1
JACK = 11
QUEEN = 12
KING = 13

_RANK_LABELS = {JOKER: "JK", ACE: "A", JACK: "J", QUEEN: "Q", KING: "K"}


class Suit(str, Enum):
    SPADES = "S"
    HEARTS = "H"
    DIAMONDS = "D"
    CLUBS = "C"


@dataclass(frozen=True, slots=True)
class Card:
    """A physical card. `id` (0..107) tells the two copies of a card apart."""

    id: int
    rank: int  # 1..13, JOKER (0) for jokers
    suit: Suit | None  # None for jokers

    @property
    def is_joker(self) -> bool:
        return self.rank == JOKER

    @property
    def is_two(self) -> bool:
        return self.rank == 2

    @property
    def can_be_wild(self) -> bool:
        """Jokers and 2s (R-CARD-2). A 2 may still sit naturally in its own suit."""
        return self.is_joker or self.is_two

    @property
    def label(self) -> str:
        rank = _RANK_LABELS.get(self.rank, str(self.rank))
        return rank if self.is_joker else f"{rank}{self.suit.value}"

    def __str__(self) -> str:
        return self.label


def build_deck() -> list[Card]:
    """Two 52-card decks plus 4 jokers, in a fixed order (shuffle separately)."""
    cards: list[Card] = []
    for _ in range(2):
        for suit in Suit:
            for rank in range(ACE, KING + 1):
                cards.append(Card(len(cards), rank, suit))
    for _ in range(4):
        cards.append(Card(len(cards), JOKER, None))
    return cards
