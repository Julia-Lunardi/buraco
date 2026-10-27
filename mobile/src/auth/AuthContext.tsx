import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { api, setSessionEndedHandler } from '../api/client';
import { registerToken, unregisterToken } from '../notifications/push';
import { clearSession, KEYS, type SessionUser, storePair, type TokenPair } from './session';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: SessionUser | null;
  playAsGuest(): Promise<void>;
  signInWithGoogle(idToken: string): Promise<void>;
  signInWithApple(identityToken: string, rawNonce: string, fullName: string | undefined,
                  appleUserId: string): Promise<void>;
  signOut(): Promise<void>;
  updateName(name: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  const endSession = useCallback(async () => {
    await clearSession(SecureStore);
    setUser(null);
    setStatus('signedOut');
  }, []);

  // Restore: a stored access token is enough to start; /users/me confirms it (and refreshes
  // it if it expired). Only a definitive 401 signs out; offline keeps the user signed in.
  useEffect(() => {
    setSessionEndedHandler(() => { void endSession(); });
    (async () => {
      const token = await SecureStore.getItemAsync(KEYS.access).catch(() => null);
      if (!token) {
        setStatus('signedOut');
        return;
      }
      setStatus('signedIn');
      try {
        const { data } = await api.get<SessionUser>('/users/me');
        setUser(data);
        void registerToken(); // no prompt: only if notifications were already allowed
      } catch {
        // Offline or server trouble: stay signed in; a real 401 already ended the session.
      }
    })();
  }, [endSession]);

  // Sign in with Apple can be revoked in iOS Settings: check whenever the app comes back.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      const appleUserId = await SecureStore.getItemAsync(KEYS.appleUser).catch(() => null);
      if (!appleUserId) return;
      try {
        const state = await AppleAuthentication.getCredentialStateAsync(appleUserId);
        if (state === AppleAuthentication.AppleAuthenticationCredentialState.REVOKED ||
            state === AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND) {
          await endSession();
        }
      } catch {
        // Can't check (offline, Expo Go): never a reason to sign out.
      }
    });
    return () => sub.remove();
  }, [endSession]);

  const begin = useCallback(async (pair: TokenPair) => {
    await storePair(SecureStore, pair);
    setUser(pair.user);
    setStatus('signedIn');
    void registerToken();
  }, []);

  const value = useMemo<AuthValue>(() => ({
    status,
    user,
    async playAsGuest() {
      const { data } = await api.post<TokenPair>('/auth/guest');
      await begin(data);
    },
    // A signed-in guest's Bearer token goes along automatically, so the backend turns the
    // guest into this account (keeping its games) instead of creating a new one.
    async signInWithGoogle(idToken) {
      const { data } = await api.post<TokenPair>('/auth/google', { id_token: idToken });
      await begin(data);
    },
    async signInWithApple(identityToken, rawNonce, fullName, appleUserId) {
      const { data } = await api.post<TokenPair>('/auth/apple',
                                                 { identity_token: identityToken, nonce: rawNonce, full_name: fullName });
      await begin(data);
      // Only after the session is stored: a stored Apple id without a session would let the
      // foreground check act on a sign-in that never happened (Salvie).
      await SecureStore.setItemAsync(KEYS.appleUser, appleUserId);
    },
    async signOut() {
      const refreshToken = await SecureStore.getItemAsync(KEYS.refresh).catch(() => null);
      await unregisterToken(); // before the session goes: the call needs it
      if (refreshToken) api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
      await endSession();
    },
    async updateName(name) {
      const { data } = await api.patch<SessionUser>('/users/me', { display_name: name });
      setUser(data);
    },
    async deleteAccount() {
      await api.delete('/users/me');
      await endSession();
    },
  }), [status, user, begin, endSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
