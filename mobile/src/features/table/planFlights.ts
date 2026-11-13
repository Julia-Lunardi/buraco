import type { CardView, GameView } from '../../api/tables';

/** One card to fly across the table. `from` and `to` are places to try in order: `card:<id>`
 * (a card on screen), `seat:<n>` (a player's avatar: their hidden hand), or a zone
 * (`stock`, `discard`, `hand`). `label` null flies face down; with `flip` the card leaves face
 * down and turns face up as it arrives (your own draw). `delay` staggers several cards. */
export interface FlightPlan {
  id: number | null; // the card that lands (null: a face-down card into someone else's hand)
  label: string | null;
  flip?: boolean;
  from: string[];
  to: string[];
  delay: number;
}

const STAGGER_MS = 70;
/** The lixo leaves card after card, quicker: a 20-card pile still goes in about a second. */
const PILE_STAGGER_MS = 45;
const MAX_FLIGHTS = 14;
/** Face-down cards shown flying when someone else takes a morto (its 11 would be a blur). */
const MORTO_FLIGHTS = 5;
const FLIGHT_GAP_MS = 250; // besides the lixo, which always flies whole (cards past a cap just vanished)

const meldCards = (g: GameView): CardView[] => g.teams.flatMap((t) => t.melds.flatMap((m) => m.cards));

/** Which cards moved from `prev` to `next`, and from where to where. Every change on the felt
 * is one player's move (the server sends bot moves one by one), made by whoever was to play. */
export function planFlights(prev: GameView | null, next: GameView | null): FlightPlan[] {
  if (!prev || !next || prev.seat !== next.seat) return [];
  if (next.stock_size > prev.stock_size) return []; // a new round was dealt: nothing flies
  const me = next.seat;
  const actor = prev.current;
  const mine = actor === me;
  const hidden = `seat:${actor}`;
  const fromHand = (id: number) => (mine ? [`card:${id}`, 'hand'] : [hidden]);

  const handBefore = new Set(prev.hand.map((x) => x.id));
  const pileBefore = new Set(prev.discard.map((x) => x.id));
  const pileNow = new Set(next.discard.map((x) => x.id));
  const meldBefore = new Set(meldCards(prev).map((x) => x.id));

  // Taking the lixo: every card leaves the pile, into the hand or straight into a meld.
  const pile: FlightPlan[] = prev.discard.filter((card) => !pileNow.has(card.id)).map((card, i) => ({
    id: card.id, label: card.label, from: [`card:${card.id}`, 'discard'], to: [`card:${card.id}`, mine ? 'hand' : hidden],
    delay: i * PILE_STAGGER_MS,
  }));
  const after = pile.length ? pile[pile.length - 1].delay + STAGGER_MS * 2 : 0;

  const plans: Omit<FlightPlan, 'delay'>[] = [];

  // Drawing from the stock: face down to their hand; to yours it turns face up on the way in.
  const drawn = prev.stock_size - next.stock_size;
  if (drawn > 0 && drawn <= 2) {
    const fresh = mine ? next.hand.filter((x) => !handBefore.has(x.id) && !pileBefore.has(x.id)) : [];
    for (let i = 0; i < drawn; i++) {
      const card = fresh[i];
      plans.push({ id: card?.id ?? null, label: card?.label ?? null, flip: !!card, from: ['stock'],
                   to: card ? [`card:${card.id}`, 'hand'] : [mine ? 'hand' : hidden] });
    }
  }

  // Cards laid down or added to a meld, from the hand.
  for (const card of meldCards(next)) {
    if (meldBefore.has(card.id) || pileBefore.has(card.id)) continue;
    plans.push({ id: card.id, label: card.label, from: fromHand(card.id), to: [`card:${card.id}`] });
  }

  // The discard.
  for (const card of next.discard) {
    if (pileBefore.has(card.id)) continue;
    plans.push({ id: card.id, label: card.label, from: fromHand(card.id), to: [`card:${card.id}`, 'discard'] });
  }

  const moves = plans.slice(0, MAX_FLIGHTS).map((plan, i) => ({ ...plan, delay: after + i * STAGGER_MS }));

  // Taking the morto: its cards leave the stack on the table for the taker's hand, after the move
  // that took it (going out of cards, or the discard). Yours turn face up on the way in.
  const taken = mortoTaken(prev, next);
  const start = moves.length ? moves[moves.length - 1].delay + FLIGHT_GAP_MS : after;
  const morto: FlightPlan[] = !taken ? [] : mine
    ? next.hand.filter((x) => !handBefore.has(x.id)).map((card, i) => ({
      id: card.id, label: card.label, flip: true, from: [`morto:${taken.team}`], to: [`card:${card.id}`, 'hand'],
      delay: start + i * PILE_STAGGER_MS }))
    : Array.from({ length: MORTO_FLIGHTS }, (_, i) => ({
      id: null, label: null, from: [`morto:${taken.team}`], to: [hidden], delay: start + i * PILE_STAGGER_MS }));

  return [...pile, ...moves, ...morto];
}

/** Someone's team just picked up its morto (morto_waiting went off with took_morto on). The
 * player is whoever was to play: the morto comes with going out of cards or with the discard. */
export function mortoTaken(prev: GameView | null, next: GameView | null): { team: number; seat: number } | null {
  if (!prev || !next || prev.seat !== next.seat) return null;
  const team = next.teams.findIndex((t, i) => t.took_morto && !prev.teams[i].took_morto);
  return team < 0 ? null : { team, seat: prev.current };
}

/** Someone else just took the lixo: who, and how many cards (for the "+N" on their avatar and
 * the line under the piles). Null for your own take: you see the cards land in your hand. */
export function pileTaken(prev: GameView | null, next: GameView | null): { seat: number; n: number } | null {
  if (!prev || !next || prev.seat !== next.seat || next.stock_size > prev.stock_size) return null;
  if (prev.current === next.seat || !prev.discard.length || next.discard.length) return null;
  return { seat: prev.current, n: prev.discard.length };
}
