import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getHint, getTable, rematch, type TableView } from '../api/tables';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import SegmentedControl from '../components/SegmentedControl';
import ChatButton from '../features/chat/ChatButton';
import ChatPanel from '../features/chat/ChatPanel';
import { useChat } from '../features/chat/useChat';
import Hand from '../features/table/Hand';
import MeldRow from '../features/table/MeldRow';
import { DiscardPile, MortoStacks, Stock } from '../features/table/Piles';
import FeltTexture from '../features/table/Felt';
import { FlightsProvider, useCardFlights } from '../features/table/flights';
import MortoBanner, { MORTO_BANNER_MS } from '../features/table/MortoBanner';
import { mortoTaken, pileTaken } from '../features/table/planFlights';
import { GameOver, RoundSummary } from '../features/table/Results';
import RoundEnd from '../features/table/RoundEnd';
import { useCardSizes } from '../features/table/sizes';
import TeamWell from '../features/table/TeamWell';
import TurnClock, { LIVE_TURN_SECONDS } from '../features/table/TurnClock';
import { analyse, RULES, sortHand } from '../game/melds';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import PushPrimer from '../notifications/PushPrimer';
import { usePushOffer } from '../notifications/usePushOffer';
import { useTableSocket } from '../realtime/useTableSocket';
import { usePreferences } from '../settings/PreferencesContext';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

/**
 * The table, as designed ("Jogo — mesa mínima"): their team's well on top, the stock and the
 * spread lixo in the middle, your well and your hand below. Everything is tap-to-select, then
 * tap a target: the stock draws, the lixo is taken by tapping it, your area lays the selection down,
 * one of your melds takes it, the lixo takes a single selected card as the discard.
 * Landscape keeps that order (them on top, the piles between, you and your hand at the bottom);
 * each well puts its players beside its melds to save height, and the notices sit by the piles.
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
  const push = usePushOffer();
  const prefs = usePreferences();
  const sortBy = prefs.sort;
  const setSortBy = (value: 'suit' | 'rank') => prefs.set('sort', value);
  const [picked, setPicked] = useState<number[]>([]);

  const game = table?.game ?? null;
  const flights = useCardFlights(game);
  const cardW = useCardSizes().pile.w; // the stock beside the lixo
  const place = (key: string) => (view: View | null) => flights.api.register(key, view);
  // Someone else took the lixo: "+n" on their avatar and a line under the piles, for a moment.
  const [lastGame, setLastGame] = useState(game);
  const [taken, setTaken] = useState<{ seat: number; n: number; key: number } | null>(null);
  // Someone took a morto: a banner drops from the top ("Ana pegou o morto!").
  const [morto, setMorto] = useState<{ team: number; seat: number; key: number } | null>(null);
  // It just became your turn (not on opening the table): the phone taps twice.
  const [buzz, setBuzz] = useState(0);
  if (game !== lastGame) {
    setLastGame(game);
    const took = pileTaken(lastGame, game);
    if (took) setTaken({ ...took, key: (taken?.key ?? 0) + 1 });
    const gotMorto = mortoTaken(lastGame, game);
    if (gotMorto) setMorto({ ...gotMorto, key: (morto?.key ?? 0) + 1 });
    if (lastGame && game && game.current === game.seat && lastGame.current !== game.seat && game.phase === 'draw') {
      setBuzz((n) => n + 1);
    }
  }
  useEffect(() => {
    if (!morto) return;
    const clear = setTimeout(() => setMorto(null), MORTO_BANNER_MS);
    return () => clearTimeout(clear);
  }, [morto]);
  useEffect(() => {
    if (!buzz) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const second = setTimeout(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }, 140);
    return () => clearTimeout(second);
  }, [buzz]);
  useEffect(() => {
    if (!taken) return;
    const clear = setTimeout(() => setTaken(null), 3000);
    return () => clearTimeout(clear);
  }, [taken]);

  // A round ending in front of you plays its moment (RoundEnd) before the points. Only a change
  // seen here counts: opening a table that is already between rounds goes straight to them.
  const [lastStatus, setLastStatus] = useState(table?.status);
  const [ending, setEnding] = useState(false);
  if (table && table.status !== lastStatus) {
    setLastStatus(table.status);
    if (lastStatus === 'playing' && (table.status === 'round_over' || table.status === 'finished')) setEnding(true);
  }
  const endingDone = useCallback(() => setEnding(false), []);
  // The chat keeps up while it is open: what you are reading is not "new".
  const { markSeen } = chat;
  useEffect(() => { if (chatOpen) markSeen(); }, [chatOpen, markSeen]);

  // Derived, not synced: after any new state, only cards still in the hand stay selected.
  const selected = picked.filter((id) => game?.hand.some((card) => card.id === id));

  // Same group, same seats: the server makes one new table and everyone is pointed at it.
  async function playAgain(done: TableView) {
    try {
      const next = done.rematch_id ? await getTable(done.rematch_id) : await rematch(done.id);
      navigation.replace(next.status === 'lobby' ? 'Lobby' : 'Table', { tableId: next.id });
    } catch {
      navigation.popToTop();
    }
  }

  if (!table) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.table }}>
        <FeltTexture />
        <ActivityIndicator color={c.tableInk} />
      </View>
    );
  }

  if (table.status === 'finished' && !ending) {
    return <GameOver table={table} onHome={() => navigation.popToTop()} onAgain={() => { void playAgain(table); }} />;
  }
  if (table.status === 'round_over' && !ending) return <RoundSummary table={table} onNext={nextRound} />;

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

  const team = (n: number) => table.seats.filter((s) => s.team === n);
  const landscape = width > height;
  const gutter = space.space3;
  const handWidth = width - gutter * 2 - insets.left - insets.right;

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
    <ChatButton unread={chat.unread} onPress={() => { chat.markSeen(); setChatOpen(true); }} />
  ) : null;

  const theirWell = game ? (
    <TeamWell seats={team(1 - myTeam)} handSizes={game.hand_sizes} currentSeat={game.current} score={table.scores[1 - myTeam]} roundPoints={table.round_points?.[1 - myTeam]}
              active={game.current % 2 !== myTeam}
              meldsFirst={false} melds={melds(1 - myTeam)} trailing={chatButton} gained={taken} side={landscape} backs />
  ) : null;

  const myWell = game ? (
    <TeamWell seats={team(myTeam)} handSizes={game.hand_sizes} currentSeat={game.current} score={table.scores[myTeam]} roundPoints={table.round_points?.[myTeam]}
              active={game.current % 2 === myTeam}
              meldsFirst melds={melds(myTeam)} areaLabel={t('table.yourArea')} gained={taken} side={landscape}
              onPressArea={playing && selected.length >= 3 ? () => run({ type: 'lay_down', cards: selected }) : undefined}
              trailing={
                <SegmentedControl onTable value={sortBy} onChange={setSortBy} accessibilityLabel={t('table.sortHand')}
                                  options={[{ value: 'suit', label: t('table.sortSuit') }, { value: 'rank', label: t('table.sortRank') }]} />
              } />
  ) : null;

  const teamLabel = (team: number) => team === myTeam ? t('table.us')
    : table.num_players === 2 ? seatName(table, table.seats.find((s) => s.team === team)?.seat ?? -1) : t('table.them');
  // Portrait: the mortos stand one above the other at the left edge, the stock and lixo centred
  // in the room left. Landscape: side by side before the stock (height is what's scarce there).
  const mortoW = Math.round(cardW * 0.62);
  const mortoWidth = landscape ? 2 * (mortoW + 3) + 6 : mortoW + 16;
  const stockAndPile = game ? (
    <>
      {/* Above the lixo, so the lixo never covers the stock's count badge. */}
      <View collapsable={false} ref={place('stock')} style={{ zIndex: 2 }}>
        <Stock count={game.stock_size} active={drawing} onPress={drawing ? () => run({ type: 'draw' }) : undefined} />
      </View>
      <View collapsable={false} ref={place('discard')}>
        <DiscardPile cards={game.discard} width={Math.min(landscape ? 420 : 360, handWidth * (landscape ? 0.6 : 1) - mortoWidth - cardW - 3 - space.space3 * 2 - 8)}
                     takeable={drawing && game.discard.length > 0 && (!fechado || pickupValid)}
                     onTake={() => run(fechado ? { type: 'take_discard', use_with: selected } : { type: 'take_discard' })}
                     target={playing && selected.length === 1}
                     onDiscard={playing && selected.length === 1 ? () => run({ type: 'discard', card: selected[0] }) : undefined} />
      </View>
    </>
  ) : null;
  const piles = game ? (landscape ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.space3 }}>
      <MortoStacks teams={game.teams} myTeam={myTeam} label={teamLabel} />
      {stockAndPile}
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.space3 }}>
      <MortoStacks vertical teams={game.teams} myTeam={myTeam} label={teamLabel} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.space3 }}>
        {stockAndPile}
      </View>
    </View>
  )) : null;

  // One quiet line under the piles: errors first, then the hint, then guidance.
  const notice = !connected ? { text: t('table.reconnecting'), color: c.tableInkSoft }
    : error && game ? { text: describeError(error.code, error.detail, t('common.somethingWrong'), game.phase), color: c.invalidInk }
    : taken ? { text: t('table.tookPile', { name: seatName(table, taken.seat), n: taken.n }), color: c.accent }
    : hintText ? { text: hintText, color: c.tableInk }
    : playing && newMeldValid ? { text: t('table.canMeld'), color: c.valid }
    : drawing && fechado && game.discard.length ? { text: t('table.pileHint'), color: c.tableInkSoft }
    : null;
  // Live tables: a person's turn runs on a 40 s clock (server: live_turn_seconds); bots' turns don't.
  const turnSeat = game ? table.seats.find((s) => s.seat === game.current) : undefined;
  const clock = table.mode === 'live' && table.turn_deadline && turnSeat && !turnSeat.bot && !turnSeat.covered_by_bot ? (
    <TurnClock deadline={table.turn_deadline} limit={LIVE_TURN_SECONDS} mine={myTurn} />
  ) : null;
  const noticeRow = (
    <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.space3 }}>
      {clock}
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
    <View collapsable={false} ref={place('hand')}>
      <Hand cards={sortHand(game.hand, sortBy)} selected={selected} width={handWidth}
            selectionValid={newMeldValid || pickupValid} onToggle={toggle} />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.table, paddingTop: insets.top + (landscape ? 4 : space.space2),
                   paddingBottom: insets.bottom + (landscape ? 4 : space.space3), paddingLeft: insets.left, paddingRight: insets.right }}>
      <FeltTexture />
      <FlightsProvider api={flights.api}>
      {landscape ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: gutter, gap: 6 }}
                    onScrollEndDrag={flights.remember} onMomentumScrollEnd={flights.remember}>
          {theirWell}
          <View style={{ flexGrow: 1, minHeight: 2 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.space4 }}>
            {piles}
            <View style={{ flexShrink: 1, maxWidth: width * 0.3 }}>{noticeRow}</View>
          </View>
          <View style={{ flexGrow: 1, minHeight: 2 }} />
          {myWell}
          {hand}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: gutter, gap: 10 }}
                    onScrollEndDrag={flights.remember} onMomentumScrollEnd={flights.remember}>
          {theirWell}
          <View style={{ flexGrow: 1, minHeight: space.space3 }} />
          {piles}
          {noticeRow}
          <View style={{ flexGrow: 1, minHeight: space.space2 }} />
          {myWell}
          {hand}
        </ScrollView>
      )}
      </FlightsProvider>
      {flights.layer}
      {chatAvailable ? (
        <ChatPanel visible={chatOpen} onClose={() => { chat.markSeen(); setChatOpen(false); }} table={table} chat={chat}
                   myUserId={user?.id} send={say} />
      ) : null}
      {morto && !ending ? (
        <MortoBanner key={morto.key} ours={morto.team === myTeam}
                     text={morto.seat === me ? t('table.mortoBannerYou') : t('table.mortoBanner', { name: seatName(table, morto.seat) })} />
      ) : null}
      {ending ? <RoundEnd table={table} onDone={endingDone} /> : null}
      <PushPrimer visible={push.visible} onAllow={() => { void push.allow(); }} onLater={() => { void push.later(); }} />
    </View>
  );
}

const isPractice = (table: TableView) => table.seats.filter((s) => !s.bot && !s.open).length === 1;

const seatName = (table: TableView, seat: number) => {
  const s = table.seats.find((x) => x.seat === seat);
  return s?.name || (s?.bot || s?.covered_by_bot ? t('newTable.bot') : '—');
};
