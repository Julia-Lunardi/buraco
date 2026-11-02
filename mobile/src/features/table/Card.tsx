import { Image, Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { spokenCard } from '../../components/PlayingCard';
import { useTheme } from '../../theme';
import { parse } from '../../game/melds';
import { type CardSize, useCardSizes } from './sizes';
import { LIFT_TRANSITION } from './timing';
import SuitIcon from './SuitIcon';

// Classic deck faces: "Designed by Magnific" (magnific.com, file 37631; the licence wants that line
// and a link visible in the app, which Settings > About carries). Each card rendered on its own from
// the stacked vector art without its outline, its own corner indices or its dotted rules (the large
// index below replaces them), the rest scaled alike into the right 40-97% of the card so nothing sits
// under that index; one sprite of 14 x 4 cards at 240 x 344 px (A..K then joker; spades, hearts,
// diamonds, clubs), as in the design system.
const SPRITE = require('../../../assets/cards/classic.webp');
const SPRITE_SUITS = ['S', 'H', 'D', 'C'];
const COLS = 14;
const ROWS = 4;
// The faces are white, so the index's backing matches them rather than the cream `card` token.
const FACE_WHITE = '#ffffff';
// Card back "Ardósia" (design system, 28.10.2026): the Salvia Code Labs leaf mark and the
// "SALVIA CODE LABS" wordmark in cream on slate blue, on every back at every size (Julia's
// call, over the design system's mark-only small backs). back.svg rasterised to back-full.png, with the
// mark and wordmark 45% larger than in the design system (Julia's call, 28.10.2026).
const BACK_FULL = require('../../../assets/cards/back-full.png');

/** The card back at any width, for a face-down card outside the fixed card sizes (the lobby's
 * deck). `width` in points; the height follows the 5:7 card shape. */
export function CardBack({ width, style }: { width: number; style?: ViewStyle }) {
  const { shadow } = useTheme();
  return (
    <View style={[{ width, height: width * 1.4, borderRadius: width * 0.072, boxShadow: shadow.shadowCard }, style]}>
      <Image source={BACK_FULL} accessibilityIgnoresInvertColors style={{ width, height: width * 1.4 }} />
    </View>
  );
}

interface Props {
  label?: string; // omitted with faceDown
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean | 'valid';
  disabled?: boolean;
  onPress?(): void;
  style?: ViewStyle;
}

/** Design system `Card`: the classic face from the sprite with a large, legible index over its
 * corner, the `wild` notch on 2s and jokers, a lift with an accent (or valid) outline when
 * selected, and the card back. */
export default function Card({ label, size = 'hand', faceDown, selected, disabled, onPress, style }: Props) {
  const { c, radius, size: tokens, shadow, type } = useTheme();
  const sizes = useCardSizes();
  const { w, h } = sizes[size];
  // Details scale with the card (one size everywhere, set by the screen: see sizes.ts).
  const tight = w < 48;
  const corner = tight ? radius.radiusXs + 1 : radius.radiusCard;

  if (faceDown || !label) {
    return (
      <View style={[{ width: w, height: h, borderRadius: corner, backgroundColor: c.cardBack, boxShadow: shadow.shadowCard,
                      overflow: 'hidden' }, style]}>
        <Image source={BACK_FULL} accessibilityIgnoresInvertColors resizeMode="stretch" style={{ width: w, height: h }} />
      </View>
    );
  }

  const card = parse(label);
  const joker = card.rank === 0;
  const rankText = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] ?? String(card.rank);
  const red = card.suit === 'H' || card.suit === 'D';
  const ink = red ? c.cardRed : c.cardInk;
  const col = joker ? 13 : card.rank - 1;
  const row = joker ? 0 : SPRITE_SUITS.indexOf(card.suit ?? 'S');
  const wild = joker || card.rank === 2;
  const notch = Math.round(w * 0.22);
  const indexSize = Math.round(w * 0.36);
  const index = { ...type.cardIndex, fontSize: indexSize, lineHeight: indexSize };
  const iconSize = Math.round(w * 0.27);

  const face = (
    <Animated.View style={[LIFT_TRANSITION, {
      width: w, height: h, borderRadius: corner, overflow: 'hidden', backgroundColor: c.card,
      borderWidth: selected ? 2 : 0, borderColor: selected === 'valid' ? c.valid : c.accent,
      boxShadow: selected ? shadow.shadowCardLift : shadow.shadowCard, opacity: disabled ? 0.45 : 1,
      transform: [{ translateY: selected ? -tokens.selectLift : 0 }],
    }, style]}>
      <Image source={SPRITE} style={{ position: 'absolute', width: w * COLS, height: h * ROWS, left: -col * w, top: -row * h }} />
      <View style={{ position: 'absolute', top: tight ? 1 : 2, left: tight ? 1 : 2, alignItems: 'center',
                     backgroundColor: FACE_WHITE, borderRadius: 4, paddingHorizontal: tight ? 1 : 2, paddingVertical: 2,
                     minWidth: Math.round(w * 0.32), gap: 1 }}>
        {joker ? <SuitIcon suit={null} size={iconSize + 2} color={c.cardInk} />
          : <Text style={[index, rankText.length > 1
              // "10" set narrower so its box stays clear of the pips beside it
              ? { color: ink, fontSize: Math.round(indexSize * 0.85), letterSpacing: -1.5 }
              : { color: ink, letterSpacing: -0.5 }]}>{rankText}</Text>}
        {joker ? null : <SuitIcon suit={card.suit} size={iconSize} color={ink} />}
      </View>
      {wild ? (
        <View style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTopWidth: notch, borderLeftWidth: notch,
                       borderTopColor: c.wild, borderLeftColor: 'transparent' }} />
      ) : null}
    </Animated.View>
  );

  if (!onPress) return <View accessible accessibilityLabel={spokenCard(label)}>{face}</View>;
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={spokenCard(label)}
               accessibilityState={{ selected: !!selected, disabled: !!disabled }}>
      {face}
    </Pressable>
  );
}
