import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getTable, type TableSummary, type TableView } from '../../api/tables';
import Button from '../../components/Button';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import MeldRow from '../table/MeldRow';

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** The detail pane of the iPad home (Claude Design "Início · iPad paisagem"): the selected
 * table's rules and players, then a felt with both scores, whose turn it is and each team's
 * melds, so you can see where a game stands before opening it. */
export default function TablePreview({ row, title, onOpen }: { row: TableSummary; title: string; onOpen(): void }) {
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<{ id: string; view: TableView | null } | null>(null);

  useEffect(() => {
    let live = true;
    getTable(row.id).then((view) => live && setLoaded({ id: row.id, view }))
      .catch(() => live && setLoaded({ id: row.id, view: null }));
    return () => { live = false; };
  }, [row.id]);

  const view = loaded?.id === row.id ? loaded.view : undefined;
  const myTeam = row.my_seat % 2;
  const meta = [row.mode === 'live' ? t('newTable.live') : t('newTable.async'), t(`newTable.${row.preset}`),
                t('home.upTo', { n: fmt(row.target_score) }),
                view?.rounds.length ? t('table.roundN', { n: view.rounds.length + (view.status === 'playing' ? 1 : 0) }).toLowerCase() : null]
    .filter(Boolean).join(' · ');
  const turn = row.your_turn ? t('home.yourTurn') : row.status === 'lobby' ? t('home.lobby')
    : row.status === 'round_over' ? t('home.roundOver')
    : row.turn_of?.bot || !row.turn_of?.name ? t('home.waitingBot') : t('home.waitingFor', { name: row.turn_of.name });

  const chip = (team: number, label: string, score: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.tableRaised, borderRadius: 999,
                   paddingVertical: 6, paddingHorizontal: 12 }}>
      <View style={{ width: 9, height: 9, backgroundColor: team === 0 ? c.teamA : c.teamB,
                     ...(team === 0 ? { borderRadius: 5 } : { borderRadius: 1, transform: [{ rotate: '45deg' }] }) }} />
      <Text style={[type.label, { color: c.tableInk }]}>{label}</Text>
      <Text style={[type.score, { color: c.tableInk, fontVariant: ['tabular-nums'] }]}>{fmt(score)}</Text>
    </View>
  );

  const teamBox = (team: number) => (
    <View key={team} style={{ backgroundColor: c.tableRaised, borderRadius: radius.radiusMd, paddingVertical: 10,
                              paddingHorizontal: 12, gap: space.space2 }}>
      <Text style={[type.caption, { fontFamily: type.label.fontFamily, color: c.tableInk }]}>
        {team === myTeam ? t('table.us') : t('table.them')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 40 }}>
        {view?.game?.teams[team].melds.map((meld) => <MeldRow key={meld.id} meld={meld} />)}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: space.space6, paddingTop: insets.top + space.space5, paddingRight: insets.right + space.space6,
                   paddingBottom: insets.bottom + space.space5, gap: space.space5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.space4 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.caption, { color: c.inkSoft }]}>{meta}</Text>
          <Text style={[type.title, { color: c.ink }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
        </View>
        <View style={{ minWidth: 160 }}><Button label={t('home.open')} onPress={onOpen} /></View>
      </View>
      <View style={{ flex: 1, backgroundColor: c.table, borderRadius: 20, padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.space2 }}>
          <View style={{ flexDirection: 'row', gap: space.space2 }}>
            {chip(myTeam, row.num_players === 2 ? t('newTable.you') : t('table.us'), row.scores?.[0] ?? 0)}
            {chip(1 - myTeam, t('table.them'), row.scores?.[1] ?? 0)}
          </View>
          <Text style={[type.bodyStrong, { color: row.your_turn ? c.accent : c.tableInkSoft }]}>{turn}</Text>
        </View>
        {view === undefined ? <ActivityIndicator color={c.tableInk} style={{ marginTop: space.space6 }} /> : (
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            {view?.game ? [1 - myTeam, myTeam].map(teamBox) : null}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
