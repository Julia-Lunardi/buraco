"""One round of buraco: deal, turns, morto, going out. Pure and deterministic.

Every action goes through a handler that validates first and only mutates when
`commit` is true, so `check()` (used by bots, the API and "why is this illegal?")
shares the exact code path with `apply()`.
"""

from __future__ import annotations

import random
from collections.abc import Iterable
from dataclasses import dataclass, field
from enum import Enum

from .cards import Card, build_deck
from .melds import CanastraKind, MeldShape, analyse, canastra_kind
from .presets import DiscardPickup, GoOutRequires, Preset


class Phase(str, Enum):
    DRAW = "draw"
    PLAY = "play"  # drew; may meld, must discard
    OVER = "over"


class IllegalMove(Exception):
    """`code` is stable (tests, i18n); `message` is an English explanation."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Draw:
    pass


@dataclass(frozen=True)
class TakeDiscard:
    """Take the whole pile. In Fechado the top card must be used at once: `use_with` are hand
    cards that form a new meld with it, or `meld_id` is a team meld it extends (optionally
    with `use_with` cards too). In Aberto and STBL both stay empty."""
    use_with: tuple[int, ...] = ()
    meld_id: int | None = None


@dataclass(frozen=True)
class LayDown:
    card_ids: tuple[int, ...]


@dataclass(frozen=True)
class AddToMeld:
    meld_id: int
    card_ids: tuple[int, ...]


@dataclass(frozen=True)
class Discard:
    card_id: int


Action = Draw | TakeDiscard | LayDown | AddToMeld | Discard


@dataclass
class Meld:
    id: int
    team: int
    cards: list[Card]
    shape: MeldShape


@dataclass
class Team:
    # None once the morto was taken or turned into the stock (R-MORTO-3).
    morto: list[Card] | None
    took_morto: bool = False
    melds: list[Meld] = field(default_factory=list)


class Round:
    def __init__(self, preset: Preset, num_players: int, seed: int | str, first_seat: int = 0) -> None:
        if num_players not in (2, 4):
            raise ValueError("buraco is played by 2 or 4 players")
        self.preset = preset
        self.num_players = num_players
        self.seed = seed

        deck = build_deck()
        random.Random(seed).shuffle(deck)
        h = preset.hand_size
        self.hands: list[list[Card]] = [deck[i * h:(i + 1) * h] for i in range(num_players)]
        pos = num_players * h
        self.teams = [Team(morto=deck[pos:pos + h]), Team(morto=deck[pos + h:pos + 2 * h])]
        pos += 2 * h
        self.discard: list[Card] = [deck[pos]]  # top = last
        self.stock: list[Card] = deck[pos + 1:]  # top = last

        self.current = first_seat
        self.phase = Phase.DRAW
        self.went_out: int | None = None
        self.turns = 0
        self.history: list[tuple[int, Action]] = []
        self._next_meld_id = 0

    # --- public API ---------------------------------------------------------

    def apply(self, seat: int, action: Action) -> None:
        self._handler(action)(seat, action, True)
        self.history.append((seat, action))

    def check(self, seat: int, action: Action) -> None:
        """Raise IllegalMove if `action` is not legal now. Never changes state."""
        self._handler(action)(seat, action, False)

    def is_legal(self, seat: int, action: Action) -> bool:
        try:
            self.check(seat, action)
        except IllegalMove:
            return False
        return True

    def team_of(self, seat: int) -> int:
        return seat % 2  # partners sit opposite (R-SEAT-1); 2 players = 2 teams

    def seats_of(self, team: int) -> list[int]:
        return [s for s in range(self.num_players) if self.team_of(s) == team]

    def find_meld(self, meld_id: int) -> Meld | None:
        return next((m for t in self.teams for m in t.melds if m.id == meld_id), None)

    def cards_in_play(self) -> list[Card]:
        """Every card in the round, wherever it is (R-CARD-4)."""
        out = [c for h in self.hands for c in h] + self.stock + self.discard
        for team in self.teams:
            out += team.morto or []
            out += [c for m in team.melds for c in m.cards]
        return out

    def view_for(self, seat: int) -> dict:
        """What one player may see: their own hand plus public state. Cards carry their
        id (actions name cards by id: there are two of every card) and their label."""
        def cards(cs: list[Card]) -> list[dict]:
            return [{"id": c.id, "label": c.label} for c in cs]

        return {
            "seat": seat,
            "current": self.current,
            "phase": self.phase.value,
            "hand": cards(self.hands[seat]),
            "hand_sizes": [len(h) for h in self.hands],
            "stock_size": len(self.stock),
            "discard": cards(self.discard),
            "teams": [
                {
                    "morto_waiting": t.morto is not None,
                    "took_morto": t.took_morto,
                    "melds": [{"id": m.id, "cards": cards(m.cards), "kind": m.shape.kind.value,
                               "wilds": m.shape.wilds,
                               "canastra": (k.value if (k := canastra_kind(len(m.cards), m.shape, self.preset))
                                            else None)} for m in t.melds],
                }
                for t in self.teams
            ],
            "went_out": self.went_out,
        }

    # --- handlers -----------------------------------------------------------

    def _handler(self, action: Action):
        return {
            Draw: self._draw,
            TakeDiscard: self._take_discard,
            LayDown: self._lay_down,
            AddToMeld: self._add_to_meld,
            Discard: self._discard,
        }[type(action)]

    def _draw(self, seat: int, _: Draw, commit: bool) -> None:
        self._require_turn(seat, Phase.DRAW)
        if not self.stock:  # unreachable: an empty stock is refilled or ends the round at discard
            raise IllegalMove("stock_empty", "The stock is empty.")
        if commit:
            self.hands[seat].append(self.stock.pop())
            self.phase = Phase.PLAY

    def _take_discard(self, seat: int, action: TakeDiscard, commit: bool) -> None:
        self._require_turn(seat, Phase.DRAW)
        if not self.discard:
            raise IllegalMove("discard_empty", "The discard pile is empty. Draw from the stock.")
        if self.preset.discard_pickup is DiscardPickup.FREE:
            if action.use_with or action.meld_id is not None:
                raise IllegalMove("pile_is_free", "In this mode you take the pile without using its top card.")
            if commit:
                self.hands[seat].extend(self.discard)
                self.discard = []
                self.phase = Phase.PLAY
            return

        # Fechado (R-PILE-F): the top card goes straight into a meld, validated before anything moves.
        team = self.team_of(seat)
        top = self.discard[-1]
        if not action.use_with and action.meld_id is None:
            raise IllegalMove("must_use_top_card", "To take the pile, use its top card in a meld right away.")
        hand_cards = self._pick(seat, action.use_with) if action.use_with else []
        cards = [top] + hand_cards
        if action.meld_id is not None:
            meld = self.find_meld(action.meld_id)
            if meld is None or meld.team != team:
                raise IllegalMove("not_your_meld", "You can only add cards to your own team's melds.")
            shape = analyse(meld.cards + cards, self.preset, meld.shape.kind)
            if shape is None:
                raise IllegalMove("cannot_extend", "The top card doesn't fit this meld.")
            after = [(len(meld.cards) + len(cards), shape) if m.id == meld.id else (len(m.cards), m.shape)
                     for m in self.teams[team].melds]
        else:
            shape = analyse(cards, self.preset)
            if shape is None:
                raise IllegalMove("invalid_meld", "The top card and your cards don't form a meld.")
            after = self._team_shapes(team) + [(len(cards), shape)]
        remaining = len(self.hands[seat]) + len(self.discard) - len(cards)
        self._check_hand_after_meld(seat, remaining, after)
        if not commit:
            return
        self.hands[seat].extend(self.discard[:-1])  # the rest of the pile joins the hand
        self.discard = []
        self._remove_from_hand(seat, hand_cards)
        if action.meld_id is not None:
            meld.cards = meld.cards + cards
            meld.shape = shape
        else:
            self._add_meld(team, cards, shape)
        self.phase = Phase.PLAY
        self._after_meld(seat)

    def _lay_down(self, seat: int, action: LayDown, commit: bool) -> None:
        self._require_turn(seat, Phase.PLAY)
        cards = self._pick(seat, action.card_ids)
        shape = analyse(cards, self.preset)
        if shape is None:
            what = "a sequence of 3+ cards of one suit" + (" or a trinca" if self.preset.trincas_allowed else "")
            raise IllegalMove("invalid_meld", f"These cards are not {what} (with at most "
                                              f"{self.preset.max_wilds_per_meld} wild card).")
        team = self.team_of(seat)
        after = self._team_shapes(team) + [(len(cards), shape)]
        self._check_hand_after_meld(seat, len(self.hands[seat]) - len(cards), after)
        if commit:
            self._remove_from_hand(seat, cards)
            self._add_meld(team, cards, shape)
            self._after_meld(seat)

    def _add_to_meld(self, seat: int, action: AddToMeld, commit: bool) -> None:
        self._require_turn(seat, Phase.PLAY)
        team = self.team_of(seat)
        meld = self.find_meld(action.meld_id)
        if meld is None or meld.team != team:
            raise IllegalMove("not_your_meld", "You can only add cards to your own team's melds.")
        cards = self._pick(seat, action.card_ids)
        if not self.preset.canastra_extendable and len(meld.cards) >= self.preset.canastra_size:
            raise IllegalMove("canastra_closed", "A finished canastra cannot be extended in this mode.")
        combined = meld.cards + cards
        shape = analyse(combined, self.preset, meld.shape.kind)
        if shape is None:
            raise IllegalMove("cannot_extend", "These cards don't fit this meld "
                                               f"(at most {self.preset.max_wilds_per_meld} wild card per meld).")
        after = [(len(combined), shape) if m.id == meld.id else (len(m.cards), m.shape)
                 for m in self.teams[team].melds]
        self._check_hand_after_meld(seat, len(self.hands[seat]) - len(cards), after)
        if commit:
            self._remove_from_hand(seat, cards)
            meld.cards = combined
            meld.shape = shape
            self._after_meld(seat)

    def _discard(self, seat: int, action: Discard, commit: bool) -> None:
        self._require_turn(seat, Phase.PLAY)
        (card,) = self._pick(seat, (action.card_id,))
        team = self.teams[self.team_of(seat)]
        last_card = len(self.hands[seat]) == 1
        if last_card and team.morto is None and not self._can_go_out(self._team_shapes(self.team_of(seat))):
            raise IllegalMove("cannot_discard_last", self._go_out_requirement())
        if not commit:
            return
        self._remove_from_hand(seat, [card])
        self.discard.append(card)
        if last_card:
            if team.morto is not None:  # morto indireto: it becomes the hand for the next turn
                self._take_morto(seat)
            else:
                self._finish(went_out=seat)
                return
        self._end_turn()

    # --- rules helpers ------------------------------------------------------

    def _require_turn(self, seat: int, phase: Phase) -> None:
        if self.phase is Phase.OVER:
            raise IllegalMove("round_over", "The round is over.")
        if seat != self.current:
            raise IllegalMove("not_your_turn", "It is not your turn.")
        if self.phase is not phase:
            msg = "Draw a card or take the discard pile first." if self.phase is Phase.DRAW \
                else "You already drew this turn. Meld or discard."
            raise IllegalMove("wrong_phase", msg)

    def _pick(self, seat: int, card_ids: Iterable[int]) -> list[Card]:
        card_ids = tuple(card_ids)
        if not card_ids:
            raise IllegalMove("no_cards", "Choose at least one card.")
        if len(set(card_ids)) != len(card_ids):
            raise IllegalMove("duplicate_cards", "The same card was chosen twice.")
        by_id = {c.id: c for c in self.hands[seat]}
        if any(i not in by_id for i in card_ids):
            raise IllegalMove("not_in_hand", "That card is not in your hand.")
        return [by_id[i] for i in card_ids]

    def _team_shapes(self, team: int) -> list[tuple[int, MeldShape]]:
        return [(len(m.cards), m.shape) for m in self.teams[team].melds]

    def _can_go_out(self, shapes: list[tuple[int, MeldShape]]) -> bool:
        kinds = {canastra_kind(n, s, self.preset) for n, s in shapes}
        if self.preset.go_out_requires is GoOutRequires.CLEAN_CANASTRA:
            return bool(kinds & {CanastraKind.LIMPA, CanastraKind.REAL})
        return bool(kinds - {None})

    def _go_out_requirement(self) -> str:
        need = "a clean canastra" if self.preset.go_out_requires is GoOutRequires.CLEAN_CANASTRA else "a canastra"
        return f"To empty your hand your team needs {need}. Keep a card to discard."

    def _check_hand_after_meld(self, seat: int, remaining: int, shapes_after: list[tuple[int, MeldShape]]) -> None:
        """R-MELD-6: never leave a hand that cannot legally finish the turn."""
        if remaining >= 2:
            return
        if self.teams[self.team_of(seat)].morto is not None:
            return  # 0 cards: morto direto; 1 card: its discard takes the morto
        if remaining == 0 and not self.preset.go_out_by_meld_allowed:
            raise IllegalMove("must_discard_to_go_out", "Keep one card: you go out by discarding it.")
        if not self._can_go_out(shapes_after):
            raise IllegalMove("keep_a_card", self._go_out_requirement())

    def _remove_from_hand(self, seat: int, cards: list[Card]) -> None:
        ids = {c.id for c in cards}
        self.hands[seat] = [c for c in self.hands[seat] if c.id not in ids]

    def _add_meld(self, team: int, cards: list[Card], shape: MeldShape) -> Meld:
        meld = Meld(self._next_meld_id, team, list(cards), shape)
        self._next_meld_id += 1
        self.teams[team].melds.append(meld)
        return meld

    def _after_meld(self, seat: int) -> None:
        if self.hands[seat]:
            return
        if self.teams[self.team_of(seat)].morto is not None:
            self._take_morto(seat)  # morto direto: keep playing this turn
        else:
            self._finish(went_out=seat)

    def _take_morto(self, seat: int) -> None:
        team = self.teams[self.team_of(seat)]
        self.hands[seat] = team.morto
        team.morto = None
        team.took_morto = True

    def _end_turn(self) -> None:
        nxt = (self.current + 1) % self.num_players
        if not self.stock:
            # R-MORTO-3: an untaken morto becomes the stock; the next player's team's first.
            waiting = [t for t in (self.team_of(nxt), 1 - self.team_of(nxt)) if self.teams[t].morto is not None]
            if self.preset.untaken_morto_becomes_stock and waiting:
                team = self.teams[waiting[0]]
                self.stock, team.morto = team.morto, None
            else:
                self._finish(went_out=None)  # R-OUT-3
                return
        self.current = nxt
        self.phase = Phase.DRAW
        self.turns += 1

    def _finish(self, went_out: int | None) -> None:
        self.went_out = went_out
        self.phase = Phase.OVER
