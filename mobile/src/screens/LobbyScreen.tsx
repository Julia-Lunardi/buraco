import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { startTable } from '../api/tables';
import Button from '../components/Button';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import PushPrimer from '../notifications/PushPrimer';
import { usePushOffer } from '../notifications/usePushOffer';
import { useTableSocket } from '../realtime/useTableSocket';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

/** Waiting room: the code to share, seats filling up live, and the host's start button.
 * Everyone moves to the table the moment the game starts (the server pushes the state). */
export default function LobbyScreen({ navigation, route }: Props) {
  const { tableId } = route.params;
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { table, connected } = useTableSocket(tableId);
  const push = usePushOffer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (table && table.status !== 'lobby') navigation.replace('Table', { tableId });
  }, [table, navigation, tableId]);

  if (!table) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
        <ActivityIndicator color={c.inkSoft} />
      </View>
    );
  }

  async function start() {
    setBusy(true);
    setError('');
    try {
      await startTable(tableId); // the socket brings the new state and moves us on
    } catch (e) {
      setError(errorDetail(e, t('common.somethingWrong')));
      setBusy(false);
    }
  }

  const teamColor = (team: number) => (team === 0 ? c.teamAInk : c.teamBInk);
  const teamMark = (team: number) => (team === 0 ? '●' : '◆'); // never colour alone

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}
                contentContainerStyle={{ padding: space.space4, paddingBottom: insets.bottom + space.space6,
                                         gap: space.space4, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignItems: 'center', gap: space.space2, backgroundColor: c.surfaceRaised,
                     borderRadius: radius.radiusMd, padding: space.space5 }}>
        <Text style={[type.caption, { color: c.inkSoft }]}>{t('lobby.code')}</Text>
        <Text selectable style={[type.title, { color: c.ink, letterSpacing: 6, fontVariant: ['tabular-nums'] }]}
              accessibilityLabel={`${t('lobby.code')}: ${table.code.split('').join(' ')}`}>
          {table.code}
        </Text>
        <Button label={t('lobby.share')} variant="secondary"
                onPress={() => { void Share.share({ message: t('lobby.shareMessage', { code: table.code }) }); }} />
      </View>

      <View style={{ gap: space.space2 }}>
        {table.seats.map((seat) => (
          <View key={seat.seat} style={{ flexDirection: 'row', alignItems: 'center', gap: space.space3, minHeight: 44 }}>
            <Text style={[type.bodyStrong, { color: teamColor(seat.team) }]}>{teamMark(seat.team)}</Text>
            <Text style={[type.body, { color: seat.open ? c.inkSoft : c.ink, flex: 1 }]}>
              {seat.open ? t('lobby.open') : seat.bot ? t('newTable.bot') : seat.name || '—'}
              {seat.is_you ? ` (${t('newTable.you')})` : ''}
            </Text>
            {!seat.open && !seat.bot ? (
              <Text style={[type.caption, { color: c.inkSoft }]}>
                {seat.connected ? t('lobby.connected') : t('lobby.away')}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {table.seats.some((s) => s.open) ? (
        <Text style={[type.caption, { color: c.inkSoft }]}>{t('lobby.waiting')} {t('lobby.botWillPlay')}</Text>
      ) : null}
      {!connected ? <Text style={[type.caption, { color: c.inkSoft }]}>{t('common.offline')}</Text> : null}
      {error ? <Text style={[type.body, { color: c.invalidInk }]}>{error}</Text> : null}

      {table.is_host ? <Button label={t('lobby.start')} onPress={start} busy={busy} />
        : <Text style={[type.caption, { color: c.inkSoft, textAlign: 'center' }]}>{t('lobby.onlyHost')}</Text>}

      <PushPrimer visible={push.visible} onAllow={() => { void push.allow(); }} onLater={() => { void push.later(); }} />
    </ScrollView>
  );
}
