import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

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

    const open = () => openTableSocket({
      url: tableSocketUrl(API_URL, tableId),
      getToken: () => SecureStore.getItemAsync(KEYS.access).catch(() => null),
      refreshToken: refreshSession,
      // React Native's WebSocket matches WebSocketLike at runtime; its DOM-style handler
      // typings (this-bound, Event args) are just stricter than the protocol needs.
      createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }, {
      onState: (next) => {
        // The clock counts from arrival (no clock skew), and already includes the replay below.
        const left = next.turn_seconds_left;
        const timed = { ...next, turn_deadline: left == null ? null : Date.now() + left * 1000 };
        frames.current.push(...framesFor(timed));
        play();
      },
      onChat: (message) => setChat((all) => [...all, message]),
      onError: (code, detail) => setError({ code, detail }),
      onConnection: setConnected,
    });
    socketRef.current = open();
    // In the background the socket closes, so the server knows this player isn't looking and
    // sends their pushes. Android keeps a backgrounded app's socket alive otherwise, and iOS
    // freezes it half-open: either way the server thought they were still at the table.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'background' && socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      } else if (next === 'active' && !socketRef.current) {
        socketRef.current = open(); // the first state brings the table up to date
      }
    });
    return () => {
      appState.remove();
      socketRef.current?.close();
      socketRef.current = null;
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
