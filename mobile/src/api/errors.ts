import type { AxiosError } from 'axios';

import { i18n } from '../i18n';

/**
 * The player-facing explanation of a server error, in the app's language. The server sends a
 * stable `code` and an English `detail`; codes we know are explained in plain words
 * ("why was that illegal?"), and anything else falls back to the server's own detail, so a
 * new error is never silent (Salvie: generic messages made review failures undiagnosable).
 * `phase` picks between the two meanings of `wrong_phase` (draw first / already drew).
 */
export function describeError(code: string | undefined, detail: string | undefined, fallback: string,
                              phase?: 'draw' | 'play' | 'over'): string {
  if (code) {
    const key = code === 'wrong_phase' ? `errors.wrong_phase_${phase === 'play' ? 'play' : 'draw'}` : `errors.${code}`;
    const explained = i18n.t(key, { defaultValue: '' });
    if (explained) return explained;
  }
  return detail || fallback;
}

/** describeError for an axios error from a REST call. */
export function describeHttpError(error: unknown, fallback: string): string {
  const data = (error as AxiosError<{ code?: string; detail?: string }>)?.response?.data;
  return describeError(data?.code, typeof data?.detail === 'string' ? data.detail : undefined, fallback);
}
