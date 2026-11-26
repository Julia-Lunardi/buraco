import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { blockPlayer, chatHistory, reactToMessage, reportMessage } from '../../api/chat';
import type { ChatMessage } from '../../realtime/tableSocket';
import { mergeMessages, reactionChips, unreadCount, visibleMessages } from './messages';

/** Chat for one table: history (REST) merged with live socket messages, minus muted
 * players, reported messages and blocked players; plus the unread count for the dot. */
export function useChat(tableId: string, live: ChatMessage[], myUserId: string | undefined) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  // null until known: no badge before then, rather than one counting every old message.
  const [lastSeenId, setLastSeenId] = useState<number | null>(null);
  const muteKey = `chatMuted:${tableId}`;
  const seenKey = `chatSeen:${tableId}`;

  useEffect(() => {
    let alive = true;
    // What you last read is kept on the phone, per table: opening the table from a "new
    // message" push (or from the lobby) still shows those messages as unread. Only a table
    // never opened on this phone starts with everything read: old messages are not "new".
    Promise.all([chatHistory(tableId).catch(() => [] as ChatMessage[]),
                 AsyncStorage.getItem(seenKey).catch(() => null)]).then(([h, raw]) => {
      if (!alive) return;
      if (h.length) setHistory(h);
      const stored = raw === null ? NaN : Number(raw);
      setLastSeenId((seen) => seen ?? (Number.isFinite(stored) ? stored : h.length ? h[h.length - 1].id : 0));
    }).catch(() => {});
    AsyncStorage.getItem(muteKey).then((raw) => alive && raw && setMuted(new Set(JSON.parse(raw)))).catch(() => {});
    // Back from the background: the socket was closed meanwhile, so fetch what was said. These
    // stay unread (lastSeenId is kept): they are exactly the messages the push told them about.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') chatHistory(tableId).then((h) => alive && setHistory(h)).catch(() => {});
    });
    return () => { alive = false; sub.remove(); };
  }, [tableId, muteKey, seenKey]);

  const all = useMemo(() => mergeMessages(history, live), [history, live]);
  const ignored = useMemo(() => new Set([...muted, ...blocked]), [muted, blocked]);
  const messages = useMemo(() => visibleMessages(all, ignored, hiddenIds), [all, ignored, hiddenIds]);

  // A message from someone else arrives live: the phone taps once. Only socket messages count
  // (history loads are not arrivals), and not muted, blocked or reported ones.
  // A reaction re-sends an older message, so `live` is not in id order and never buzzes for it.
  const lastLive = useRef(Math.max(0, ...live.map((m) => m.id)));
  useEffect(() => {
    const fresh = live.filter((m) => m.id > lastLive.current);
    if (!fresh.length) return;
    lastLive.current = Math.max(...fresh.map((m) => m.id));
    const shown = new Set(messages.map((m) => m.id));
    if (fresh.some((m) => m.user_id !== myUserId && shown.has(m.id))) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [live, messages, myUserId]);

  const markSeen = useCallback(() => {
    if (!all.length) return;
    const newest = all[all.length - 1].id;
    setLastSeenId(newest);
    AsyncStorage.setItem(seenKey, String(newest)).catch(() => {});
  }, [all, seenKey]);

  return {
    messages,
    unread: lastSeenId === null ? 0 : unreadCount(messages, myUserId, lastSeenId),
    markSeen,
    isMuted: (userId: string) => muted.has(userId),
    toggleMute(userId: string) {
      setMuted((current) => {
        const next = new Set(current);
        if (next.has(userId)) next.delete(userId); else next.add(userId);
        AsyncStorage.setItem(muteKey, JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    reactions: (message: ChatMessage) => reactionChips(message, myUserId, ignored),
    /** The update comes back on the socket, to everyone at the table. */
    async react(message: ChatMessage, emoji: string) {
      const mine = message.reactions?.find((r) => r.user_id === myUserId)?.emoji;
      await reactToMessage(tableId, message.id, mine === emoji ? null : emoji);
    },
    async report(message: ChatMessage) {
      await reportMessage(tableId, message.id);
      setHiddenIds((ids) => new Set(ids).add(message.id));
    },
    async block(userId: string) {
      await blockPlayer(userId);
      setBlocked((ids) => new Set(ids).add(userId));
    },
  };
}
