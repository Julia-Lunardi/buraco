import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SeatView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { useFlights } from './flights';

interface Props {
  seats: SeatView[];
  handSizes: number[];
  currentSeat: number | null;
  score: number;
  mortoWaiting: boolean;
  /** The gold inset line: this team is to play. */
  active: boolean;
  /** Melds go above the strip on your side, below it on theirs. */
  meldsFirst: boolean;
  melds: ReactNode;
  trailing?: ReactNode;
  /** Tapping the empty part of your area lays the selection down as a new meld. */
  onPressArea?(): void;
  areaLabel?: string;
}

const initials = (name: string | null) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** One team's panel on the minimal table ("Jogo — mesa mínima"): avatars with card counts,
 * score, a tiny morto marker, and the team's melds. No labels: the turn is a gold light. */
export default function TeamWell(props: Props) {
  const { c, space, radius, type } = useTheme();
  const { seats, handSizes, currentSeat, score, mortoWaiting, active, meldsFirst, melds, trailing, onPressArea } = props;
  const flights = useFlights();

  const strip = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
              </View>
            );
          })}
        </View>
        <Text accessibilityLabel={t('table.pointsA11y', { n: score })}
              style={{ fontFamily: type.score.fontFamily, fontSize: 20, lineHeight: 24, color: c.tableInk, marginLeft: 4,
                       fontVariant: ['tabular-nums'] }}>{score.toLocaleString('pt-BR')}</Text>
        <View accessible accessibilityLabel={mortoWaiting ? t('table.mortoOnTable') : t('table.mortoGone')}
              style={{ width: 23, height: 30, marginLeft: 2 }}>
          {mortoWaiting ? (
            <>
              <View style={{ position: 'absolute', left: 4, top: 0, width: 19, height: 27, borderRadius: 3, borderWidth: 2,
                             backgroundColor: c.cardBack, borderColor: c.cardBackPattern }} />
              <View style={{ position: 'absolute', left: 0, top: 3, width: 19, height: 27, borderRadius: 3, borderWidth: 2,
                             backgroundColor: c.cardBack, borderColor: c.cardBackPattern,
                             boxShadow: '0 1px 3px rgba(0, 0, 0, 0.45)' }} />
            </>
          ) : (
            <View style={{ position: 'absolute', left: 0, top: 3, width: 19, height: 27, borderRadius: 3, borderWidth: 1.5,
                           borderStyle: 'dashed', borderColor: c.tableInkSoft, opacity: 0.6 }} />
          )}
        </View>
      </View>
      {trailing}
    </View>
  );

  const meldArea = (
    <Pressable onPress={onPressArea} disabled={!onPressArea} accessibilityRole={onPressArea ? 'button' : undefined}
               accessibilityLabel={onPressArea ? props.areaLabel : undefined}
               style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, columnGap: 2, alignContent: 'flex-start', minHeight: 63,
                        borderRadius: radius.radiusMd, borderWidth: onPressArea ? 1.5 : 0, borderStyle: 'dashed',
                        borderColor: c.accent }}>
      {melds}
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: c.tableRaised, borderRadius: 18, padding: 10, paddingBottom: 12, gap: space.space3 - 2,
                   boxShadow: active ? `inset 0 0 0 1.5px ${c.accent}` : undefined }}>
      {meldsFirst ? meldArea : strip}
      {meldsFirst ? strip : meldArea}
    </View>
  );
}
