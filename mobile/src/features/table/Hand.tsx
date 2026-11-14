import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import type { CardView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import Card from './Card';
import { useFlights } from './flights';
import { CardSlot } from './motion';
import { useCardSizes } from './sizes';

interface Props {
  cards: CardView[];
  selected: number[];
  selectionValid: boolean;
  width: number;
  /** Cards just drawn while the table scrolls: each glows softly for about 2 s once it lands,
   * so a player who scrolls down to the hand can still see what came in. */
  fresh?: { ids: number[]; key: number } | null;
  onToggle(id: number): void;
}

/** Design system `Hand`: one overlapping row while every card shows at least its index
 * (43% of a card), two offset rows past that, so a 25-card hand stays readable. */
export default function Hand({ cards, selected, selectionValid, width, fresh, onToggle }: Props) {
  const { size } = useTheme();
  const { hand } = useCardSizes();
  const cw = hand.w;
  const n = cards.length;
  const minStep = Math.round(cw * 0.43);
  const oneStep = n > 1 ? Math.min(cw + 4, (width - cw) / (n - 1)) : 0;
  const rows = n > 1 && oneStep < minStep ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const step = perRow > 1 ? Math.min(cw + 4, (width - cw) / (perRow - 1)) : 0;
  const lines = Array.from({ length: rows }, (_, r) => cards.slice(r * perRow, (r + 1) * perRow));

  return (
    <View accessibilityRole="none" accessibilityLabel={`${t('table.cardsInHand')}: ${n}`}
          style={{ width, paddingTop: size.selectLift }}>
      {lines.map((line, r) => {
        const rowW = cw + step * Math.max(0, line.length - 1);
        return (
          <View key={r} style={{ height: hand.h, width: rowW, zIndex: r + 1,
                                 marginTop: r === 1 ? -hand.h * 0.46 : 0,
                                 marginLeft: r === 1 ? Math.min(step / 2, width - rowW) : 0 }}>
            {line.map((card, i) => {
              const isSel = selected.includes(card.id);
              return (
                <CardSlot key={card.id} id={card.id} left={i * step} zIndex={i + 1}>
                  <Card label={card.label} selected={isSel ? (selectionValid ? 'valid' : true) : false}
                        onPress={() => onToggle(card.id)} />
                  {fresh?.ids.includes(card.id) ? <FreshGlow key={fresh.key} id={card.id} /> : null}
                </CardSlot>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** A soft gold ring and glow around a card just drawn: it fades in as the card lands, holds,
 * and fades out, about 2 s in all. It never takes a tap. */
function FreshGlow({ id }: { id: number }) {
  const { c, radius } = useTheme();
  const flights = useFlights();
  // Read once: the next game state brings a new flight plan, which must not restart the glow.
  const [wait] = useState(() => flights?.arrival(id) ?? 0);
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withDelay(wait, withSequence(withTiming(1, { duration: 250 }), withDelay(1300, withTiming(0, { duration: 450 }))));
  }, [glow, wait]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View pointerEvents="none"
                   style={[{ position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: radius.radiusCard + 3,
                             borderWidth: 2, borderColor: c.accent, boxShadow: '0 0 14px rgba(232, 178, 74, 0.7)' }, style]} />
  );
}
