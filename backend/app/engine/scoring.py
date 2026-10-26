"""Round scoring (spec §8)."""

from __future__ import annotations

from dataclasses import dataclass

from .cards import ACE, Card
from .game import Round
from .melds import CanastraKind, canastra_kind
from .presets import Preset


def card_points(card: Card, preset: Preset) -> int:
    v = preset.card_values
    if card.is_joker:
        return v.joker
    if card.is_two:
        return v.two
    if card.rank == ACE:
        return v.ace
    return v.high if card.rank >= 8 else v.low


@dataclass(frozen=True)
class TeamScore:
    melded: int
    canastras: dict[str, int]
    canastra_bonus: int
    bater: int
    hand_penalty: int
    morto_penalty: int

    @property
    def total(self) -> int:
        return self.melded + self.canastra_bonus + self.bater + self.hand_penalty + self.morto_penalty


def score_round(rnd: Round) -> list[TeamScore]:
    p = rnd.preset
    bonus = {CanastraKind.SUJA: p.bonus_suja, CanastraKind.LIMPA: p.bonus_limpa, CanastraKind.REAL: p.bonus_real}
    scores = []
    for t, team in enumerate(rnd.teams):
        counts = {k.value: 0 for k in CanastraKind}
        canastra_bonus = 0
        for meld in team.melds:
            kind = canastra_kind(len(meld.cards), meld.shape, p)
            if kind:
                counts[kind.value] += 1
                canastra_bonus += bonus[kind]
        scores.append(TeamScore(
            melded=sum(card_points(c, p) for m in team.melds for c in m.cards),
            canastras=counts,
            canastra_bonus=canastra_bonus,
            bater=p.bonus_bater if rnd.went_out is not None and rnd.team_of(rnd.went_out) == t else 0,
            hand_penalty=-sum(card_points(c, p) for s in rnd.seats_of(t) for c in rnd.hands[s]),
            morto_penalty=0 if team.took_morto else -p.morto_not_taken_penalty,
        ))
    return scores
