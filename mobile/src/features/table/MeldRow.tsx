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

/** Design system `MeldRow`: an overlapped meld. Sequences fan sideways; trincas (lavadeiras)
 * stack downwards, each card showing its index. A canastra keeps every card readable (a card
 * laid crosswise used to hide its neighbours) and shows its kind with a frame and a tag:
 * limpa a gold frame with a glow, real the same with a second gold ring, suja a plain light frame. */
export default function MeldRow({ meld, target, onPress }: Props) {
  const { c, space, radius, type } = useTheme();
  const { table } = useCardSizes();
  const kind = meld.canastra;
  const cw = table.w;
  const ch = table.h;
  const step = Math.round(cw * 0.45); // each card shows its index
  const vertical = meld.kind === 'trinca';
  const down = Math.round(ch * 0.4); // a trinca's step: enough for rank and suit
  const n = meld.cards.length;
  const width = vertical ? cw : cw + step * Math.max(0, n - 1);
  const height = vertical ? ch + down * Math.max(0, n - 1) : ch;
  const label = kind ? `Canastra ${t(`table.canastra_${kind}`)}, ${n}` : `${n}`;
  const gold = kind === 'limpa' || kind === 'real';
  const frame = !kind ? null : {
    padding: 3, borderRadius: radius.radiusCard + 3, borderWidth: 2, borderColor: gold ? c.accent : c.tableInkSoft,
    // Real: a second gold ring outside the first.
    ...(kind === 'real' ? { outlineWidth: 1.5, outlineStyle: 'solid' as const, outlineColor: c.accent, outlineOffset: 2 } : {}),
    backgroundColor: gold ? 'rgba(232, 178, 74, 0.14)' : 'rgba(255, 255, 255, 0.06)',
    boxShadow: gold ? '0 0 12px rgba(232, 178, 74, 0.55)' : undefined,
  };

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
               accessibilityLabel={label}
               style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.space2, padding: 6, borderRadius: radius.radiusMd,
                        borderWidth: 1.5, borderStyle: 'dashed', borderColor: target ? c.accent : 'transparent',
                        backgroundColor: target ? 'rgba(232, 178, 74, 0.08)' : 'transparent' }}>
      <View style={frame ?? undefined}>
        <View style={{ width, height }}>
          {meld.cards.map((card, i) => (
            <CardSlot key={card.id} id={card.id} left={vertical ? 0 : i * step} top={vertical ? i * down : 0} zIndex={i}>
              <Card label={card.label} size="table" />
            </CardSlot>
          ))}
        </View>
      </View>
      {kind ? (
        <Text style={[type.caption, {
          fontSize: 11, lineHeight: 14, fontFamily: type.label.fontFamily, paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: radius.radiusPill, overflow: 'hidden',
          ...(gold ? { color: c.onAccent, backgroundColor: c.accent }
            : { color: c.tableInk, borderWidth: 1, borderColor: c.tableInkSoft }),
        }]}>{t(`table.canastra_${kind}`)}</Text>
      ) : null}
    </Pressable>
  );
}
