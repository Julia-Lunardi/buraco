import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

import { createRefresher, isSessionEnded, KEYS, type TokenPair } from '../auth/session';
import { API_URL } from '../config';

// eslint-disable-next-line import/no-named-as-default-member -- axios.create is axios's documented API
export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// The refresh call uses bare axios: it must not carry the expired Bearer token, and must
// not loop through the response interceptor below.
export const refreshSession = createRefresher(SecureStore, async (refreshToken) => {
  const { data } = await axios.post<TokenPair>(`${API_URL}/auth/refresh`, { refresh_token: refreshToken },
                                               { timeout: 10000 });
  return data;
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(KEYS.access).catch(() => null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onSessionEnded: () => void = () => {};

/** AuthContext registers what "signed out" means for the UI. */
export function setSessionEndedHandler(handler: () => void): void {
  onSessionEnded = handler;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
  if (error.response?.status !== 401 || !original || original._retry || original.url?.includes('/auth/')) {
    throw error;
  }
  original._retry = true;
  try {
    await refreshSession();
  } catch (refreshError) {
    if (isSessionEnded(refreshError)) onSessionEnded();
    throw refreshError;
  }
  return api(original);
});

/** The backend's own reason ("Invalid Google token.", "Slow down a little."): a generic
 * message made Salvie's store-review sign-in failures impossible to diagnose. */
export function errorDetail(error: unknown, fallback: string): string {
  const detail = (error as AxiosError<{ detail?: string }>)?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}
