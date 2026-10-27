import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';

import { refreshSession } from '../api/client';
import type { Action, TableView } from '../api/tables';
import { KEYS } from '../auth/session';
import { API_URL } from '../config';
import { type ChatMessage, openTableSocket, tableSocketUrl, type WebSocketLike } from './tableSocket';

/** Live view of one table: the latest state the server pushed, connection status, the
 * last error meant for this player, and chat messages received while open. */
export function useTableSocket(tableId: string, initial?: TableView) {
  const [table, setTable] = useState<TableView | undefined>(initial);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<{ code: string; detail: string } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const socketRef = useRef<ReturnType<typeof openTableSocket> | null>(null);

  useEffect(() => {
    const socket = openTableSocket({
      url: tableSocketUrl(API_URL, tableId),
      getToken: () => SecureStore.getItemAsync(KEYS.access).catch(() => null),
      refreshToken: refreshSession,
      // React Native's WebSocket matches WebSocketLike at runtime; its DOM-style handler
      // typings (this-bound, Event args) are just stricter than the protocol needs.
      createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }, {
      onState: (next) => { setTable(next); setError(null); },
      onChat: (message) => setChat((all) => [...all, message]),
      onError: (code, detail) => setError({ code, detail }),
      onConnection: setConnected,
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [tableId]);

  return {
    table,
    connected,
    error,
    chat,
    act: (action: Action) => socketRef.current?.send({ type: 'action', action }),
    nextRound: () => socketRef.current?.send({ type: 'next_round' }),
    say: (text: string) => socketRef.current?.send({ type: 'chat', text }),
  };
}
