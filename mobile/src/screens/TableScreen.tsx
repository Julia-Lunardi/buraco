import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTable, getHint, type Preset, type SeatKind, type TableView } from '../api/tables';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import SegmentedControl from '../components/SegmentedControl';
import ChatPanel from '../features/chat/ChatPanel';
import { useChat } from '../features/chat/useChat';
import Hand from '../features/table/Hand';
import MeldRow from '../features/table/MeldRow';
import { DiscardPile, Stock } from '../features/table/Piles';
import { GameOver, RoundSummary } from '../features/table/Results';
import TeamWell from '../features/table/TeamWell';
import { analyse, RULES, sortHand } from '../game/melds';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import PushPrimer from '../notifications/PushPrimer';
import { usePushOffer } from '../notifications/usePushOffer';
import { useTableSocket } from '../realtime/useTableSocket';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

/**
 * The table, as designed ("Jogo — mesa mínima"): their team's well on top, the stock and the
 * spread lixo in the middle, your well and your hand below. Everything is tap-to-select, then
 * tap a target: the stock draws, "Pegar" takes the lixo, your area lays the selection down,
 * one of your melds takes it, the lixo takes a single selected card as the discard.
 * Landscape (and tablets) put the wells in a left column and the piles and hand on the right.
 */
export default function TableScreen({ navigation, route }: Props) {
  const { tableId } = route.params;
  const { c, space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { table, connected, error, act, nextRound, chat: liveChat, say } = useTableSocket(tableId);
  const { user } = useAuth();
  const chat = useChat(tableId, liveChat, user?.id);
  const [chatOpen, setChatOpen] = useState(false);
  const [hintText, setHintText] = useState('');
  const [sortBy, setSortBy] = useState<'suit' | 'rank'>('suit');
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

  if (table.status === 'finished') {
    return <GameOver table={table} onHome={() => navigation.popToTop()}
                     onAgain={isPractice(table) ? () => { void playAgain(table); } : undefined} />;
  }
  if (table.status === 'round_over') return <RoundSummary table={table} onNext={nextRound} />;

  // Chat only where there is someone to talk to (bot tables have none; guests can't chat).
  const people = table.seats.filter((s) => !s.bot && !s.open).length;
  const chatAvailable = people >= 2 && !user?.is_guest;
  const practice = isPractice(table); // only bots besides you: hints allowed
  const me = table.my_seat ?? 0;
  const myTeam = me % 2;
  const myTurn = game !== null && game.current === me && table.status === 'playing';
  const drawing = myTurn && game.phase === 'draw';
  const playing = myTurn && game.phase === 'play';
  // Fechado: the pile can only be taken by using its top card in a meld right away.
  const fechado = table.preset === 'fechado';
  const rules = RULES[table.preset] ?? RULES.aberto;

  const labelOf = (id: number) => game?.hand.find((card) => card.id === id)?.label ?? '';
  const selectedLabels = selected.map(labelOf);
  const newMeldValid = selected.length >= 3 && analyse(selectedLabels, rules) !== null;
  const top = game?.discard[game.discard.length - 1];
  // Fechado pickup into a new meld: the top card plus the selection must make one.
  const pickupValid = fechado && !!top && selected.length >= 2 && analyse([top.label, ...selectedLabels], rules) !== null;

  const toggle = (id: number) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const run = (action: Parameters<typeof act>[0]) => { act(action); setPicked([]); setHintText(''); };

  async function showHint() {
    try {
      const hint = await getHint(tableId);
      setHintText(t(`table.hint_${hint.type}`));
      // Pre-select the cards the hint uses; the player still makes the move.
      if (hint.type === 'lay_down' || hint.type === 'add_to_meld') setPicked(hint.cards);
      else if (hint.type === 'take_discard' && hint.use_with) setPicked(hint.use_with);
      else if (hint.type === 'discard') setPicked([hint.card]);
    } catch {
      setHintText('');
    }
  }

  async function playAgain(done: TableView) {
    const seats: SeatKind[] = done.seats.filter((s) => !s.is_you).map(() => 'bot');
    try {
      const next = await createTable({ preset: done.preset as Preset, num_players: done.num_players, seats, mode: done.mode,
                                       chat_enabled: false, bot_level: done.bot_level, target_score: done.target_score });
      navigation.replace(next.status === 'lobby' ? 'Lobby' : 'Table', { tableId: next.id });
    } catch {
      navigation.popToTop();
    }
  }

  const team = (n: number) => table.seats.filter((s) => s.team === n);
  const landscape = width > height;
  const gutter = space.space3;
  const rightWidth = landscape ? Math.min(width * 0.55, 620) : width;
  const handWidth = rightWidth - gutter * 2 - (landscape ? insets.right : 0);

  const melds = (n: number) => game?.teams[n].melds.map((meld) => {
    const mine = n === myTeam;
    const takeInto = mine && drawing && fechado && !!top;
    const addTo = mine && playing && selected.length > 0;
    const fits = takeInto ? analyse([...meld.cards.map((x) => x.label), top.label, ...selectedLabels], rules, meld.kind) !== null
      : addTo && analyse([...meld.cards.map((x) => x.label), ...selectedLabels], rules, meld.kind) !== null;
    return (
      <MeldRow key={meld.id} meld={meld} target={fits}
               onPress={takeInto ? () => run({ type: 'take_discard', meld: meld.id, ...(selected.length ? { use_with: selected } : {}) })
                 : addTo ? () => run({ type: 'add_to_meld', meld: meld.id, cards: selected }) : undefined} />
    );
  });

  const chatButton = chatAvailable ? (
    <Pressable onPress={() => { chat.markSeen(); setChatOpen(true); }} accessibilityRole="button"
               accessibilityLabel={chat.unread ? `${t('chat.open')}, ${t('chat.unread', { n: chat.unread })}` : t('chat.open')}
               style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.table, alignItems: 'center', justifyContent: 'center' }}>
      <ChatGlyph color={c.tableInk} />
      {chat.unread ? <View style={{ position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: 5,
                                    backgroundColor: c.accent }} /> : null}
    </Pressable>
  ) : null;

  const theirWell = game ? (
    <TeamWell seats={team(1 - myTeam)} handSizes={game.hand_sizes} currentSeat={game.current} score={table.scores[1 - myTeam]}
              mortoWaiting={game.teams[1 - myTeam].morto_waiting} active={game.current % 2 !== myTeam}
              meldsFirst={false} melds={melds(1 - myTeam)} trailing={chatButton} />
  ) : null;

  const myWell = game ? (
    <TeamWell seats={team(myTeam)} handSizes={game.hand_sizes} currentSeat={game.current} score={table.scores[myTeam]}
              mortoWaiting={game.teams[myTeam].morto_waiting} active={game.current % 2 === myTeam}
              meldsFirst melds={melds(myTeam)} areaLabel={t('table.yourArea')}
              onPressArea={playing && selected.length >= 3 ? () => run({ type: 'lay_down', cards: selected }) : undefined}
              trailing={
                <SegmentedControl onTable value={sortBy} onChange={setSortBy} accessibilityLabel={t('table.sortHand')}
                                  options={[{ value: 'suit', label: t('table.sortSuit') }, { value: 'rank', label: t('table.sortRank') }]} />
              } />
  ) : null;

  const piles = game ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.space4 }}>
      <Stock count={game.stock_size} active={drawing} onPress={drawing ? () => run({ type: 'draw' }) : undefined} />
      <DiscardPile cards={game.discard} width={Math.min(270, handWidth - 100)}
                   takeable={drawing && game.discard.length > 0 && (!fechado || pickupValid)}
                   onTake={() => run(fechado ? { type: 'take_discard', use_with: selected } : { type: 'take_discard' })}
                   target={playing && selected.length === 1}
                   onDiscard={playing && selected.length === 1 ? () => run({ type: 'discard', card: selected[0] }) : undefined} />
    </View>
  ) : null;

  // One quiet line under the piles: errors first, then the hint, then guidance.
  const notice = !connected ? { text: t('table.reconnecting'), color: c.tableInkSoft }
    : error && game ? { text: describeError(error.code, error.detail, t('common.somethingWrong'), game.phase), color: c.invalidInk }
    : hintText ? { text: hintText, color: c.tableInk }
    : playing && newMeldValid ? { text: t('table.canMeld'), color: c.valid }
    : drawing && fechado && game.discard.length ? { text: t('table.pileHint'), color: c.tableInkSoft }
    : null;
  const noticeRow = (
    <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.space3 }}>
      {notice ? <Text style={[type.caption, { color: notice.color, textAlign: 'center', flexShrink: 1 }]}
                      accessibilityLiveRegion="polite">{notice.text}</Text> : null}
      {practice && myTurn && !hintText ? (
        <Pressable onPress={() => { void showHint(); }} accessibilityRole="button" hitSlop={10}>
          <Text style={[type.label, { color: c.accent }]}>{t('table.hint')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const hand = game ? (
    <Hand cards={sortHand(game.hand, sortBy)} selected={selected} width={handWidth}
          selectionValid={newMeldValid || pickupValid} onToggle={toggle} />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.table, paddingTop: insets.top + space.space2,
                   paddingBottom: insets.bottom + space.space3, paddingLeft: insets.left, paddingRight: insets.right }}>
      {landscape ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: gutter, gap: 10 }}>
            {theirWell}
            {myWell}
          </ScrollView>
          <View style={{ width: rightWidth - (insets.right || 0), paddingHorizontal: gutter, gap: 10, justifyContent: 'flex-end' }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>{piles}</View>
            {noticeRow}
            {hand}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: gutter, gap: 10 }}>
          {theirWell}
          <View style={{ flexGrow: 1, minHeight: space.space3 }} />
          {piles}
          {noticeRow}
          <View style={{ flexGrow: 1, minHeight: space.space2 }} />
          {myWell}
          {hand}
        </ScrollView>
      )}
      {chatAvailable ? (
        <ChatPanel visible={chatOpen} onClose={() => { chat.markSeen(); setChatOpen(false); }} table={table} chat={chat}
                   myUserId={user?.id} send={say} />
      ) : null}
      <PushPrimer visible={push.visible} onAllow={() => { void push.allow(); }} onLater={() => { void push.later(); }} />
    </View>
  );
}

const isPractice = (table: TableView) => table.seats.filter((s) => !s.bot && !s.open).length === 1;

/** A speech bubble, drawn with views (no icon font on the felt). */
function ChatGlyph({ color }: { color: string }) {
  return (
    <View>
      <View style={{ width: 18, height: 14, borderRadius: 5, borderWidth: 1.8, borderColor: color }} />
      <View style={{ position: 'absolute', left: 3, bottom: -3, width: 6, height: 6, borderLeftWidth: 1.8, borderBottomWidth: 1.8,
                     borderColor: color, transform: [{ rotate: '-20deg' }] }} />
    </View>
  );
}
