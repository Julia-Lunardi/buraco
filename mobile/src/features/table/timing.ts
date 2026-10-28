import { cubicBezier, Easing } from 'react-native-reanimated';

/** Card motion on the felt. Flights (a card travelling between the stock, the lixo, a hand
 * and the melds) ease in and out, like a hand moving a card; rows re-spacing decelerate. */
export const FLIGHT_MS = 700;
export const FLIGHT_EASE = Easing.bezier(0.45, 0, 0.2, 1);
export const CARD_MOVE_MS = 450;
export const CSS_EASE = cubicBezier(0.22, 1, 0.36, 1);

/** The selection lift, as a CSS transition on the card's transform. */
export const LIFT_TRANSITION = {
  transitionProperty: 'transform' as const,
  transitionDuration: 220,
  transitionTimingFunction: CSS_EASE,
};
