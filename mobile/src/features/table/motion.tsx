import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { cubicBezier, Easing, FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';

/** Card motion on the felt: one easing for everything, so moves feel like one hand dealing.
 * A decelerating curve (fast start, soft landing) rather than linear steps. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const CSS_EASE = cubicBezier(0.22, 1, 0.36, 1);
export const CARD_MOVE_MS = 320;

/** Cards arriving in your hand come from the piles above; elsewhere they fade in place. */
export const ENTER_HAND = FadeInUp.duration(CARD_MOVE_MS).easing(EASE);
export const ENTER_TABLE = FadeIn.duration(CARD_MOVE_MS).easing(EASE);
export const EXIT = FadeOut.duration(180);

/** The selection lift, as a CSS transition on the card's transform. */
export const LIFT_TRANSITION = {
  transitionProperty: 'transform' as const,
  transitionDuration: 180,
  transitionTimingFunction: CSS_EASE,
};

interface SlotProps {
  left: number;
  top?: number;
  zIndex: number;
  entering?: typeof ENTER_HAND | typeof ENTER_TABLE;
  children: ReactNode;
  style?: ViewStyle;
}

/** One card's place in a fanned row. When the place changes (a re-sort, a card leaving the
 * hand, the pile wrapping to two rows) the card glides there instead of jumping. */
export function CardSlot({ left, top = 0, zIndex, entering = ENTER_TABLE, children, style }: SlotProps) {
  return (
    <Animated.View entering={entering} exiting={EXIT}
                   style={[{ position: 'absolute', left, top, zIndex,
                             transitionProperty: ['left', 'top'], transitionDuration: CARD_MOVE_MS,
                             transitionTimingFunction: CSS_EASE }, style]}>
      {children}
    </Animated.View>
  );
}
