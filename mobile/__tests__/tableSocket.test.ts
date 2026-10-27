import { openTableSocket, type SocketDeps, tableSocketUrl, type WebSocketLike } from '../src/realtime/tableSocket';

class FakeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  receive(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

function harness(overrides: Partial<SocketDeps> = {}) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const deps: SocketDeps = {
    url: 'wss://api/tables/t1/ws',
    getToken: async () => 'access-1',
    refreshToken: jest.fn(async () => undefined),
    createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (t) => { (t as { cleared: boolean }).cleared = true; },
    ...overrides,
  };
  const handlers = { onState: jest.fn(), onChat: jest.fn(), onError: jest.fn(), onConnection: jest.fn() };
  const socket = openTableSocket(deps, handlers);
  const pending = (ms: number) => timers.filter((t) => t.ms === ms && !t.cleared);
  return { sockets, timers, deps, handlers, socket, pending };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const TABLE = { id: 't1', status: 'playing' } as never;

test('the url uses ws/wss and the table id', () => {
  expect(tableSocketUrl('https://api.example', 't1')).toBe('wss://api.example/tables/t1/ws');
  expect(tableSocketUrl('http://192.168.1.2:8001', 't1')).toBe('ws://192.168.1.2:8001/tables/t1/ws');
});

test('authenticates first, with the token in a message, never the URL', async () => {
  const { sockets, deps } = harness();
  sockets[0].onopen?.();
  await flush();
  expect(sockets[0].sent[0]).toEqual({ type: 'auth', token: 'access-1' });
  expect(deps.url).not.toContain('access-1');
});

test('state messages reach the screen and mark the socket connected', () => {
  const { sockets, handlers } = harness();
  sockets[0].receive({ type: 'state', table: TABLE });
  expect(handlers.onState).toHaveBeenCalledWith(TABLE);
  expect(handlers.onConnection).toHaveBeenLastCalledWith(true);
});

test('chat and errors are passed on', () => {
  const { sockets, handlers } = harness();
  sockets[0].receive({ type: 'chat', message: { id: 1, text: 'Boa!' } });
  sockets[0].receive({ type: 'error', code: 'not_your_turn', detail: 'It is not your turn.' });
  expect(handlers.onChat).toHaveBeenCalledWith({ id: 1, text: 'Boa!' });
  expect(handlers.onError).toHaveBeenCalledWith('not_your_turn', 'It is not your turn.');
});

test('a dropped connection reconnects with backoff', () => {
  const { sockets, pending, handlers } = harness();
  sockets[0].onclose?.({ code: 1006 });
  expect(handlers.onConnection).toHaveBeenLastCalledWith(false);
  expect(pending(1000)).toHaveLength(1);
  pending(1000)[0].fn();
  expect(sockets).toHaveLength(2);
  sockets[1].onclose?.({ code: 1006 });
  expect(pending(2000)).toHaveLength(1); // 1 s, then 2 s, 5 s, 10 s…
});

test('backoff resets after a successful reconnection', () => {
  const { sockets, pending } = harness();
  sockets[0].onclose?.({ code: 1006 });
  pending(1000)[0].fn();
  sockets[1].receive({ type: 'state', table: TABLE });
  sockets[1].onclose?.({ code: 1006 });
  expect(pending(1000)).toHaveLength(2); // the old one (already fired) and a fresh 1 s
});

test('an expired token (4401) refreshes once and reconnects at once', async () => {
  const { sockets, deps } = harness();
  sockets[0].onclose?.({ code: 4401 });
  await flush();
  expect(deps.refreshToken).toHaveBeenCalledTimes(1);
  expect(sockets).toHaveLength(2);
});

test('if the refresh fails, it stops: the app returns to sign-in', async () => {
  const { sockets } = harness({ refreshToken: jest.fn(async () => { throw new Error('401'); }) });
  sockets[0].onclose?.({ code: 4401 });
  await flush();
  expect(sockets).toHaveLength(1);
});

test('not seated (4404) does not retry', () => {
  const { sockets, timers } = harness();
  sockets[0].onclose?.({ code: 4404 });
  expect(sockets).toHaveLength(1);
  expect(timers.filter((t) => t.ms < 25000)).toEqual([]);
});

test('closing from the app stops reconnecting', () => {
  const { sockets, socket, pending } = harness();
  socket.close();
  sockets[0].onclose?.({ code: 1000 });
  expect(sockets[0].closed).toBe(true);
  expect(pending(1000)).toEqual([]);
});

test('keeps the connection alive with a ping every 25 s', () => {
  const { sockets, pending } = harness();
  pending(25000)[0].fn();
  expect(sockets[0].sent).toContainEqual({ type: 'ping' });
});

test('actions, next round and chat are sent as protocol messages', () => {
  const { sockets, socket } = harness();
  socket.send({ type: 'action', action: { type: 'draw' } });
  socket.send({ type: 'next_round' });
  socket.send({ type: 'chat', text: 'Boa!' });
  expect(sockets[0].sent).toEqual([
    { type: 'action', action: { type: 'draw' } }, { type: 'next_round' }, { type: 'chat', text: 'Boa!' }]);
});
