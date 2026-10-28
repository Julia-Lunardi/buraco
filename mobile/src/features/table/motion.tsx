import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useFlights } from './flights';
import { CARD_MOVE_MS, CSS_EASE } from './timing';

interface SlotProps {
  id: number;
  left: number;
  top?: number;
  zIndex: number;
  children: ReactNode;
  style?: ViewStyle;
}

/** One card's place in a fanned row. When the place changes (a re-sort, a card leaving the
 * hand, the pile wrapping to two rows) the card glides there instead of jumping. A card that
 * arrives by flight stays hidden until the flight lands on this spot. */
export function CardSlot({ id, left, top = 0, zIndex, children, style }: SlotProps) {
  const flights = useFlights();
  const wait = flights?.arrival(id) ?? 0;
  return (
    <Animated.View entering={FadeIn.delay(wait).duration(wait ? 1 : 160)}
                   style={[{ position: 'absolute', left, top, zIndex,
                             transitionProperty: ['left', 'top'], transitionDuration: CARD_MOVE_MS,
                             transitionTimingFunction: CSS_EASE }, style]}>
      <View collapsable={false} ref={(view) => flights?.register(`card:${id}`, view)}>{children}</View>
    </Animated.View>
  );
}
