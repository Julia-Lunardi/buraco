/**
 * Client-side copy of the engine's meld check (backend app/engine/melds.py), used only to
 * colour the selection ("Pode baixar"): the server stays the authority on every move.
 * Labels are the server's ("10H", "QS", "2C", "JK").
 */

export interface MeldRules {
  trincasAllowed: boolean;
  maxWilds: number;
}

export const RULES: Record<string, MeldRules> = {
  aberto: { trincasAllowed: true, maxWilds: 1 },
  fechado: { trincasAllowed: true, maxWilds: 1 },
  stbl: { trincasAllowed: false, maxWilds: 1 },
};

interface Parsed { rank: number; suit: string | null } // rank 0 = joker, 1 = ace … 13 = king

const RANKS: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
const HIGH_ACE = 14;
const MAX_SEQUENCE = 14;

export function parse(label: string): Parsed {
  if (label === 'JK') return { rank: 0, suit: null };
  const r = label.slice(0, -1);
  return { rank: RANKS[r] ?? Number(r), suit: label.slice(-1) };
}

const canBeWild = (c: Parsed) => c.rank === 0 || c.rank === 2;

export type MeldKind = 'sequence' | 'trinca';

/** The cleanest legal reading of the cards as one meld, or null. */
export function analyse(labels: string[], rules: MeldRules, kind?: MeldKind): { kind: MeldKind; wilds: number } | null {
  const cards = labels.map(parse);
  const options = [];
  if (!kind || kind === 'sequence') options.push(asSequence(cards, rules.maxWilds));
  if ((!kind || kind === 'trinca') && rules.trincasAllowed) options.push(asTrinca(cards, rules.maxWilds));
  const valid = options.filter((o): o is { kind: MeldKind; wilds: number } => o !== null);
  return valid.length ? valid.reduce((a, b) => (b.wilds < a.wilds ? b : a)) : null;
}

function asSequence(cards: Parsed[], maxWilds: number) {
  const n = cards.length;
  if (n < 3 || n > MAX_SEQUENCE) return null;
  const naturals = cards.filter((c) => !canBeWild(c));
  const twos = cards.filter((c) => c.rank === 2);
  const jokers = cards.filter((c) => c.rank === 0);
  const suits = new Set(naturals.map((c) => c.suit));
  if (suits.size > 1) return null;
  const candidateSuits = suits.size ? [...suits] : [...new Set(twos.map((t) => t.suit))];
  let best: { kind: MeldKind; wilds: number } | null = null;
  for (const suit of candidateSuits) {
    const naturalTwoOptions = twos.some((t) => t.suit === suit) ? [true, false] : [false];
    for (const naturalTwo of naturalTwoOptions) {
      const wilds = jokers.length + twos.length - (naturalTwo ? 1 : 0);
      if (wilds > maxWilds || (best && wilds >= best.wilds)) continue;
      const ranks = naturals.map((c) => c.rank).concat(naturalTwo ? [2] : []);
      if (fitSpan(ranks, n)) best = { kind: 'sequence', wilds };
    }
  }
  return best;
}

/** Place the natural ranks in n consecutive slots on 1..14, each ace low or high. */
function fitSpan(ranks: number[], n: number): boolean {
  if (!ranks.length) return false;
  const aces = ranks.filter((r) => r === 1).length;
  const others = ranks.filter((r) => r !== 1);
  for (let high = 0; high <= aces; high++) {
    const placed = [...others, ...Array(high).fill(HIGH_ACE), ...Array(aces - high).fill(1)];
    if (new Set(placed).size !== placed.length) continue;
    const lo = Math.min(...placed);
    const hi = Math.max(...placed);
    if (Math.max(1, hi - n + 1) <= Math.min(lo, HIGH_ACE - n + 1)) return true;
  }
  return false;
}

function asTrinca(cards: Parsed[], maxWilds: number) {
  if (cards.length < 3) return null;
  const naturals = cards.filter((c) => !canBeWild(c));
  const wilds = cards.length - naturals.length;
  const ranks = new Set(naturals.map((c) => c.rank));
  if (ranks.size !== 1 || wilds > maxWilds || naturals.length <= wilds) return null;
  return { kind: 'trinca' as const, wilds };
}

/** Hand sorting for the "Naipe / Valor" toggle. */
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 }; // alternate colours
export function sortHand<T extends { label: string }>(cards: T[], by: 'suit' | 'rank'): T[] {
  const key = (c: T) => {
    const p = parse(c.label);
    const suit = p.suit ? SUIT_ORDER[p.suit] : 4;
    const rank = p.rank === 1 ? 14 : p.rank === 0 ? 15 : p.rank; // ace high, jokers last
    return by === 'suit' ? suit * 100 + rank : rank * 10 + suit;
  };
  return [...cards].sort((a, b) => key(a) - key(b));
}
