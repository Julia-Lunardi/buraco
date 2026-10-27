import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { createTable, type PlayMode, type SeatKind } from '../api/tables';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import SegmentedControl from '../components/SegmentedControl';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewTable'>;

const TARGETS = ['1500', '3000'] as const;

/** Table setup: players, who sits where (friend or bot), live or async, rules, target,
 * chat. Private by default. Guests can only seat bots. */
export default function NewTableScreen({ navigation, route }: Props) {
  const { c, space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const guest = !!user?.is_guest;
  const practice = !!route.params?.practice || guest;

  const [players, setPlayers] = useState<'2' | '4'>('2');
  const [seats, setSeats] = useState<SeatKind[]>(practice ? ['bot', 'bot', 'bot'] : ['friend', 'bot', 'bot']);
  const [mode, setMode] = useState<PlayMode>('live');
  const [target, setTarget] = useState<(typeof TARGETS)[number]>('3000');
  const [chat, setChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const count = Number(players) as 2 | 4;
  const otherSeats = seats.slice(0, count - 1);

  // In a 4-player game partners sit opposite: seat 2 is your partner, 1 and 3 opponents.
  const seatLabel = (index: number) => count === 4 && index === 1 ? t('newTable.partner') : t('newTable.opponent');

  async function create() {
    setBusy(true);
    setError('');
    try {
      const table = await createTable({ num_players: count, seats: otherSeats, mode, chat_enabled: chat,
                                        target_score: Number(target) });
      navigation.replace(table.status === 'lobby' ? 'Lobby' : 'Table', { tableId: table.id });
    } catch (e) {
      setError(errorDetail(e, t('common.somethingWrong')));
      setBusy(false);
    }
  }

  const label = (text: string) => <Text style={[type.bodyStrong, { color: c.ink }]}>{text}</Text>;
  const hint = (text: string) => <Text style={[type.caption, { color: c.inkSoft }]}>{text}</Text>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}
                contentContainerStyle={{ padding: space.space4, paddingBottom: insets.bottom + space.space6,
                                         gap: space.space3, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      {label(t('newTable.rules'))}
      <SegmentedControl value="aberto" onChange={() => {}} accessibilityLabel={t('newTable.rules')}
        options={[{ value: 'aberto', label: t('newTable.aberto') }]} />
      {hint(`${t('newTable.abertoHint')} Fechado, STBL: ${t('newTable.comingSoon')}.`)}

      {label(t('newTable.players'))}
      <SegmentedControl value={players} onChange={setPlayers} accessibilityLabel={t('newTable.players')}
        options={[{ value: '2', label: t('newTable.two') }, { value: '4', label: t('newTable.four') }]} />

      {label(t('newTable.seats'))}
      <Text style={[type.body, { color: c.inkSoft }]}>{t('newTable.you')}</Text>
      {otherSeats.map((kind, index) => (
        <View key={index} style={{ gap: space.space1 }}>
          <Text style={[type.caption, { color: c.inkSoft }]}>{seatLabel(index)}</Text>
          <SegmentedControl
            value={guest ? 'bot' : kind}
            onChange={(value) => setSeats((all) => all.map((k, i) => (i === index ? value : k)))}
            accessibilityLabel={seatLabel(index)}
            options={guest ? [{ value: 'bot', label: t('newTable.bot') }]
              : [{ value: 'friend', label: t('newTable.friend') }, { value: 'bot', label: t('newTable.bot') }]}
          />
        </View>
      ))}
      {guest ? hint(t('newTable.friendsNeedAccount')) : null}

      {label(t('newTable.mode'))}
      <SegmentedControl value={mode} onChange={setMode} accessibilityLabel={t('newTable.mode')}
        options={[{ value: 'live', label: t('newTable.live') }, { value: 'async', label: t('newTable.async') }]} />
      {hint(mode === 'live' ? t('newTable.liveHint') : t('newTable.asyncHint'))}

      {label(t('newTable.target'))}
      <SegmentedControl value={target} onChange={setTarget} accessibilityLabel={t('newTable.target')}
        options={TARGETS.map((v) => ({ value: v, label: Number(v).toLocaleString('pt-BR') }))} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        {label(t('newTable.chat'))}
        <Switch value={chat} onValueChange={setChat} accessibilityLabel={t('newTable.chat')}
                trackColor={{ true: c.accent, false: c.line }} />
      </View>

      {error ? <Text style={[type.body, { color: c.invalidInk }]}>{error}</Text> : null}
      <View style={{ marginTop: space.space3 }}>
        <Button label={t('newTable.create')} onPress={create} busy={busy} />
      </View>
    </ScrollView>
  );
}
