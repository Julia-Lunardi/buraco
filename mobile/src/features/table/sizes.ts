import { useWindowDimensions } from 'react-native';

import { size } from '../../theme/tokens';

/** Card sizes: the design's phone tokens, or the large ones on tablets (shortest side
 * >= 600 pt, the design system's `.bc-large`). */
export function useCardSizes() {
  const { width, height } = useWindowDimensions();
  const large = Math.min(width, height) >= 600;
  return {
    large,
    landscape: width > height,
    hand: large ? { w: size.cardHandWLg, h: size.cardHandHLg } : { w: size.cardHandW, h: size.cardHandH },
    table: large ? { w: size.cardTableWLg, h: size.cardTableHLg } : { w: size.cardTableW, h: size.cardTableH },
    pile: large ? { w: size.cardPileWLg, h: size.cardPileHLg } : { w: size.cardPileW, h: size.cardPileH },
  };
}

export type CardSize = 'hand' | 'table' | 'pile';
