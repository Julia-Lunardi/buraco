import { type ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import type { SeatView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { useFlights } from './flights';
import { useCardSizes } from './sizes';
import { FLIGHT_MS } from './timing';

interface Props {
  seats: SeatView[];
  handSizes: number[];
  currentSeat: number | null;
  score: number;
  /** Points this team has on the table this round (melds + canastras), not yet in `score`. */
  roundPoints?: number | null;
  /** The gold inset line: this team is to play. */
  active: boolean;
  /** Melds go above the strip on your side, below it on theirs. */
  meldsFirst: boolean;
  melds: ReactNode;
  trailing?: ReactNode;
  /** Tapping the empty part of your area lays the selection down as a new meld. */
  onPressArea?(): void;
  areaLabel?: string;
  /** A player here just took the lixo: "+n" rises from their avatar as the cards land. */
  gained?: { seat: number; n: number; key: number } | null;
  /** Landscape: the strip stands beside the melds instead of above or below them. */
  side?: boolean;
}

const initials = (name: string | null) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** One team's panel on the minimal table ("Jogo — mesa mínima"): avatars with card counts,
 * score, and the team's melds (the mortos lie by the stock: Piles.MortoStacks). No labels: the turn is a gold light. */
export default function TeamWell(props: Props) {
  const { c, space, radius, type } = useTheme();
  const { seats, handSizes, currentSeat, score, roundPoints, active, meldsFirst, melds, trailing, onPressArea,
          gained, side } = props;
  const flights = useFlights();
  const { table: card } = useCardSizes();

  const avatars = (
    <View style={{ flexDirection: 'row' }}>
      {seats.map((seat, i) => {
        const on = seat.seat === currentSeat;
        const bot = seat.bot || seat.covered_by_bot;
        const name = seat.is_you ? t('newTable.you') : bot && !seat.name ? t('newTable.bot') : seat.name ?? '—';
        const a11y = [name, seat.is_you ? null : t('table.cards', { n: handSizes[seat.seat] ?? 0 }),
                      on ? t('table.yourTurnA11y') : null, seat.covered_by_bot ? t('table.botA11y') : null]
          .filter(Boolean).join(', ');
        return (
          <View key={seat.seat} accessible accessibilityLabel={a11y} collapsable={false}
                ref={(view) => flights?.register(`seat:${seat.seat}`, view)}
                style={{ width: 38, height: 38, borderRadius: 19, marginLeft: i ? -6 : 0, backgroundColor: c.table,
                         alignItems: 'center', justifyContent: 'center', opacity: seat.connected === false ? 0.55 : 1,
                         borderWidth: bot ? 1.5 : 0, borderStyle: 'dashed', borderColor: c.tableInkSoft,
                         boxShadow: on ? `0 0 0 2px ${c.accent}, 0 0 14px rgba(232, 178, 74, 0.55)`
                           : i ? `0 0 0 2px ${c.tableRaised}` : undefined }}>
            <Text style={[type.label, { fontSize: 13, color: c.tableInk }]}>{seat.is_you ? initials(seat.name ?? t('newTable.you')) : initials(name)}</Text>
            {!seat.is_you ? (
              <Text style={{ position: 'absolute', right: -7, bottom: -5, minWidth: 19, height: 19, paddingHorizontal: 5,
                             borderRadius: 10, overflow: 'hidden', backgroundColor: c.tableRaised, color: c.tableInk,
                             fontFamily: type.label.fontFamily, fontSize: 11, lineHeight: 19, textAlign: 'center' }}>
                {handSizes[seat.seat] ?? 0}
              </Text>
            ) : null}
            {gained?.seat === seat.seat ? <GainChip key={gained.key} n={gained.n} /> : null}
          </View>
        );
      })}
    </View>
  );

  const tally = (
    <>
      <Text accessibilityLabel={t('table.pointsA11y', { n: score })}
            style={{ fontFamily: type.score.fontFamily, fontSize: 20, lineHeight: 24, color: c.tableInk, marginLeft: 4,
                     fontVariant: ['tabular-nums'] }}>{score.toLocaleString('pt-BR')}</Text>
      {roundPoints ? (
        <Text accessibilityLabel={t('table.onTableA11y', { n: roundPoints })}
              style={[type.label, { fontSize: 14, color: c.tableInkSoft, marginLeft: -4, fontVariant: ['tabular-nums'] }]}>
          +{roundPoints.toLocaleString('pt-BR')}
        </Text>
      ) : null}
      </>
  );

  // Landscape: players and score in a column at the left, the melds beside them.
  const strip = side ? (
    <View style={{ gap: 6, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {avatars}
        {trailing}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {tally}
      </View>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {avatars}
        {tally}
      </View>
      {trailing}
    </View>
  );

  const meldArea = (
    <Pressable onPress={onPressArea} disabled={!onPressArea} accessibilityRole={onPressArea ? 'button' : undefined}
               accessibilityLabel={onPressArea ? props.areaLabel : undefined}
               style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, columnGap: 2, alignContent: 'flex-start', minHeight: card.h + 14, // one meld row, plus its padding
                        flex: side ? 1 : undefined,
                        borderRadius: radius.radiusMd, borderWidth: onPressArea ? 1.5 : 0, borderStyle: 'dashed',
                        borderColor: c.accent }}>
      {melds}
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: c.tableRaised, borderRadius: 18, padding: side ? 8 : 10, paddingBottom: side ? 8 : 12,
                   gap: space.space3 - 2, flexDirection: side ? 'row' : 'column',
                   boxShadow: active ? `inset 0 0 0 1.5px ${c.accent}` : undefined }}>
      {side ? strip : meldsFirst ? meldArea : strip}
      {side ? meldArea : meldsFirst ? strip : meldArea}
    </View>
  );
}

/** "+7" in gold over an avatar: floats up and fades once the lixo has landed in that hand. */
function GainChip({ n }: { n: number }) {
  const { c, type } = useTheme();
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(FLIGHT_MS * 0.8, withSequence(
      withTiming(0.25, { duration: 180, easing: Easing.out(Easing.back(3)) }),
      withDelay(700, withTiming(1, { duration: 700, easing: Easing.in(Easing.quad) }))));
  }, [k]);
  const style = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : k.value < 0.25 ? 1 : 1 - (k.value - 0.25) / 0.75,
    transform: [{ translateY: -12 - 40 * k.value }, { scale: k.value < 0.25 ? 0.6 + 1.6 * k.value * 2 : 1.2 }],
  }));
  return (
    <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants"
                   style={[{ position: 'absolute', top: -6, zIndex: 20, paddingHorizontal: 8, borderRadius: 10,
                             backgroundColor: c.accent, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)' }, style]}>
      <Text style={{ fontFamily: type.label.fontFamily, fontSize: 14, lineHeight: 20, color: c.onAccent }}>+{n}</Text>
    </Animated.View>
  );
}
