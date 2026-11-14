/** The order your hand is shown in, kept on this phone. Cards that join the hand (from the
 * stock, the lixo or the morto) go in at random places, as they would in a real hand; tapping
 * Naipe or Valor sorts it. Cards that leave just drop out; the rest keep their places. */
export function arrangeHand(prev: number[], hand: number[], random: () => number = Math.random): number[] | null {
  const inHand = new Set(hand);
  const kept = prev.filter((id) => inHand.has(id));
  // A new deal (or the first look at a table): nothing to keep, so the caller sorts it.
  if (!kept.length) return null;
  const known = new Set(kept);
  const order = [...kept];
  for (const id of hand) {
    if (known.has(id)) continue;
    order.splice(Math.floor(random() * (order.length + 1)), 0, id);
  }
  return order;
}

/** `cards` in `order`, any card the order doesn't know yet at the end (one render, at most). */
export function inOrder<T extends { id: number }>(cards: T[], order: number[]): T[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const placed = order.flatMap((id) => byId.get(id) ?? []);
  const seen = new Set(order);
  return [...placed, ...cards.filter((card) => !seen.has(card.id))];
}
