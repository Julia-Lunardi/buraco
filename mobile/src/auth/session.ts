/**
 * Token storage and silent refresh, following Woddie's AUTH.md:
 * - every sign-in stores an access token (1 h) and a refresh token (90 days);
 * - a 401 from any call triggers ONE refresh, however many calls failed at once;
 * - only a 401 from /auth/refresh signs the user out. Network errors and 5xx never do.
 *
 * Pure (no React), with storage and HTTP injected, so it is unit-tested directly.
 */

export const KEYS = { access: 'token', refresh: 'refresh_token', appleUser: 'apple_user_id' } as const;

export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  user: SessionUser;
}

export interface SessionUser {
  id: string;
  display_name: string;
  email: string | null;
  is_guest: boolean;
}

/** An error the caller can classify: status 401 means "signed out", anything else not. */
export class RefreshError extends Error {
  constructor(public readonly status: number | null) {
    super(status === 401 ? 'Session ended' : 'Could not refresh the session');
  }
}

export type PostRefresh = (refreshToken: string) => Promise<TokenPair>;

export async function storePair(storage: SecureStorage, pair: TokenPair): Promise<void> {
  await storage.setItemAsync(KEYS.access, pair.access_token);
  await storage.setItemAsync(KEYS.refresh, pair.refresh_token);
}

export async function clearSession(storage: SecureStorage): Promise<void> {
  await Promise.all(Object.values(KEYS).map((k) => storage.deleteItemAsync(k)));
}

/**
 * A refresh function that de-duplicates concurrent calls: everyone waiting on an
 * expired token shares one /auth/refresh round trip and its result.
 */
export function createRefresher(storage: SecureStorage, postRefresh: PostRefresh) {
  let inFlight: Promise<TokenPair> | null = null;

  return function refresh(): Promise<TokenPair> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const refreshToken = await storage.getItemAsync(KEYS.refresh);
        if (!refreshToken) throw new RefreshError(401);
        const pair = await postRefresh(refreshToken);
        await storePair(storage, pair);
        return pair;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

/** True only for the one failure that must sign the user out. */
export function isSessionEnded(error: unknown): boolean {
  if (error instanceof RefreshError) return error.status === 401;
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401;
}
