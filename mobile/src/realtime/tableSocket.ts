import type { Action, TableView } from '../api/tables';

/**
 * The live-table WebSocket protocol (backend routers/tables.py), without React:
 * - the first message authenticates ({type: 'auth', token}); tokens never go in URLs;
 * - the server pushes {type: 'state', table} after every change, each player their own view;
 * - errors for this client come as {type: 'error', code, detail};
 * - a dropped connection reconnects with backoff (1, 2, 5, 10, 10… s) and re-authenticates;
 * - close code 4401 (expired token) triggers ONE token refresh before retrying.
 */

export interface ChatMessage {
  id: number;
  seat: number;
  user_id: string;
  name: string | null;
  text: string;
  at: string | null;
}

export type ServerMessage =
  | { type: 'state'; table: TableView }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; code: string; detail: string }
  | { type: 'pong' };

export interface SocketHandlers {
  onState(table: TableView): void;
  onChat?(message: ChatMessage): void;
  onError?(code: string, detail: string): void;
  onConnection?(connected: boolean): void;
}

export interface SocketDeps {
  url: string;
  getToken(): Promise<string | null>;
  refreshToken(): Promise<unknown>;
  createSocket(url: string): WebSocketLike;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export const BACKOFF_MS = [1000, 2000, 5000, 10000];
const PING_MS = 25000;

export function tableSocketUrl(apiUrl: string, tableId: string): string {
  return `${apiUrl.replace(/^http/, 'ws')}/tables/${tableId}/ws`;
}

export function openTableSocket(deps: SocketDeps, handlers: SocketHandlers) {
  let socket: WebSocketLike | null = null;
  let attempt = 0;
  let refreshedOnce = false;
  let closedByUs = false;
  let reconnectTimer: unknown = null;
  let pingTimer: unknown = null;

  function schedulePing() {
    pingTimer = deps.setTimer(() => {
      socket?.send(JSON.stringify({ type: 'ping' }));
      schedulePing();
    }, PING_MS);
  }

  function connect() {
    let announced = false; // "connected" once per connection, on its first state
    socket = deps.createSocket(deps.url);
    socket.onopen = async () => {
      const token = await deps.getToken();
      socket?.send(JSON.stringify({ type: 'auth', token: token ?? '' }));
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === 'state') {
        if (!announced) {
          announced = true;
          attempt = 0;
          refreshedOnce = false;
          handlers.onConnection?.(true);
        }
        handlers.onState(message.table);
      } else if (message.type === 'chat') {
        handlers.onChat?.(message.message);
      } else if (message.type === 'error') {
        handlers.onError?.(message.code, message.detail);
      }
    };
    socket.onerror = () => {};
    socket.onclose = async (event) => {
      if (pingTimer) deps.clearTimer(pingTimer);
      handlers.onConnection?.(false);
      if (closedByUs) return;
      if (event.code === 4404) return; // not seated at this table: retrying won't help
      if (event.code === 4401 && !refreshedOnce) {
        refreshedOnce = true;
        try {
          await deps.refreshToken();
        } catch {
          return; // the session ended; the app returns to sign-in
        }
        connect();
        return;
      }
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      reconnectTimer = deps.setTimer(connect, delay);
    };
    schedulePing();
  }

  connect();

  return {
    send(message: { type: 'action'; action: Action } | { type: 'next_round' } | { type: 'chat'; text: string }) {
      socket?.send(JSON.stringify(message));
    },
    close() {
      closedByUs = true;
      if (reconnectTimer) deps.clearTimer(reconnectTimer);
      if (pingTimer) deps.clearTimer(pingTimer);
      socket?.close();
    },
  };
}
