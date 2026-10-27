import { Image, Pressable, Text, View, type ViewStyle } from 'react-native';

import { spokenCard } from '../../components/PlayingCard';
import { useTheme } from '../../theme';
import { parse } from '../../game/melds';
import { type CardSize, useCardSizes } from './sizes';
import SuitIcon from './SuitIcon';

// Classic deck faces: Vector Playing Cards 1.3 (public domain), one sprite of 14 x 4 cards
// (A..K then joker; spades, hearts, diamonds, clubs), as in the design system.
const SPRITE = require('../../../assets/cards/classic.webp');
const SPRITE_SUITS = ['S', 'H', 'D', 'C'];
const COLS = 14;
const ROWS = 4;

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
  const corner = size === 'table' ? radius.radiusXs : radius.radiusCard;

  if (faceDown || !label) {
    return (
      <View style={[{
        width: w, height: h, borderRadius: corner, backgroundColor: c.cardBack, borderWidth: 1, borderColor: c.cardEdge,
        padding: size === 'table' ? 3 : 4, boxShadow: shadow.shadowCard }, style]}>
        <View style={{ flex: 1, borderRadius: corner - 2, borderWidth: 1, borderColor: c.cardBackPattern,
                       alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: w * 0.26, height: w * 0.26, borderWidth: 1, borderColor: c.cardBackPattern,
                         transform: [{ rotate: '45deg' }] }} />
        </View>
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
  const notch = size === 'table' ? 9 : 13;
  const index = size === 'table' ? type.cardIndexSm : type.cardIndex;
  const iconSize = size === 'hand' ? (sizes.large ? 18 : 15) : size === 'pile' ? 14 : (sizes.large ? 13 : 11);

  const face = (
    <View style={[{
      width: w, height: h, borderRadius: corner, overflow: 'hidden', backgroundColor: c.card,
      borderWidth: selected ? 2 : 0, borderColor: selected === 'valid' ? c.valid : c.accent,
      boxShadow: selected ? shadow.shadowCardLift : shadow.shadowCard, opacity: disabled ? 0.45 : 1,
      transform: [{ translateY: selected ? -tokens.selectLift : 0 }],
    }, style]}>
      <Image source={SPRITE} style={{ position: 'absolute', width: w * COLS, height: h * ROWS, left: -col * w, top: -row * h }} />
      <View style={{ position: 'absolute', top: size === 'table' ? 1 : 2, left: size === 'table' ? 1 : 2, alignItems: 'center',
                     backgroundColor: c.card, borderRadius: 4, paddingHorizontal: size === 'table' ? 1 : 2, paddingVertical: 2,
                     minWidth: size === 'table' ? 12 : 18, gap: 1 }}>
        {joker ? <SuitIcon suit={null} size={iconSize + 2} color={c.cardInk} />
          : <Text style={[index, { color: ink, letterSpacing: -0.5 }]}>{rankText}</Text>}
        {joker ? null : <SuitIcon suit={card.suit} size={iconSize} color={ink} />}
      </View>
      {wild ? (
        <View style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTopWidth: notch, borderLeftWidth: notch,
                       borderTopColor: c.wild, borderLeftColor: 'transparent' }} />
      ) : null}
    </View>
  );

  if (!onPress) return <View accessible accessibilityLabel={spokenCard(label)}>{face}</View>;
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={spokenCard(label)}
               accessibilityState={{ selected: !!selected, disabled: !!disabled }}>
      {face}
    </Pressable>
  );
}
