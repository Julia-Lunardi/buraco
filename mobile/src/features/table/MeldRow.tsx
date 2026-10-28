import { Pressable, Text, View } from 'react-native';

import type { MeldView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import Card from './Card';
import { CardSlot } from './motion';
import { useCardSizes } from './sizes';

interface Props {
  meld: MeldView;
  /** A tap would act on this meld (add the selection, or take the pile into it). */
  target?: boolean;
  onPress?(): void;
}

const isWild = (label: string) => label === 'JK' || label.startsWith('2');

/** Design system `MeldRow`: an overlapped meld. Sequences fan sideways; trincas (lavadeiras)
 * stack downwards, each card showing its index. A canastra lies with one card crosswise on top
 * (suja: the wild card, so "dirty" shows at a glance; limpa: the last card) plus a tag. */
export default function MeldRow({ meld, target, onPress }: Props) {
  const { c, space, radius, type } = useTheme();
  const { table, large } = useCardSizes();
  const kind = meld.canastra;
  const cw = table.w;
  const step = kind ? (large ? 15 : 12) : (large ? 22 : 18);
  let crossIndex = -1;
  if (kind) {
    crossIndex = kind === 'suja' ? meld.cards.findIndex((card) => isWild(card.label)) : -1;
    if (crossIndex < 0) crossIndex = meld.cards.length - 1;
  }
  const cross = crossIndex >= 0 ? meld.cards[crossIndex] : null;
  const body = meld.cards.filter((_, i) => i !== crossIndex);
  const ch = table.h;
  const vertical = meld.kind === 'trinca';
  const down = Math.round(ch * (kind ? 0.34 : 0.4)); // a trinca's step: enough for rank and suit
  const width = vertical ? cw : cw + step * Math.max(0, body.length - 1);
  const height = vertical ? ch + down * Math.max(0, body.length - 1) : ch;
  // Crosswise on a trinca: across the foot of the column, overhanging it on both sides.
  const overhang = vertical && cross ? Math.round((ch - cw) / 2) : 0;
  const crossTop = vertical ? height + 4 - Math.round(cw / 2 + ch / 2) : 0;
  const label = kind ? `Canastra ${t(`table.canastra_${kind}`)}, ${meld.cards.length}` : `${meld.cards.length}`;

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
               accessibilityLabel={label}
               style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.space2, padding: 6, borderRadius: radius.radiusMd,
                        borderWidth: 1.5, borderStyle: 'dashed', borderColor: target ? c.accent : 'transparent',
                        backgroundColor: target ? 'rgba(232, 178, 74, 0.08)' : 'transparent' }}>
      <View style={{ width, height: height + (vertical && cross ? 4 : 0), marginHorizontal: overhang,
                     marginRight: kind && !vertical ? Math.round(cw * 0.45) : overhang }}>
        {body.map((card, i) => (
          <CardSlot key={card.id} id={card.id} left={vertical ? 0 : i * step} top={vertical ? i * down : 0} zIndex={i}>
            <Card label={card.label} size="table" />
          </CardSlot>
        ))}
        {cross ? (
          <CardSlot key={cross.id} id={cross.id} left={vertical ? 0 : width - cw + Math.round(cw * 0.25)} top={crossTop}
                    zIndex={30}
                    style={{ transform: [{ rotate: '90deg' }] }}>
            <Card label={cross.label} size="table" />
          </CardSlot>
        ) : null}
      </View>
      {kind ? (
        <Text style={[type.caption, {
          fontSize: 11, lineHeight: 14, fontFamily: type.label.fontFamily, paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: radius.radiusPill, overflow: 'hidden',
          ...(kind === 'suja' ? { color: c.tableInk, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.tableInkSoft }
            : { color: c.cardInk, backgroundColor: c.card }),
        }]}>{t(`table.canastra_${kind}`)}</Text>
      ) : null}
    </Pressable>
  );
}
