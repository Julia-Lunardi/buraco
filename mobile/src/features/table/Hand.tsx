import { View } from 'react-native';

import type { CardView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import Card from './Card';
import { CardSlot, ENTER_HAND } from './motion';
import { useCardSizes } from './sizes';

interface Props {
  cards: CardView[];
  selected: number[];
  selectionValid: boolean;
  width: number;
  onToggle(id: number): void;
}

/** Design system `Hand`: one overlapping row while every card shows at least its index
 * (43% of a card), two offset rows past that, so a 25-card hand stays readable. */
export default function Hand({ cards, selected, selectionValid, width, onToggle }: Props) {
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
                <CardSlot key={card.id} left={i * step} zIndex={i + 1} entering={ENTER_HAND}>
                  <Card label={card.label} selected={isSel ? (selectionValid ? 'valid' : true) : false}
                        onPress={() => onToggle(card.id)} />
                </CardSlot>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
