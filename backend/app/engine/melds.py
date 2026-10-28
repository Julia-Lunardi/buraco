"""Meld validation: sequences (R-MELD-2), trincas (R-MELD-3), wilds (R-MELD-4) and
canastras (R-CAN-*). Melds are judged from their full card set every time, so a
2 that lands in its natural place counts as natural (R-CARD-3)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum

from .cards import ACE, Card
from .presets import Preset

HIGH_ACE = 14
MAX_SEQUENCE = 14  # A-2-...-K-A


class MeldKind(str, Enum):
    SEQUENCE = "sequence"
    TRINCA = "trinca"


class CanastraKind(str, Enum):
    SUJA = "suja"
    LIMPA = "limpa"
    REAL = "real"


@dataclass(frozen=True)
class MeldShape:
    kind: MeldKind
    wilds: int
    suit: str | None = None  # sequences
    low: int | None = None  # sequences: span on 1..14 (14 = high ace)
    high: int | None = None
    rank: int | None = None  # trincas


def analyse(cards: Sequence[Card], preset: Preset, kind: MeldKind | None = None) -> MeldShape | None:
    """The cleanest legal reading of `cards` as one meld, or None. `kind` pins the
    meld type when extending an existing meld."""
    options = []
    if kind in (None, MeldKind.SEQUENCE):
        options.append(_as_sequence(cards, preset.max_wilds_per_meld))
    if kind in (None, MeldKind.TRINCA) and preset.trincas_allowed:
        options.append(_as_trinca(cards, preset.max_wilds_per_meld))
    valid = [o for o in options if o is not None]
    return min(valid, key=lambda s: s.wilds) if valid else None


def canastra_kind(size: int, shape: MeldShape, preset: Preset) -> CanastraKind | None:
    if size < preset.canastra_size:
        return None
    if shape.wilds:
        return CanastraKind.SUJA
    if shape.kind is MeldKind.SEQUENCE and size == MAX_SEQUENCE:
        return CanastraKind.REAL
    return CanastraKind.LIMPA


def in_order(cards: Sequence[Card], shape: MeldShape) -> list[Card]:
    """The meld as it should lie on the table, whatever order its cards were played in.
    Sequences run low to high, each wild in the slot it stands for (a natural 2 in the 2's
    place, an ace low or high as the span says). Trincas: naturals by suit, then wilds."""
    if shape.kind is MeldKind.TRINCA:
        return sorted(cards, key=lambda c: (c.can_be_wild, c.suit.value if c.suit else "", c.id))
    slots: dict[int, Card] = {}
    spare: list[Card] = []
    # A 2 of the meld's suit counts as natural when the shape has fewer wilds than wild-capable cards.
    natural_two = sum(c.can_be_wild for c in cards) > shape.wilds
    for card in sorted(cards, key=lambda c: c.id):
        rank = card.rank
        if card.is_joker or (card.is_two and not (natural_two and card.suit and card.suit.value == shape.suit
                                                     and 2 not in slots)):
            spare.append(card)
            continue
        if rank == ACE and shape.high == HIGH_ACE and (shape.low != ACE or ACE in slots):
            rank = HIGH_ACE
        if rank in slots or not shape.low <= rank <= shape.high:
            spare.append(card)  # cannot happen for a valid shape; never lose a card
            continue
        slots[rank] = card
    ordered = []
    for rank in range(shape.low, shape.high + 1):
        ordered.append(slots[rank] if rank in slots else spare.pop(0) if spare else None)
    return [c for c in ordered if c is not None] + spare


def _as_sequence(cards: Sequence[Card], max_wilds: int) -> MeldShape | None:
    n = len(cards)
    if not 3 <= n <= MAX_SEQUENCE:
        return None
    naturals = [c for c in cards if not c.can_be_wild]
    twos = [c for c in cards if c.is_two]
    jokers = [c for c in cards if c.is_joker]
    suits = {c.suit for c in naturals}
    if len(suits) > 1:
        return None
    # With no other naturals, a suited 2 is the only thing that can set the suit.
    candidate_suits = suits or {t.suit for t in twos}

    best: MeldShape | None = None
    for suit in candidate_suits:
        # At most one 2 can sit in the "2" slot; any other 2 is wild.
        natural_two_options = (True, False) if any(t.suit == suit for t in twos) else (False,)
        for natural_two in natural_two_options:
            wilds = len(jokers) + len(twos) - (1 if natural_two else 0)
            if wilds > max_wilds or (best and wilds >= best.wilds):
                continue
            ranks = [c.rank for c in naturals] + ([2] if natural_two else [])
            span = _fit_span(ranks, n)
            if span:
                best = MeldShape(MeldKind.SEQUENCE, wilds, suit=suit.value, low=span[0], high=span[1])
    return best


def _fit_span(ranks: list[int], n: int) -> tuple[int, int] | None:
    """Place the natural ranks in a run of n consecutive slots on 1..14, trying each
    ace low (1) or high (14). Wilds fill whatever slots remain."""
    if not ranks:
        return None
    aces = ranks.count(ACE)
    others = [r for r in ranks if r != ACE]
    for high_aces in range(aces + 1):
        placed = others + [HIGH_ACE] * high_aces + [ACE] * (aces - high_aces)
        if len(set(placed)) != len(placed):
            continue
        lo, hi = min(placed), max(placed)
        start, last_start = max(1, hi - n + 1), min(lo, HIGH_ACE - n + 1)
        if start <= last_start:
            return start, start + n - 1
    return None


def _as_trinca(cards: Sequence[Card], max_wilds: int) -> MeldShape | None:
    if len(cards) < 3:
        return None
    naturals = [c for c in cards if not c.can_be_wild]
    wilds = len(cards) - len(naturals)
    ranks = {c.rank for c in naturals}
    if len(ranks) != 1 or wilds > max_wilds or len(naturals) <= wilds:
        return None
    return MeldShape(MeldKind.TRINCA, wilds, rank=ranks.pop())
