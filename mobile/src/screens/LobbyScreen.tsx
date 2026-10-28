import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { type SeatView, startTable } from '../api/tables';
import Button from '../components/Button';
import { CardBack } from '../features/table/Card';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import PushPrimer from '../notifications/PushPrimer';
import { usePushOffer } from '../notifications/usePushOffer';
import { useTableSocket } from '../realtime/useTableSocket';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

const initials = (name: string) => name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Waiting room on the felt (Claude Design "Sala de espera"): the seats around a face-down
 * deck, you at the bottom and your partner across, filling up live; the host starts.
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.table }}>
        <ActivityIndicator color={c.tableInk} />
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

  const share = () => { void Share.share({ message: t('lobby.shareMessage', { code: table.code }) }); };
  const me = table.my_seat ?? 0;
  const n = table.num_players;
  const at = (offset: number) => table.seats[(me + offset) % n];
  const meta = [t(`newTable.${table.preset}`), table.mode === 'live' ? t('newTable.live') : t('newTable.async'),
                t('home.upTo', { n: table.target_score.toLocaleString('pt-BR') })].join(' · ');
  const partner = n === 4 ? at(2) : null;
  const partnerName = partner && !partner.open ? (partner.bot ? t('newTable.bot') : partner.name) : null;

  const seat = (s: SeatView) => {
    const bot = s.bot;
    const name = s.is_you ? t('newTable.you') : s.open ? t('lobby.open') : bot ? t('newTable.bot') : s.name || '—';
    const state = s.is_you ? (table.is_host ? t('lobby.host') : t('lobby.connected'))
      : s.open ? t('lobby.waiting') : bot ? t(`newTable.${table.bot_level}`)
      : s.connected ? t('lobby.connected') : t('lobby.away');
    return (
      <View key={s.seat} accessible accessibilityLabel={`${name}, ${state}`}
            style={{ width: 112, alignItems: 'center', gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                       backgroundColor: s.open || bot ? 'transparent' : c.tableRaised,
                       borderWidth: s.open || bot ? 1.5 : 0, borderStyle: 'dashed', borderColor: c.tableInkSoft,
                       boxShadow: s.is_you ? `0 0 0 2px ${c.accent}` : undefined }}>
          <Text style={[type.bodyStrong, { color: c.tableInk }]}>
            {s.open ? '+' : bot ? 'B' : initials(s.name || (s.is_you ? t('newTable.you') : '?'))}
          </Text>
          <View style={{ position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, boxShadow: `0 0 0 2px ${c.table}`,
                         backgroundColor: s.team === 0 ? c.teamA : c.teamB,
                         ...(s.team === 0 ? { borderRadius: 6 } : { borderRadius: 1, transform: [{ rotate: '45deg' }, { scale: 0.9 }] }) }} />
        </View>
        <Text style={[type.label, { color: c.tableInk, textAlign: 'center' }]} numberOfLines={1}>{name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {!s.is_you && !s.open && !bot && s.connected
            ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.valid }} /> : null}
          <Text style={[type.caption, { color: c.tableInkSoft }]} numberOfLines={1}>{state}</Text>
        </View>
      </View>
    );
  };

  const iconButton = (icon: 'chevron-back' | 'share-outline', label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
               style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={22} color={c.tableInk} />
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.table }}
                contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.space2, paddingBottom: insets.bottom + space.space5,
                                         paddingHorizontal: space.space4, gap: 20, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {iconButton('chevron-back', t('lobby.leave'), () => navigation.goBack())}
        <View style={{ alignItems: 'center', flexShrink: 1 }}>
          <Text selectable style={[type.bodyStrong, { color: c.tableInk }]} accessibilityRole="header"
                accessibilityLabel={`${t('lobby.code')}: ${table.code.split('').join(' ')}`}>
            {t('lobby.tableCode', { code: table.code })}
          </Text>
          <Text style={[type.caption, { color: c.tableInkSoft }]} numberOfLines={1}>{meta}</Text>
        </View>
        {iconButton('share-outline', t('lobby.shareCode'), share)}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: space.space3, minHeight: 360 }}>
        <View style={{ alignItems: 'center' }}>{seat(n === 4 ? at(2) : at(1))}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: n === 4 ? 'space-between' : 'center' }}>
          {n === 4 ? seat(at(1)) : null}
          <View style={{ width: 110, height: 150, borderRadius: 20, backgroundColor: c.tableRaised, alignItems: 'center',
                         justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
            <CardBack width={84} />
          </View>
          {n === 4 ? seat(at(3)) : null}
        </View>
        <View style={{ alignItems: 'center' }}>{seat(at(0))}</View>
      </View>

      {n === 4 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: me % 2 === 0 ? c.teamA : c.teamB }} />
            <Text style={[type.caption, { color: c.tableInkSoft }]}>
              {partnerName ? t('lobby.usWith', { name: partnerName }) : t('table.us')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 1, transform: [{ rotate: '45deg' }],
                           backgroundColor: me % 2 === 0 ? c.teamB : c.teamA }} />
            <Text style={[type.caption, { color: c.tableInkSoft }]}>{t('table.them')}</Text>
          </View>
        </View>
      ) : null}

      {table.seats.some((s) => s.open) ? (
        <View style={{ backgroundColor: c.tableRaised, borderRadius: radius.radiusMd, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Text style={[type.body, { color: c.tableInk }]}>{t('lobby.botWillPlay')}</Text>
        </View>
      ) : null}
      {!connected ? <Text style={[type.caption, { color: c.tableInkSoft, textAlign: 'center' }]}>{t('common.offline')}</Text> : null}
      {error ? <Text style={[type.body, { color: c.tableInk, textAlign: 'center' }]} accessibilityLiveRegion="polite">{error}</Text> : null}

      <View style={{ gap: 10 }}>
        {table.is_host ? <Button label={t('lobby.start')} onPress={start} busy={busy} />
          : <Text style={[type.caption, { color: c.tableInkSoft, textAlign: 'center' }]}>{t('lobby.onlyHost')}</Text>}
        {table.seats.some((s) => s.open) ? <Button label={t('lobby.inviteMore')} variant="secondary" onTable onPress={share} /> : null}
      </View>

      <PushPrimer visible={push.visible} onAllow={() => { void push.allow(); }} onLater={() => { void push.later(); }} />
    </ScrollView>
  );
}
