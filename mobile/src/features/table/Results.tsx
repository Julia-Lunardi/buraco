import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TableView, TeamScore } from '../../api/tables';
import Button from '../../components/Button';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import Card from './Card';

// Same values as backend app/engine/presets.py (equal in every preset).
const BONUS = { limpa: 200, suja: 100, real: 500 };

const fmt = (n: number) => n.toLocaleString('pt-BR');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

function useTeams(table: TableView) {
  const { c } = useTheme();
  const myTeam = (table.my_seat ?? 0) % 2;
  const opponent = table.seats.find((s) => s.team !== myTeam);
  const solo = table.num_players === 2;
  return {
    myTeam,
    order: [myTeam, 1 - myTeam] as const,
    label: (team: number) => (team === myTeam ? t('table.us') : solo && opponent?.name ? opponent.name : t('table.them')),
    ink: (team: number) => (team === 0 ? c.teamAInk : c.teamBInk),
    fill: (team: number) => (team === 0 ? c.teamA : c.teamB),
    solo,
    opponentName: opponent?.bot && !opponent.name ? t('newTable.bot') : opponent?.name ?? t('table.them'),
  };
}

function Sheet({ children }: { children: React.ReactNode }) {
  const { c, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.space5, paddingBottom: insets.bottom + space.space5,
                                           paddingHorizontal: space.space4, gap: space.space4, maxWidth: 560, width: '100%',
                                           alignSelf: 'center' }}>
        {children}
      </ScrollView>
    </View>
  );
}

function Row({ cells, strong, head }: { cells: (string | { text: string; color: string })[]; strong?: boolean; head?: boolean }) {
  const { c, space, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: space.space2, borderTopWidth: head ? 0 : 1, borderTopColor: c.line }}>
      {cells.map((cell, i) => {
        const text = typeof cell === 'string' ? cell : cell.text;
        const color = typeof cell === 'string' ? (head ? c.inkSoft : c.ink) : cell.color;
        return (
          <Text key={i} style={[head ? type.caption : strong ? type.bodyStrong : type.body,
                                { color, flex: i ? 1 : 2, textAlign: i ? 'right' : 'left', fontVariant: ['tabular-nums'] }]}>
            {text}
          </Text>
        );
      })}
    </View>
  );
}

/** Design `RoundSummary`: who went out, the round's points per item, and the running totals. */
export function RoundSummary({ table, onNext }: { table: TableView; onNext(): void }) {
  const { c, space, radius, type } = useTheme();
  const teams = useTeams(table);
  const round = table.rounds[table.rounds.length - 1];
  if (!round) return null;
  const wentOut = table.game?.went_out ?? null;
  const subtitle = wentOut === null ? t('table.stockOut')
    : wentOut === table.my_seat ? t('table.youWentOut')
    : wentOut % 2 === teams.myTeam ? t('table.weWentOut')
    : teams.solo ? t('table.theyWentOut', { name: teams.opponentName }) : t('table.theyWentOutTeam');
  const per = (f: (s: TeamScore) => string) => teams.order.map((team) => f(round[team]));
  const anyReal = round.some((s) => s.canastras.real > 0);
  const left = table.target_score - table.scores[teams.myTeam];

  return (
    <Sheet>
      <View style={{ gap: space.space1 }}>
        <Text style={[type.title, { color: c.ink }]} accessibilityRole="header">{t('table.roundN', { n: table.rounds.length })}</Text>
        <Text style={[type.body, { color: c.inkSoft }]}>{subtitle}</Text>
      </View>
      <View>
        <Row head cells={[t('table.item'), ...teams.order.map((team) => ({ text: teams.label(team), color: teams.ink(team) }))]} />
        <Row cells={[t('table.cardsOnTable'), ...per((s) => fmt(s.melded))]} />
        <Row cells={[t('table.canastraLimpaRow'), ...per((s) => fmt(s.canastras.limpa * BONUS.limpa))]} />
        <Row cells={[t('table.canastraSujaRow'), ...per((s) => fmt(s.canastras.suja * BONUS.suja))]} />
        {anyReal ? <Row cells={[t('table.canastraRealRow'), ...per((s) => fmt(s.canastras.real * BONUS.real))]} /> : null}
        <Row cells={[t('table.bater'), ...per((s) => fmt(s.bater))]} />
        <Row cells={[t('table.morto'), ...per((s) => (s.morto_penalty ? signed(s.morto_penalty) : t('table.mortoPego')))]} />
        <Row cells={[t('table.handRow'), ...per((s) => signed(s.hand_penalty))]} />
        <Row strong cells={[t('table.thisRound'), ...per((s) => signed(s.total))]} />
      </View>

      <View style={{ backgroundColor: c.surfaceRaised, borderRadius: radius.radiusMd, padding: space.space4, gap: space.space3 }}>
        <Text style={[type.caption, { color: c.inkSoft, letterSpacing: 1 }]}>{t('table.totalTo', { target: fmt(table.target_score) })}</Text>
        {teams.order.map((team) => (
          <View key={team} style={{ gap: space.space1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[type.label, { color: teams.ink(team) }]}>{teams.label(team)}</Text>
              <Text style={[type.score, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{fmt(table.scores[team])}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceSunken, overflow: 'hidden' }}>
              <View style={{ height: 6, backgroundColor: teams.fill(team),
                             width: `${Math.max(0, Math.min(100, (table.scores[team] / table.target_score) * 100))}%` }} />
            </View>
          </View>
        ))}
        {left > 0 ? <Text style={[type.body, { color: c.inkSoft }]}>{t('table.pointsLeft', { n: fmt(left) })}</Text> : null}
      </View>
      <Button label={t('table.nextRound')} onPress={onNext} />
    </Sheet>
  );
}

/** Design `GameOver`: the winner, both final scores, and every round. */
export function GameOver({ table, onAgain, onHome }: { table: TableView; onAgain?(): void; onHome(): void }) {
  const { c, space, radius, type } = useTheme();
  const teams = useTeams(table);
  const won = table.winner === teams.myTeam;
  const headline = won ? (teams.solo ? t('table.youWon') : t('table.weWon'))
    : teams.solo ? t('table.theyWon', { name: teams.opponentName }) : t('table.theyWonTeam');

  return (
    <Sheet>
      <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: space.space3 }} importantForAccessibility="no-hide-descendants">
        {['JS', 'QS', 'KS'].map((label, i) => (
          <Card key={label} label={label} size="pile"
                style={{ marginLeft: i ? -18 : 0, transform: [{ rotate: `${(i - 1) * 10}deg` }, { translateY: i === 1 ? -6 : 0 }] }} />
        ))}
      </View>
      <View style={{ gap: space.space1, alignItems: 'center' }}>
        <Text style={[type.caption, { color: c.inkSoft }]}>{t('table.gameOverRounds', { n: table.rounds.length })}</Text>
        <Text style={[type.title, { color: c.ink, textAlign: 'center' }]} accessibilityRole="header">{headline}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space.space3 }}>
        {teams.order.map((team) => (
          <View key={team} style={{ flex: 1, backgroundColor: c.surfaceRaised, borderRadius: radius.radiusMd, padding: space.space3,
                                    gap: space.space1, borderWidth: 2,
                                    borderColor: table.winner === team ? teams.ink(team) : 'transparent' }}>
            <Text style={[type.label, { color: teams.ink(team) }]}>{teams.label(team)}</Text>
            <Text style={[type.scoreLg, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{fmt(table.scores[team])}</Text>
          </View>
        ))}
      </View>
      <View>
        <Row head cells={[t('table.round'), ...teams.order.map((team) => ({ text: teams.label(team), color: teams.ink(team) }))]} />
        {table.rounds.map((round, i) => (
          <Row key={i} cells={[String(i + 1), ...teams.order.map((team) => signed(round[team].total))]} />
        ))}
      </View>
      <View style={{ gap: space.space2 }}>
        {onAgain ? <Button label={table.rematch_id ? t('table.joinRematch') : t('table.playAgain')} onPress={onAgain} /> : null}
        <Button label={t('table.backHome')} variant={onAgain ? 'quiet' : 'primary'} onPress={onHome} />
      </View>
    </Sheet>
  );
}
