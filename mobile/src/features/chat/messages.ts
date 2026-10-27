import type { ChatMessage } from '../../realtime/tableSocket';

/** History (REST) and live messages (socket) can overlap: merge by id, oldest first. */
export function mergeMessages(...lists: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const list of lists) for (const m of list) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Muting is per player and per table, kept on this phone only (blocking is the
 * account-wide, server-side tool). */
export function visibleMessages(messages: ChatMessage[], muted: ReadonlySet<string>, hidden: ReadonlySet<number>) {
  return messages.filter((m) => !muted.has(m.user_id) && !hidden.has(m.id));
}

/** Messages from others that arrived after the panel was last opened. */
export function unreadCount(messages: ChatMessage[], myUserId: string | undefined, lastSeenId: number): number {
  return messages.filter((m) => m.id > lastSeenId && m.user_id !== myUserId).length;
}
