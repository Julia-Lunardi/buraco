import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';

import { refreshSession } from '../api/client';
import type { Action, TableView } from '../api/tables';
import { KEYS } from '../auth/session';
import { API_URL } from '../config';
import { type Frame, framesFor } from './pacing';
import { type ChatMessage, openTableSocket, tableSocketUrl, type WebSocketLike } from './tableSocket';

/** Live view of one table: the latest state the server pushed, connection status, the
 * last error meant for this player, and chat messages received while open. Bot moves that
 * arrive together are played back one by one, at a person's pace (realtime/pacing). */
export function useTableSocket(tableId: string, initial?: TableView) {
  const [table, setTable] = useState<TableView | undefined>(initial);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<{ code: string; detail: string } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const socketRef = useRef<ReturnType<typeof openTableSocket> | null>(null);
  const frames = useRef<Frame[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Show queued frames in order, each after its pause; states pushed meanwhile wait their turn.
    const play = () => {
      while (!timer.current && frames.current.length) {
        const frame = frames.current[0];
        if (frame.delay > 0) {
          timer.current = setTimeout(() => {
            timer.current = null;
            frame.delay = 0;
            play();
          }, frame.delay);
          return;
        }
        frames.current.shift();
        setTable(frame.table);
        setError(null);
      }
    };

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
      onState: (next) => { frames.current.push(...framesFor(next)); play(); },
      onChat: (message) => setChat((all) => [...all, message]),
      onError: (code, detail) => setError({ code, detail }),
      onConnection: setConnected,
    });
    socketRef.current = socket;
    return () => {
      socket.close();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      frames.current = [];
    };
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
