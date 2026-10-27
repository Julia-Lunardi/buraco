import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Switch, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { type BotLevel, createTable, type PlayMode, type Preset, type SeatKind } from '../api/tables';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import NameField from '../components/NameField';
import SegmentedControl from '../components/SegmentedControl';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewTable'>;

const TARGETS = ['1500', '3000'] as const;

/** Table setup: players, who sits where (friend or bot), live or async, rules, target,
 * chat. Private by default. Guests can only seat bots. */
export default function NewTableScreen({ navigation, route }: Props) {
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= 900;
  const { user } = useAuth();
  const guest = !!user?.is_guest;
  const practice = !!route.params?.practice || guest;

  const [players, setPlayers] = useState<'2' | '4'>('2');
  const [seats, setSeats] = useState<SeatKind[]>(practice ? ['bot', 'bot', 'bot'] : ['friend', 'bot', 'bot']);
  const [mode, setMode] = useState<PlayMode>('live');
  const [target, setTarget] = useState<(typeof TARGETS)[number]>('3000');
  const [chat, setChat] = useState(true);
  const [botLevel, setBotLevel] = useState<BotLevel>('standard');
  const [preset, setPreset] = useState<Preset>('aberto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const count = Number(players) as 2 | 4;
  // Friends need to see who invited them: a friends' table needs a name first.
  const needsName = !guest && !user?.display_name && seats.slice(0, count - 1).includes('friend');
  const otherSeats = seats.slice(0, count - 1);

  // In a 4-player game partners sit opposite: seat 2 is your partner, 1 and 3 opponents.
  const seatLabel = (index: number) => count === 4 && index === 1 ? t('newTable.partner') : t('newTable.opponent');

  async function create() {
    setBusy(true);
    setError('');
    try {
      const table = await createTable({ preset, num_players: count, seats: otherSeats, mode, chat_enabled: chat,
                                        bot_level: botLevel, target_score: Number(target) });
      navigation.replace(table.status === 'lobby' ? 'Lobby' : 'Table', { tableId: table.id });
    } catch (e) {
      setError(errorDetail(e, t('common.somethingWrong')));
      setBusy(false);
    }
  }

  const label = (text: string) => <Text style={[type.label, { color: c.ink }]}>{text}</Text>;
  const hint = (text: string) => <Text style={[type.caption, { color: c.inkSoft }]}>{text}</Text>;
  const section = (...children: React.ReactNode[]) => <View style={{ gap: space.space2 }}>{children}</View>;
  const anyFriend = otherSeats.includes('friend');
  const mark = (team: number) => (
    <View style={{ width: 8, height: 8, backgroundColor: team === 0 ? c.teamAInk : c.teamBInk,
                   ...(team === 0 ? { borderRadius: 4 } : { borderRadius: 1, transform: [{ rotate: '45deg' }] }) }} />
  );
  const seatRow = (avatar: React.ReactNode, title: string, titleColor: string, team: number, teamText: string,
                   key: string | number, control?: React.ReactNode) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.space3, minHeight: 60,
                             paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.surfaceRaised,
                             borderTopWidth: key === 'you' ? 0 : 1, borderTopColor: c.line }}>
      {avatar}
      <View style={{ flex: 1, minWidth: 120 }}>
        <Text style={[type.bodyStrong, { color: titleColor }]}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{mark(team)}{hint(teamText)}</View>
      </View>
      {control}
    </View>
  );
  const avatar = (text: string, dashed: boolean, color = c.ink) => (
    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                   backgroundColor: dashed ? 'transparent' : c.surfaceSunken, borderWidth: dashed ? 1.5 : 0,
                   borderStyle: 'dashed', borderColor: c.inkSoft }}>
      <Text style={[type.label, { color }]}>{text}</Text>
    </View>
  );
  const myInitials = (user?.display_name || t('newTable.you')).split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const settingsCol = (
    <>
      {section(
        <View key="l">{label(t('newTable.rules'))}</View>,
        <SegmentedControl key="c" value={preset} onChange={setPreset} accessibilityLabel={t('newTable.rules')}
          options={[{ value: 'aberto', label: t('newTable.aberto') }, { value: 'fechado', label: t('newTable.fechado') },
                    { value: 'stbl', label: t('newTable.stbl') }]} />,
        <View key="h">{hint({ aberto: t('newTable.abertoHint'), fechado: t('newTable.fechadoHint'), stbl: t('newTable.stblHint') }[preset])}</View>,
      )}

      {section(
        <View key="l">{label(t('newTable.players'))}</View>,
        <SegmentedControl key="c" value={players} onChange={setPlayers} accessibilityLabel={t('newTable.players')}
          options={[{ value: '2', label: t('newTable.two') }, { value: '4', label: t('newTable.four') }]} />,
      )}

      {section(
        <View key="l">{label(t('newTable.mode'))}</View>,
        <SegmentedControl key="c" value={mode} onChange={setMode} accessibilityLabel={t('newTable.mode')}
          options={[{ value: 'live', label: t('newTable.live') }, { value: 'async', label: t('newTable.async') }]} />,
        <View key="h">{hint(mode === 'live' ? t('newTable.liveHint') : t('newTable.asyncHint'))}</View>,
      )}

      {section(
        <View key="l">{label(t('newTable.target'))}</View>,
        <SegmentedControl key="c" value={target} onChange={setTarget} accessibilityLabel={t('newTable.target')}
          options={TARGETS.map((v) => ({ value: v, label: Number(v).toLocaleString('pt-BR') }))} />,
      )}

      <View style={{ gap: space.space2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.space3,
                       minHeight: 56, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.line,
                       borderRadius: radius.radiusMd, paddingHorizontal: space.space4, paddingVertical: space.space2 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: c.ink }]}>{t('newTable.chat')}</Text>
            {hint(t('newTable.chatHint'))}
          </View>
          <Switch value={chat} onValueChange={setChat} accessibilityLabel={t('newTable.chat')}
                  trackColor={{ true: c.accent, false: c.line }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="lock-closed-outline" size={14} color={c.inkSoft} />
          {hint(t('newTable.privateNote'))}
        </View>
      </View>

    </>
  );
  const seatsCol = (
    <>
      {section(
        <View key="l">{label(t('newTable.seats'))}</View>,
        <View key="list" style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.radiusMd, overflow: 'hidden' }}>
          {seatRow(avatar(myInitials, false), t('newTable.you'), c.ink, 0, t('table.us'), 'you')}
          {otherSeats.map((kind, index) => {
            const isFriend = !guest && kind === 'friend';
            const partner = count === 4 && index === 1;
            const team = partner ? 0 : 1;
            return seatRow(
              avatar(isFriend ? '+' : 'B', true, isFriend ? c.accentInk : c.ink),
              isFriend ? (partner ? t('newTable.invitePartner') : t('newTable.inviteFriend')) : t('newTable.bot'),
              isFriend ? c.accentInk : c.ink, team,
              partner ? `${t('table.us')} · ${t('newTable.acrossFromYou')}` : t('table.them'), index,
              guest ? undefined : (
                <View style={{ minWidth: 150 }}>
                  <SegmentedControl value={kind} accessibilityLabel={seatLabel(index)}
                    onChange={(value) => setSeats((all) => all.map((k, i) => (i === index ? value : k)))}
                    options={[{ value: 'friend', label: t('newTable.friend') }, { value: 'bot', label: t('newTable.bot') }]} />
                </View>
              ),
            );
          })}
        </View>,
        <View key="h">{hint(guest ? t('newTable.friendsNeedAccount') : t('newTable.openSeatsBots'))}</View>,
      )}

      {/* Friend seats left open also get a bot at start, so the level always matters. */}
      {section(
        <View key="l">{label(t('newTable.botLevel'))}</View>,
        <SegmentedControl key="c" value={botLevel} onChange={setBotLevel} accessibilityLabel={t('newTable.botLevel')}
          options={[{ value: 'relaxed', label: t('newTable.relaxed') }, { value: 'standard', label: t('newTable.standard') },
                    { value: 'sharp', label: t('newTable.sharp') }]} />,
        botLevel === 'sharp' ? <View key="h">{hint(t('newTable.sharpHint'))}</View> : null,
      )}

      {needsName ? <NameField compact /> : null}
      {error ? <Text style={[type.body, { color: c.invalidInk }]}>{error}</Text> : null}
      <Button label={anyFriend && !guest ? t('newTable.createAndInvite') : t('newTable.create')} onPress={create} busy={busy}
              disabled={needsName} />
    </>
  );
  const column = { gap: 22, flex: 1 };

  // iPad landscape (Claude Design "Nova mesa · iPad paisagem"): the rules on the left, the seats
  // and the create button on the right.
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}
                contentContainerStyle={{ padding: space.space4, paddingBottom: insets.bottom + space.space6,
                                         gap: 22, maxWidth: wide ? 1100 : 600, width: '100%', alignSelf: 'center',
                                         flexDirection: wide ? 'row' : 'column' }}>
      {wide ? <View style={column}>{settingsCol}</View> : settingsCol}
      {wide ? <View style={column}>{seatsCol}</View> : seatsCol}
    </ScrollView>
  );
}
