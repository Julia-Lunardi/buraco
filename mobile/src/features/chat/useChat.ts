import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { blockPlayer, chatHistory, reportMessage } from '../../api/chat';
import type { ChatMessage } from '../../realtime/tableSocket';
import { mergeMessages, unreadCount, visibleMessages } from './messages';

/** Chat for one table: history (REST) merged with live socket messages, minus muted
 * players, reported messages and blocked players; plus the unread count for the dot. */
export function useChat(tableId: string, live: ChatMessage[], myUserId: string | undefined) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [lastSeenId, setLastSeenId] = useState(0);
  const muteKey = `chatMuted:${tableId}`;

  useEffect(() => {
    let alive = true;
    chatHistory(tableId).then((h) => {
      if (!alive) return;
      setHistory(h);
      setLastSeenId(h.length ? h[h.length - 1].id : 0); // old messages are not "new"
    }).catch(() => {});
    AsyncStorage.getItem(muteKey).then((raw) => alive && raw && setMuted(new Set(JSON.parse(raw)))).catch(() => {});
    return () => { alive = false; };
  }, [tableId, muteKey]);

  const all = useMemo(() => mergeMessages(history, live), [history, live]);
  const messages = useMemo(
    () => visibleMessages(all, new Set([...muted, ...blocked]), hiddenIds), [all, muted, blocked, hiddenIds]);

  const markSeen = useCallback(() => {
    if (all.length) setLastSeenId(all[all.length - 1].id);
  }, [all]);

  return {
    messages,
    unread: unreadCount(messages, myUserId, lastSeenId),
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
