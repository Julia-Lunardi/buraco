import { clearSession, createRefresher, isSessionEnded, KEYS, RefreshError, type SecureStorage,
  type TokenPair } from '../src/auth/session';

function memoryStorage(initial: Record<string, string> = {}): SecureStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItemAsync: async (k) => data[k] ?? null,
    setItemAsync: async (k, v) => { data[k] = v; },
    deleteItemAsync: async (k) => { delete data[k]; },
  };
}

const pair = (n: number): TokenPair => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  user: { id: 'u1', display_name: 'Ana', email: null, is_guest: false },
});

test('a refresh stores the new pair', async () => {
  const storage = memoryStorage({ [KEYS.refresh]: 'refresh-0' });
  const refresh = createRefresher(storage, async () => pair(1));
  await refresh();
  expect(storage.data[KEYS.access]).toBe('access-1');
  expect(storage.data[KEYS.refresh]).toBe('refresh-1');
});

test('five 401s at once share ONE refresh call', async () => {
  const storage = memoryStorage({ [KEYS.refresh]: 'refresh-0' });
  const postRefresh = jest.fn(async () => pair(1));
  const refresh = createRefresher(storage, postRefresh);
  const results = await Promise.all([refresh(), refresh(), refresh(), refresh(), refresh()]);
  expect(postRefresh).toHaveBeenCalledTimes(1);
  expect(new Set(results.map((r) => r.access_token))).toEqual(new Set(['access-1']));
});

test('a later refresh makes a new call (the in-flight promise is released)', async () => {
  const storage = memoryStorage({ [KEYS.refresh]: 'refresh-0' });
  let calls = 0;
  const postRefresh = jest.fn(async (): Promise<TokenPair> => pair(++calls));
  const refresh = createRefresher(storage, postRefresh);
  await refresh();
  await refresh();
  expect(postRefresh).toHaveBeenCalledTimes(2);
});

test('no stored refresh token means the session ended', async () => {
  const refresh = createRefresher(memoryStorage(), async () => pair(1));
  await expect(refresh()).rejects.toEqual(new RefreshError(401));
});

test('only a 401 ends the session: network errors and 5xx keep the user signed in', () => {
  expect(isSessionEnded({ response: { status: 401 } })).toBe(true);
  expect(isSessionEnded(new RefreshError(401))).toBe(true);
  expect(isSessionEnded({ response: { status: 503 } })).toBe(false);
  expect(isSessionEnded({ response: { status: 500 } })).toBe(false);
  expect(isSessionEnded(new Error('Network Error'))).toBe(false); // no response at all
  expect(isSessionEnded(new RefreshError(null))).toBe(false);
});

test('signing out clears every stored key, the Apple user id included', async () => {
  const storage = memoryStorage({ [KEYS.access]: 'a', [KEYS.refresh]: 'r', [KEYS.appleUser]: 'apple' });
  await clearSession(storage);
  expect(storage.data).toEqual({});
});
