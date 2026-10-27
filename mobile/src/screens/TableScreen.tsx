import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeldView, SeatView, TableView } from '../api/tables';
import Button from '../components/Button';
import PlayingCard from '../components/PlayingCard';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import PushPrimer from '../notifications/PushPrimer';
import { usePushOffer } from '../notifications/usePushOffer';
import { useTableSocket } from '../realtime/useTableSocket';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

/**
 * A FUNCTIONAL table, so the whole flow can be played on a device now. The designed table
 * (Claude Design: portrait and landscape, phone and tablet, motion) replaces this layout;
 * the data flow (useTableSocket, card ids, actions) stays.
 */
export default function TableScreen({ navigation, route }: Props) {
  const { tableId } = route.params;
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { table, connected, error, act, nextRound } = useTableSocket(tableId);
  const push = usePushOffer();
  const [picked, setPicked] = useState<number[]>([]);

  const game = table?.game ?? null;
  // Derived, not synced: after any new state, only cards still in the hand stay selected.
  const selected = picked.filter((id) => game?.hand.some((card) => card.id === id));

  if (!table) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.table }}>
        <ActivityIndicator color={c.tableInk} />
      </View>
    );
  }

  const me = table.my_seat ?? 0;
  const myTeam = me % 2;
  const myTurn = game !== null && game.current === me && table.status === 'playing';
  const teamName = (team: number) => (team === myTeam ? t('table.us') : t('table.them'));
  const seatName = (seat: SeatView) => seat.is_you ? t('newTable.you') : seat.bot ? t('newTable.bot') : seat.name ?? '—';
  const toggle = (id: number) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const run = (action: Parameters<typeof act>[0]) => { act(action); setPicked([]); };

  const turnLine = () => {
    if (!game || table.status !== 'playing') return '';
    if (myTurn) return game.phase === 'draw' ? t('table.drawFirst') : t('table.meldOrDiscard');
    return t('table.turnOf', { name: seatName(table.seats[game.current]) });
  };

  const meldRow = (meld: MeldView, mine: boolean) => (
    <Pressable key={meld.id} disabled={!mine || !myTurn || game?.phase !== 'play' || selected.length === 0}
               onPress={() => run({ type: 'add_to_meld', meld: meld.id, cards: selected })}
               accessibilityRole={mine ? 'button' : undefined}
               accessibilityHint={mine && selected.length ? t('table.addTo') : undefined}
               style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: space.space1,
                        borderRadius: radius.radiusMd, backgroundColor: c.tableRaised,
                        borderWidth: meld.canastra ? 2 : 0, borderStyle: meld.canastra === 'suja' ? 'dashed' : 'solid',
                        borderColor: meld.canastra ? (mine ? c.teamA : c.teamB) : 'transparent' }}>
      {meld.cards.map((card) => <PlayingCard key={card.id} label={card.label} size="table" />)}
      {meld.canastra ? (
        <Text style={[type.caption, { color: c.tableInk, alignSelf: 'center', marginLeft: space.space1 }]}>
          {t(`table.canastra_${meld.canastra}`)}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.table, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: space.space3, gap: space.space3, paddingBottom: space.space6 }}>
        {/* Scores and turn */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {[myTeam, 1 - myTeam].map((team) => (
            <Text key={team} style={[type.score, { color: team === 0 ? c.teamA : c.teamB, fontVariant: ['tabular-nums'] }]}>
              {team === 0 ? '● ' : '◆ '}{teamName(team)} {table.scores[team].toLocaleString('pt-BR')}
            </Text>
          ))}
        </View>
        <Text style={[type.body, { color: myTurn ? c.accent : c.tableInkSoft }]} accessibilityLiveRegion="polite">
          {connected ? turnLine() : t('table.reconnecting')}
        </Text>
        {table.seats.filter((s) => s.covered_by_bot).map((s) => (
          <Text key={s.seat} style={[type.caption, { color: c.tableInkSoft }]}>{t('table.botFor', { name: s.name ?? '' })}</Text>
        ))}

        {game ? (
          <>
            {/* Melds, per team */}
            {[myTeam, 1 - myTeam].map((team) => (
              <View key={team} style={{ gap: space.space2 }}>
                <Text style={[type.label, { color: team === 0 ? c.teamA : c.teamB }]}>
                  {team === 0 ? '● ' : '◆ '}{teamName(team)} · {game.teams[team].morto_waiting
                    ? t('table.mortoWaiting') : t('table.mortoTaken')}
                </Text>
                {game.teams[team].melds.map((meld) => meldRow(meld, team === myTeam))}
              </View>
            ))}

            {/* Stock and pile */}
            <View style={{ flexDirection: 'row', gap: space.space3, alignItems: 'center' }}>
              <Text style={[type.caption, { color: c.tableInkSoft }]}>{t('table.stock', { n: game.stock_size })}</Text>
              {game.discard.length ? (
                <>
                  <PlayingCard label={game.discard[game.discard.length - 1].label} size="table" />
                  <Text style={[type.caption, { color: c.tableInkSoft }]}>{t('table.pile', { n: game.discard.length })}</Text>
                </>
              ) : <Text style={[type.caption, { color: c.tableInkSoft }]}>{t('table.emptyPile')}</Text>}
            </View>

            {/* Actions */}
            {myTurn && game.phase === 'draw' ? (
              <View style={{ flexDirection: 'row', gap: space.space2 }}>
                <View style={{ flex: 1 }}><Button label={t('table.draw')} onPress={() => run({ type: 'draw' })} /></View>
                {game.discard.length ? (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label={t('table.takePile', { n: game.discard.length })}
                            onPress={() => run({ type: 'take_discard' })} />
                  </View>
                ) : null}
              </View>
            ) : null}
            {myTurn && game.phase === 'play' ? (
              <View style={{ flexDirection: 'row', gap: space.space2 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" label={t('table.layDown')} disabled={selected.length < 3}
                          onPress={() => run({ type: 'lay_down', cards: selected })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={t('table.discard')} disabled={selected.length !== 1}
                          onPress={() => run({ type: 'discard', card: selected[0] })} />
                </View>
              </View>
            ) : null}
            {error ? <Text style={[type.body, { color: c.invalid }]} accessibilityLiveRegion="polite">{error.detail}</Text> : null}

            {/* Hand */}
            {myTurn && game.phase === 'play' && !selected.length
              ? <Text style={[type.caption, { color: c.tableInkSoft }]}>{t('table.select')}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.space1, paddingTop: space.space3 }}>
              {game.hand.map((card) => (
                <PlayingCard key={card.id} label={card.label} selected={selected.includes(card.id)}
                             onPress={() => toggle(card.id)} />
              ))}
            </View>
          </>
        ) : null}

        {table.status === 'round_over' || table.status === 'finished' ? (
          <RoundSummary table={table} myTeam={myTeam} teamName={teamName} />
        ) : null}
        {table.status === 'round_over' ? <Button label={t('table.nextRound')} onPress={nextRound} /> : null}
        {table.status === 'finished' ? (
          <Button label={t('table.backHome')} variant="secondary" onPress={() => navigation.popToTop()} />
        ) : null}
      </ScrollView>
      <PushPrimer visible={push.visible} onAllow={() => { void push.allow(); }} onLater={() => { void push.later(); }} />
    </View>
  );
}

function RoundSummary({ table, myTeam, teamName }: { table: TableView; myTeam: number; teamName(team: number): string }) {
  const { c, space, radius, type } = useTheme();
  const last = table.rounds[table.rounds.length - 1];
  return (
    <View style={{ backgroundColor: c.tableRaised, borderRadius: radius.radiusMd, padding: space.space4, gap: space.space2 }}>
      <Text style={[type.heading, { color: c.tableInk }]}>
        {table.status === 'finished' && table.winner !== null
          ? t('table.winner', { team: teamName(table.winner) }) : t('table.roundOver')}
      </Text>
      {last ? [myTeam, 1 - myTeam].map((team) => (
        <Text key={team} style={[type.body, { color: c.tableInk, fontVariant: ['tabular-nums'] }]}>
          {teamName(team)}: {last[team].total.toLocaleString('pt-BR')} · {table.scores[team].toLocaleString('pt-BR')} {t('table.points')}
        </Text>
      )) : null}
    </View>
  );
}
