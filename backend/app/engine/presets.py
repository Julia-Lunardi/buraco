"""Rule presets. Every value here maps to a row of docs/rules/aberto.md §9."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class DiscardPickup(str, Enum):
    FREE = "free"  # Aberto, STBL: take the whole pile any time
    MUST_USE_TOP_CARD = "must_use_top_card"  # Fechado (not implemented yet)


class GoOutRequires(str, Enum):
    ANY_CANASTRA = "any_canastra"
    CLEAN_CANASTRA = "clean_canastra"  # STBL: "bate limpo"


@dataclass(frozen=True)
class CardValues:
    joker: int = 20
    two: int = 10
    ace: int = 15
    high: int = 10  # 8 to K
    low: int = 5  # 3 to 7


@dataclass(frozen=True)
class Preset:
    name: str
    trincas_allowed: bool
    discard_pickup: DiscardPickup
    go_out_requires: GoOutRequires
    max_wilds_per_meld: int = 1
    canastra_extendable: bool = True
    untaken_morto_becomes_stock: bool = True
    go_out_by_meld_allowed: bool = True
    card_values: CardValues = field(default_factory=CardValues)
    hand_size: int = 11
    canastra_size: int = 7
    bonus_suja: int = 100
    bonus_limpa: int = 200
    bonus_real: int = 500
    bonus_bater: int = 100
    morto_not_taken_penalty: int = 100
    target_score: int = 3000


ABERTO = Preset(
    name="aberto",
    trincas_allowed=True,
    discard_pickup=DiscardPickup.FREE,
    go_out_requires=GoOutRequires.ANY_CANASTRA,
)

PRESETS = {p.name: p for p in (ABERTO,)}
