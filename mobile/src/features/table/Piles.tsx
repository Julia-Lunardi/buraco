import { Pressable, Text, View } from 'react-native';

import type { CardView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import Card from './Card';
import { CardSlot } from './motion';
import { useCardSizes } from './sizes';

function Badge({ n }: { n: number }) {
  const { c, radius } = useTheme();
  return (
    <Text style={{ position: 'absolute', right: -8, top: -8, zIndex: 60, minWidth: 22, height: 22, paddingHorizontal: 6,
                   borderRadius: radius.radiusPill, overflow: 'hidden', backgroundColor: c.tableRaised, color: c.tableInk,
                   fontFamily: 'AtkinsonHyperlegibleNext_700Bold', fontSize: 12, lineHeight: 22, textAlign: 'center',
                   fontVariant: ['tabular-nums'] }}>{n}</Text>
  );
}

/** Design system `Stock` (minimal): two face-down cards and a count badge; it glows when
 * drawing is the move to make, and a tap draws. */
export function Stock({ count, active, onPress }: { count: number; active: boolean; onPress?(): void }) {
  const { c, radius } = useTheme();
  const { pile } = useCardSizes();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
               accessibilityLabel={`${t('table.stock', { n: count })}${active ? `. ${t('table.draw')}` : ''}`}
               style={{ width: pile.w + 3, height: pile.h + 3, borderRadius: radius.radiusCard,
                        boxShadow: active ? `0 0 0 2px ${c.accent}, 0 0 18px rgba(232, 178, 74, 0.35)` : undefined }}>
      <Card faceDown size="pile" style={{ position: 'absolute', left: 3, top: 3 }} />
      <Card faceDown size="pile" style={{ position: 'absolute', left: 0, top: 0 }} />
      <Badge n={count} />
    </Pressable>
  );
}

interface PileProps {
  cards: CardView[];
  width: number;
  /** A tap on the lixo takes it (your turn to draw). */
  takeable?: boolean;
  /** A tap discards the selected card. */
  target?: boolean;
  onTake?(): void;
  onDiscard?(): void;
}

/** Design system `DiscardPile` (spread): every card in the lixo fanned out so all are
 * readable, the last one on top; when it can be taken it glows and a tap on it takes it. */
export function DiscardPile({ cards, width, takeable, target, onTake, onDiscard }: PileProps) {
  const { c, radius } = useTheme();
  const { pile } = useCardSizes();
  const n = cards.length;
  const cw = pile.w;
  const ch = pile.h;
  const maxStep = Math.round(cw * 0.62);
  const minStep = Math.round(cw * 0.42);
  const rows = n > 1 && (width - cw) / (n - 1) < minStep ? 2 : 1;
  const per = Math.ceil(n / rows);
  const step = per > 1 ? Math.min(maxStep, (width - cw) / (per - 1)) : 0;
  const rowGap = Math.round(ch * 0.52);
  const boxW = n ? cw + step * Math.max(0, per - 1) : cw;
  const boxH = ch + rowGap * (rows - 1);
  const onPress = takeable ? onTake : target ? onDiscard : undefined;
  const label = takeable ? t('table.takePile', { n })
    : `${n ? t('table.pile', { n }) : t('table.emptyPile')}${target ? `. ${t('table.discard')}` : ''}`;

  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Pressable onPress={onPress} disabled={!onPress} hitSlop={8}
                 accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}
                 style={{ width: boxW, height: boxH, borderRadius: 6,
                          outlineWidth: onPress ? 1.5 : 0, outlineStyle: takeable ? 'solid' : 'dashed', outlineColor: c.accent,
                          outlineOffset: 6, boxShadow: takeable ? '0 0 18px rgba(232, 178, 74, 0.35)' : undefined }}>
        {n ? cards.map((card, i) => (
          <CardSlot key={card.id} id={card.id} left={(i % per) * step} top={Math.floor(i / per) * rowGap} zIndex={i}>
            <Card label={card.label} size="pile" />
          </CardSlot>
        )) : (
          <View style={{ width: cw, height: ch, borderRadius: radius.radiusXs, borderWidth: 1.5, borderStyle: 'dashed',
                         borderColor: c.tableLine }} />
        )}
        {n ? <Badge n={n} /> : null}
      </Pressable>
    </View>
  );
}
