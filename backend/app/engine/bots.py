"""Bots are ordinary clients of the engine: they read their own hand plus public
state and return one action at a time, which goes through the same `apply()`.

Three levels (design: relaxed / standard / sharp):
- GreedyBot ("standard"): melds what it can, keeps wilds for canastras, takes the pile only
  for a card it can use at once. Lavadeiras (trincas) are a last resort: they jam the game for
  both teams, so a bot only starts one after LAVADEIRA_AFTER turns without melding anything.
- SharpBot: standard, plus Aberto's key skill: never feed the opponents. Anyone may take
  the whole discard pile at any time in Aberto, so a discard that fits an opponent meld
  hands them the pile.
- RelaxedBot: human slips (sometimes a loose discard, sometimes holding melds back), seeded
  from the game state so a game is reproducible.
STBL-specific strategy (avoid wilds, clean canastras) arrives with the STBL preset.
"""

from __future__ import annotations

import random
from collections import defaultdict
from collections.abc import Sequence

from .cards import ACE, Card
from .game import Action, AddToMeld, Discard, Draw, LayDown, Phase, Round, TakeDiscard
from .melds import CanastraKind, analyse, canastra_kind
from .presets import DiscardPickup, GoOutRequires
from .scoring import card_points

LAVADEIRA_AFTER = 3  # own turns in a row without laying down or adding to a meld



class GreedyBot:
    def choose(self, rnd: Round, seat: int) -> Action:
        if rnd.phase is Phase.DRAW:
            return self._draw(rnd, seat)
        return self._meld(rnd, seat) or self._discard(rnd, seat)

    # --- draw ---------------------------------------------------------------

    def _draw(self, rnd: Round, seat: int) -> Action:
        if not rnd.discard:
            return Draw()
        top = rnd.discard[-1]
        if rnd.preset.discard_pickup is DiscardPickup.MUST_USE_TOP_CARD:
            # Fechado: the move itself says how the top card is used.
            for action in self._fechado_pickups(rnd, seat, top, lavadeiras_ok(rnd, seat)):
                if rnd.is_legal(seat, action):
                    return action
            return Draw()
        if self._fits(rnd, seat, top):
            return TakeDiscard()
        return Draw()

    def _fechado_pickups(self, rnd: Round, seat: int, top: Card, trincas: bool):
        if top.can_be_wild:
            return
        for meld in rnd.teams[rnd.team_of(seat)].melds:
            extended = analyse(meld.cards + [top], rnd.preset, meld.shape.kind)
            if extended and extended.wilds == meld.shape.wilds:
                yield TakeDiscard(meld_id=meld.id)
        for group in sorted(candidate_melds(rnd.hands[seat] + [top], rnd, trincas), key=len, reverse=True):
            if top in group:
                yield TakeDiscard(use_with=tuple(c.id for c in group if c is not top))

    def _fits(self, rnd: Round, seat: int, card: Card) -> bool:
        """Only take the pile for a natural card we can meld right away. Besides being
        sensible, it guarantees the pile can't bounce between players forever."""
        if card.can_be_wild:
            return False
        for meld in rnd.teams[rnd.team_of(seat)].melds:
            extended = analyse(meld.cards + [card], rnd.preset, meld.shape.kind)
            if extended and extended.wilds == meld.shape.wilds:
                return True
        trincas = lavadeiras_ok(rnd, seat)
        return any(card in group for group in candidate_melds(rnd.hands[seat] + [card], rnd, trincas))

    # --- meld ---------------------------------------------------------------

    def _meld(self, rnd: Round, seat: int) -> Action | None:
        hand = rnd.hands[seat]
        melds = rnd.teams[rnd.team_of(seat)].melds

        # 1. Extend team melds with cards that keep them as clean as they are.
        for meld in melds:
            for card in hand:
                if card.is_joker:
                    continue
                extended = analyse(meld.cards + [card], rnd.preset, meld.shape.kind)
                action = AddToMeld(meld.id, (card.id,))
                if extended and extended.wilds == meld.shape.wilds and rnd.is_legal(seat, action):
                    return action

        # 2. Lay down new natural melds, longest first. A new lavadeira only when stuck.
        for group in sorted(candidate_melds(hand, rnd, lavadeiras_ok(rnd, seat)), key=len, reverse=True):
            action = LayDown(tuple(c.id for c in group))
            if rnd.is_legal(seat, action):
                return action

        # 3. Spend a wild only to complete a canastra. In STBL a wild makes that canastra suja,
        #    which can't take the team out: only do it once the team already has a clean one.
        size = rnd.preset.canastra_size
        if rnd.preset.go_out_requires is GoOutRequires.CLEAN_CANASTRA and not _has_clean_canastra(rnd, seat):
            return None
        for wild in (c for c in hand if c.can_be_wild):
            for meld in melds:
                if len(meld.cards) == size - 1:
                    action = AddToMeld(meld.id, (wild.id,))
                    if rnd.is_legal(seat, action):
                        return action
        return None

    # --- discard ------------------------------------------------------------

    def _discard(self, rnd: Round, seat: int) -> Action:
        hand = rnd.hands[seat]
        pool = [c for c in hand if not c.can_be_wild] or hand
        ranked = sorted(pool, key=lambda c: (self._usefulness(rnd, seat, c), -card_points(c, rnd.preset), c.id))
        for card in ranked:
            action = Discard(card.id)
            if rnd.is_legal(seat, action):
                return action
        raise RuntimeError(f"bot at seat {seat} has no legal discard")  # R-MELD-6 should make this unreachable

    def _usefulness(self, rnd: Round, seat: int, card: Card) -> int:
        score = 0
        trincas = lavadeiras_ok(rnd, seat)  # until then a pair isn't worth keeping
        for other in rnd.hands[seat]:
            if other is card or other.can_be_wild:
                continue
            if other.suit == card.suit:
                gap = _rank_gap(card.rank, other.rank)
                score += {1: 2, 2: 1}.get(gap, 0)
            if trincas and other.rank == card.rank:
                score += 1
        for meld in rnd.teams[rnd.team_of(seat)].melds:
            if analyse(meld.cards + [card], rnd.preset, meld.shape.kind):
                score += 5
        return score


def _has_clean_canastra(rnd: Round, seat: int) -> bool:
    return any(canastra_kind(len(m.cards), m.shape, rnd.preset) in (CanastraKind.LIMPA, CanastraKind.REAL)
               for m in rnd.teams[rnd.team_of(seat)].melds)


def stuck_turns(rnd: Round, seat: int) -> int:
    """How many of `seat`'s own turns in a row, most recent first, ended without it laying
    down or adding to a meld. A turn in progress that already melded resets it to 0."""
    stuck, melded = 0, False
    for s, action in reversed(rnd.history):
        if s != seat:
            continue
        if isinstance(action, Discard):  # walking backwards, a discard closes the turn before it
            stuck, melded = stuck + 1, False
        elif isinstance(action, (LayDown, AddToMeld)) or (isinstance(action, TakeDiscard) and action.use_with):
            melded = True
            break
    return stuck - 1 if melded and stuck else stuck


def lavadeiras_ok(rnd: Round, seat: int) -> bool:
    """A lavadeira (trinca) jams the table for both teams: start one only as a last resort."""
    return rnd.preset.trincas_allowed and stuck_turns(rnd, seat) > LAVADEIRA_AFTER


def candidate_melds(cards: Sequence[Card], rnd: Round, trincas: bool = True) -> list[list[Card]]:
    """Natural (wild-free) sequences, and trincas if `trincas`, that can be formed from `cards`."""
    out: list[list[Card]] = []
    naturals = [c for c in cards if not c.can_be_wild]

    by_suit: dict[object, dict[int, Card]] = defaultdict(dict)
    for c in naturals:
        by_suit[c.suit].setdefault(c.rank, c)
    for ranks in by_suit.values():
        for ace_value in (1, 14):
            values = {(ace_value if r == ACE else r): c for r, c in ranks.items()}
            run: list[Card] = []
            prev = None
            for v in sorted(values):
                if prev is not None and v == prev + 1:
                    run.append(values[v])
                else:
                    if len(run) >= 3:
                        out.append(run)
                    run = [values[v]]
                prev = v
            if len(run) >= 3:
                out.append(run)

    if trincas and rnd.preset.trincas_allowed:
        by_rank: dict[int, list[Card]] = defaultdict(list)
        for c in naturals:
            by_rank[c.rank].append(c)
        out += [group for group in by_rank.values() if len(group) >= 3]
    return out


def _rank_gap(a: int, b: int) -> int:
    gap = abs(a - b)
    if ACE in (a, b):  # an ace also sits next to the king
        gap = min(gap, abs((14 if a == ACE else a) - (14 if b == ACE else b)))
    return gap


class SharpBot(GreedyBot):
    """Discards dead cards: a card that would extend an opponent's meld (or sits right next to
    one) invites them to take the whole pile, so it is kept unless nothing else is left."""

    FEEDS_OPPONENT = 8
    NEAR_OPPONENT = 3

    def _usefulness(self, rnd: Round, seat: int, card: Card) -> int:
        score = super()._usefulness(rnd, seat, card)
        for meld in rnd.teams[1 - rnd.team_of(seat)].melds:
            if analyse(meld.cards + [card], rnd.preset, meld.shape.kind):
                score += self.FEEDS_OPPONENT
            elif meld.shape.kind.value == "sequence" and meld.shape.suit == (card.suit.value if card.suit else None):
                lo, hi = meld.shape.low or 0, meld.shape.high or 0
                rank = card.rank
                if lo - 2 <= rank <= hi + 2:
                    score += self.NEAR_OPPONENT
        return score


class RelaxedBot(GreedyBot):
    """A gentle opponent: about a third of discards are a little careless, and it sometimes
    waits a turn before laying down. Seeded per decision, so replays are identical."""

    LOOSE_DISCARD = 0.35
    HOLD_BACK = 0.3

    def _rng(self, rnd: Round, seat: int, salt: str) -> random.Random:
        return random.Random(f"{rnd.seed}/{rnd.turns}/{seat}/{len(rnd.hands[seat])}/{salt}")

    def _meld(self, rnd: Round, seat: int) -> Action | None:
        # Never hold back when the hand is getting small: a relaxed bot is not a stuck bot.
        if len(rnd.hands[seat]) > 6 and self._rng(rnd, seat, "hold").random() < self.HOLD_BACK:
            return None
        return super()._meld(rnd, seat)

    def _discard(self, rnd: Round, seat: int) -> Action:
        hand = rnd.hands[seat]
        rng = self._rng(rnd, seat, "discard")
        if len(hand) > 1 and rng.random() < self.LOOSE_DISCARD:
            pool = [c for c in hand if not c.can_be_wild] or hand
            for card in rng.sample(pool, len(pool)):
                action = Discard(card.id)
                if rnd.is_legal(seat, action):
                    return action
        return super()._discard(rnd, seat)


BOTS = {"relaxed": RelaxedBot(), "standard": GreedyBot(), "sharp": SharpBot()}
