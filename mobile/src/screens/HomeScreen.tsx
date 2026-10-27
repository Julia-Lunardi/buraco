import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { myTables, type TableSummary } from '../api/tables';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/** Home: new table, join with a code, practice against bots, and your unfinished tables
 * (yours-to-play first, ordered by the server). */
export default function HomeScreen({ navigation }: Props) {
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTables(await myTables());
      setError('');
    } catch (e) {
      setError(errorDetail(e, t('common.offline')));
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function statusLine(table: TableSummary): string {
    if (table.status === 'lobby') return t('home.lobby');
    if (table.status === 'round_over') return t('home.roundOver');
    return table.your_turn ? t('home.yourTurn') : '';
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                     paddingHorizontal: space.space4, paddingVertical: space.space3 }}>
        <Text style={[type.title, { color: c.ink }]} accessibilityRole="header">{t('appName')}</Text>
        <Pressable onPress={() => navigation.navigate('Settings')} accessibilityRole="button"
                   hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[type.label, { color: c.accentInk }]}>{t('settings.title')}</Text>
        </Pressable>
      </View>

      {user?.is_guest ? (
        <Text style={[type.caption, { color: c.inkSoft, paddingHorizontal: space.space4 }]}>
          {t('home.signInForFriends')}
        </Text>
      ) : null}

      {tables === null && !error ? (
        <ActivityIndicator style={{ marginTop: space.space6 }} color={c.inkSoft} />
      ) : (
        <FlatList
          data={tables ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.space4, gap: space.space3, maxWidth: 720, width: '100%',
                                   alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }} />}
          ListHeaderComponent={
            <>
              <View style={{ gap: space.space2, marginBottom: space.space4 }}>
                {!user?.is_guest ? (
                  <>
                    <Button label={t('home.newTable')} onPress={() => navigation.navigate('NewTable')} />
                    <Button label={t('home.joinWithCode')} variant="secondary" onPress={() => navigation.navigate('Join')} />
                  </>
                ) : null}
                <Button label={t('home.practice')} variant={user?.is_guest ? 'primary' : 'quiet'}
                        onPress={() => navigation.navigate('NewTable', { practice: true })} />
              </View>
              {error ? <Text style={[type.body, { color: c.inkSoft }]}>{error}</Text> : null}
              {tables?.length ? (
                <Text style={[type.heading, { color: c.ink, marginBottom: space.space2 }]}>{t('home.yourTables')}</Text>
              ) : null}
            </>
          }
          ListEmptyComponent={!error ? (
            <Text style={[type.body, { color: c.inkSoft, textAlign: 'center', marginTop: space.space6 }]}>
              {t('home.empty')}
            </Text>
          ) : null}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate(item.status === 'lobby' ? 'Lobby' : 'Table', { tableId: item.id })}
              accessibilityRole="button"
              style={({ pressed }) => ({ backgroundColor: c.surfaceRaised, borderRadius: radius.radiusMd,
                                         padding: space.space4, gap: space.space1, opacity: pressed ? 0.7 : 1 })}>
              <Text style={[type.bodyStrong, { color: c.ink }]}>
                {item.players.map((p) => p ?? t('home.bot')).join(' · ')}
              </Text>
              <Text style={[type.caption, { color: item.your_turn ? c.accentInk : c.inkSoft }]}>
                {statusLine(item)}{statusLine(item) ? ' · ' : ''}{item.code}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
