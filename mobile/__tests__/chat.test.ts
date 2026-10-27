import { mergeMessages, unreadCount, visibleMessages } from '../src/features/chat/messages';
import type { ChatMessage } from '../src/realtime/tableSocket';

const msg = (id: number, user = 'bia', text = `m${id}`): ChatMessage =>
  ({ id, seat: user === 'ana' ? 0 : 1, user_id: user, name: user, text, at: null });

test('history and live messages merge without duplicates, oldest first', () => {
  const merged = mergeMessages([msg(1), msg(2), msg(3)], [msg(3), msg(4), msg(2)]);
  expect(merged.map((m) => m.id)).toEqual([1, 2, 3, 4]);
});

test('live messages arriving out of order are sorted', () => {
  expect(mergeMessages([msg(5), msg(4)]).map((m) => m.id)).toEqual([4, 5]);
});

test('muted players and reported messages are hidden', () => {
  const all = [msg(1, 'bia'), msg(2, 'caio'), msg(3, 'bia'), msg(4, 'dani')];
  const visible = visibleMessages(all, new Set(['bia']), new Set([4]));
  expect(visible.map((m) => m.id)).toEqual([2]);
});

test('unread counts only other people\'s messages after the last one seen', () => {
  const all = [msg(1, 'bia'), msg(2, 'ana'), msg(3, 'bia'), msg(4, 'caio')];
  expect(unreadCount(all, 'ana', 1)).toBe(2); // 3 and 4; 2 is mine
  expect(unreadCount(all, 'ana', 4)).toBe(0);
});

test('a muted player\'s messages never light the unread dot', () => {
  const all = [msg(1, 'bia'), msg(2, 'caio')];
  const visible = visibleMessages(all, new Set(['bia']), new Set());
  expect(unreadCount(visible, 'ana', 0)).toBe(1);
});
