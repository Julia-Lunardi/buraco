import { Pressable, Text, View } from 'react-native';

import { t } from '../i18n';
import { useTheme } from '../theme';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

export function parseLabel(label: string): { rank: string; suit: keyof typeof SUIT | null } {
  if (label === 'JK') return { rank: 'JK', suit: null };
  return { rank: label.slice(0, -1), suit: label.slice(-1) as keyof typeof SUIT };
}

/** Accessible name in words ("10 de copas", "2 de paus, curinga"), as the design system asks. */
export function spokenCard(label: string): string {
  const { rank, suit } = parseLabel(label);
  if (!suit) return t('cards.joker');
  const name = t('cards.of', { rank, suit: t(`cards.${suit}`) });
  return rank === '2' ? `${name}, ${t('cards.wild')}` : name;
}

interface Props {
  label: string;
  size?: 'hand' | 'table';
  selected?: boolean;
  onPress?(): void;
}

/** Design system `Card`: off-white face, corner index, suit in card-ink / card-red, and a
 * `wild` corner notch on 2s and jokers (a mark, never text). */
export default function PlayingCard({ label, size = 'hand', selected, onPress }: Props) {
  const { c, size: sz, radius, shadow, type } = useTheme();
  const { rank, suit } = parseLabel(label);
  const red = suit === 'H' || suit === 'D';
  const wild = rank === '2' || rank === 'JK';
  const hand = size === 'hand';
  const width = hand ? sz.cardHandW : sz.cardTableW;
  const height = hand ? sz.cardHandH : sz.cardTableH;

  const face = (
    <View style={{
      width, height, borderRadius: hand ? radius.radiusCard : radius.radiusXs, backgroundColor: c.card,
      borderWidth: selected ? 2 : 1, borderColor: selected ? c.accent : c.cardEdge, padding: 3,
      boxShadow: selected ? shadow.shadowCardLift : shadow.shadowCard,
      transform: [{ translateY: selected ? -sz.selectLift : 0 }],
    }}>
      <Text style={[hand ? type.cardIndex : type.cardIndexSm, { color: red ? c.cardRed : c.cardInk }]}>
        {rank === 'JK' ? '★' : rank}
      </Text>
      {suit ? <Text style={{ color: red ? c.cardRed : c.cardInk, fontSize: hand ? 18 : 12 }}>{SUIT[suit]}</Text> : null}
      {wild ? (
        <View style={{ position: 'absolute', right: 0, top: 0, width: 0, height: 0, borderTopRightRadius: 4,
                       borderTopWidth: hand ? 14 : 9, borderLeftWidth: hand ? 14 : 9,
                       borderTopColor: c.wild, borderLeftColor: 'transparent' }} />
      ) : null}
    </View>
  );

  if (!onPress) return <View accessibilityLabel={spokenCard(label)}>{face}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={spokenCard(label)}
               accessibilityState={{ selected: !!selected }} hitSlop={4}>
      {face}
    </Pressable>
  );
}
