import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { myTables, type TableSummary } from '../api/tables';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import Card from '../features/table/Card';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const fmt = (n: number) => n.toLocaleString('pt-BR');
const listOf = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')}${t('home.and')}${names[names.length - 1]}`;

/** Home (Claude Design "Início"): new table and join side by side, your unfinished tables
 * (yours-to-play first, ordered by the server) and a practice row. With no tables yet, the
 * first-time version: a small felt with two cards, a short welcome and the three actions. */
export default function HomeScreen({ navigation }: Props) {
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const guest = !!user?.is_guest;

  const load = useCallback(async () => {
    try {
      setTables(await myTables());
      setError('');
    } catch (e) {
      setError(errorDetail(e, t('common.offline')));
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = (row: TableSummary) => navigation.navigate(row.status === 'lobby' ? 'Lobby' : 'Table', { tableId: row.id });
  const practice = () => navigation.navigate('NewTable', { practice: true });

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: type.wordmark.fontFamily, fontSize: 30, lineHeight: 34, color: c.ink }}
            accessibilityRole="header">{t('appName')}</Text>
      <Pressable onPress={() => navigation.navigate('Settings')} accessibilityRole="button" accessibilityLabel={t('settings.title')}
                 style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line,
                                            backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center',
                                            opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="settings-outline" size={22} color={c.ink} />
      </Pressable>
    </View>
  );

  const sectionTitle = (text: string) => (
    <Text style={[type.caption, { color: c.inkSoft, fontFamily: type.label.fontFamily, letterSpacing: 0.3 }]}
          accessibilityRole="header">{text}</Text>
  );

  const status = (row: TableSummary) => {
    if (row.your_turn) {
      return (
        <Text style={[type.caption, { fontFamily: type.label.fontFamily, color: c.onAccent, backgroundColor: c.accent,
                                      borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4 }]}>
          {t('home.yourTurn')}
        </Text>
      );
    }
    const text = row.status === 'lobby' ? t('home.lobby') : row.status === 'round_over' ? t('home.roundOver')
      : row.turn_of?.bot || !row.turn_of?.name ? t('home.waitingBot') : t('home.waitingFor', { name: row.turn_of.name });
    return <Text style={[type.caption, { color: c.inkSoft, maxWidth: 110, textAlign: 'right' }]} numberOfLines={2}>{text}</Text>;
  };

  const tableRow = (row: TableSummary, i: number) => {
    const others = row.players.filter((_, seat) => seat !== row.my_seat).map((p) => p ?? t('home.bot'));
    const meta = [row.mode === 'live' ? t('newTable.live') : t('newTable.async'), t(`newTable.${row.preset}`),
                  t('home.upTo', { n: fmt(row.target_score) })].join(' · ');
    const solo = row.num_players === 2;
    return (
      <Pressable key={row.id} onPress={() => open(row)} accessibilityRole="button"
                 style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.space3, minHeight: 72,
                                            paddingVertical: 14, paddingHorizontal: space.space4, opacity: pressed ? 0.7 : 1,
                                            borderTopWidth: i ? 1 : 0, borderTopColor: c.line })}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>
            {others.length ? listOf(others) : t('home.nobodyYet', { code: row.code })}
          </Text>
          <Text style={[type.caption, { color: c.inkSoft }]} numberOfLines={1}>{meta}</Text>
          {row.scores ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.teamAInk }} />
              <Text style={[type.caption, { color: c.inkSoft, fontVariant: ['tabular-nums'] }]}>
                {solo ? t('newTable.you') : t('table.us')} {fmt(row.scores[0])}
              </Text>
              <View style={{ width: 7, height: 7, marginLeft: 6, borderRadius: 1, transform: [{ rotate: '45deg' }],
                             backgroundColor: c.teamBInk }} />
              <Text style={[type.caption, { color: c.inkSoft, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
                {solo && others[0] ? others[0] : t('table.them')} {fmt(row.scores[1])}
              </Text>
            </View>
          ) : null}
        </View>
        {status(row)}
      </Pressable>
    );
  };

  const box = { backgroundColor: c.surfaceRaised, borderRadius: radius.radiusMd, borderWidth: 1, borderColor: c.line,
                overflow: 'hidden' as const };
  const page = { flexGrow: 1, paddingTop: insets.top + space.space3, paddingBottom: insets.bottom + space.space5,
                 paddingHorizontal: space.space4, gap: space.space5, maxWidth: 720, width: '100%' as const, alignSelf: 'center' as const };

  if (tables === null && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.inkSoft} />
      </View>
    );
  }

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }} />;

  // First time: nothing to list yet.
  if (!tables?.length) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={page} refreshControl={refresh}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: space.space4 }}>
          <View style={{ width: 150, height: 110, borderRadius: 20, backgroundColor: c.table, flexDirection: 'row',
                         alignItems: 'center', justifyContent: 'center', gap: 10 }} importantForAccessibility="no-hide-descendants">
            <Card faceDown size="table" />
            <Card label="KC" size="table" />
          </View>
          <View style={{ gap: space.space2 }}>
            <Text style={[type.heading, { color: c.ink, textAlign: 'center' }]}>{t('home.emptyTitle')}</Text>
            <Text style={[type.body, { color: c.inkSoft, textAlign: 'center' }]}>
              {guest ? t('home.signInForFriends') : t('home.emptyBody')}
            </Text>
            {error ? <Text style={[type.body, { color: c.inkSoft, textAlign: 'center' }]}>{error}</Text> : null}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {!guest ? (
            <>
              <Button label={t('home.newTable')} onPress={() => navigation.navigate('NewTable')} />
              <Button label={t('home.joinWithCode')} variant="secondary" onPress={() => navigation.navigate('Join')} />
            </>
          ) : null}
          <Button label={t('home.practice')} variant={guest ? 'primary' : 'quiet'} onPress={practice} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={page} refreshControl={refresh}>
      {header}
      {!guest ? (
        <View style={{ flexDirection: 'row', gap: space.space2 }}>
          <View style={{ flex: 1 }}><Button label={t('home.newTable')} onPress={() => navigation.navigate('NewTable')} /></View>
          <View style={{ flex: 1 }}>
            <Button label={t('home.joinWithCode')} variant="secondary" onPress={() => navigation.navigate('Join')} />
          </View>
        </View>
      ) : <Text style={[type.caption, { color: c.inkSoft }]}>{t('home.signInForFriends')}</Text>}
      {error ? <Text style={[type.body, { color: c.inkSoft }]}>{error}</Text> : null}

      <View style={{ gap: space.space2 }}>
        {sectionTitle(t('home.yourTables').toUpperCase())}
        <View style={box}>{tables.map(tableRow)}</View>
      </View>

      <View style={{ gap: space.space2 }}>
        {sectionTitle(t('home.practiceSection'))}
        <Pressable onPress={practice} accessibilityRole="button" accessibilityLabel={t('home.practiceTitle')}
                   style={({ pressed }) => [box, { flexDirection: 'row', alignItems: 'center', gap: space.space3, minHeight: 72,
                                                   paddingVertical: 14, paddingHorizontal: space.space4, opacity: pressed ? 0.7 : 1 }]}>
          <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
            <Card label="AH" size="table" />
            <Card label="2S" size="table" style={{ marginLeft: -18 }} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: c.ink }]}>{t('home.practiceTitle')}</Text>
            <Text style={[type.caption, { color: c.inkSoft }]}>{t('home.practiceHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.inkSoft} />
        </Pressable>
      </View>
    </ScrollView>
  );
}
