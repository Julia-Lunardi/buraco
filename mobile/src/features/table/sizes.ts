import { useWindowDimensions } from 'react-native';

/** One card size for the whole table (stock, lixo, melds and your hand), so a card looks the
 * same wherever it lies and keeps its size when it flies. It scales with the screen: 12.5% of
 * the shortest side, between 44 pt (small phones) and 76 pt (tablets), in the 5:7 card shape.
 * The size names stay so callers can say where a card is; they all measure the same. */
export function useCardSizes() {
  const { width, height } = useWindowDimensions();
  const short = Math.min(width, height);
  const w = Math.round(Math.min(76, Math.max(44, short * 0.125)));
  const card = { w, h: Math.round(w * 1.4) };
  return {
    large: short >= 600,
    landscape: width > height,
    hand: card,
    table: card,
    pile: card,
  };
}

export type CardSize = 'hand' | 'table' | 'pile';
