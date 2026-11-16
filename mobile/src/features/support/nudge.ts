import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The support nudge: every so many finished games, one calm sheet on the game-over screen
 * ("You've played 10 games. If you like, a contribution helps keep the servers running"),
 * with a button to the Support screen and "Not now". Julia asked for it on 16.11.2026; it
 * replaces the earlier "never after a game" rule in docs/plans/tip-jar.md.
 *
 * Everything is counted on this device only: no backend, no analytics. The rules:
 * - a game counts once it is over and you had a seat; a finished table opened again is not a
 *   new game (the last few ids are remembered);
 * - the sheet is due every NUDGE_EVERY_GAMES games since it was last shown, never within
 *   NUDGE_MIN_DAYS_APART of the last one, and not for NUDGE_REST_AFTER_CONTRIBUTION_DAYS after a
 *   contribution (a thank-you or a pending one);
 * - choosing either button counts as shown.
 */

const envEvery = Number(process.env.EXPO_PUBLIC_SUPPORT_NUDGE_EVERY);
/** Games between nudges. EXPO_PUBLIC_SUPPORT_NUDGE_EVERY=1 makes testing quick. */
export const NUDGE_EVERY_GAMES = Number.isInteger(envEvery) && envEvery > 0 ? envEvery : 10;
export const NUDGE_MIN_DAYS_APART = 3;
export const NUDGE_REST_AFTER_CONTRIBUTION_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;
const REMEMBERED_TABLES = 20;
const STORAGE_KEY = 'supportNudge';

export interface NudgeState {
  /** Finished games you sat at, counted on this device. */
  games: number;
  /** The most recent counted table ids, newest last. */
  counted: string[];
  /** `games` when the sheet was last shown; 0 before the first time. */
  nudgedGames: number;
  nudgedAt: number | null;
  contributedAt: number | null;
}

export const EMPTY_NUDGE: NudgeState = { games: 0, counted: [], nudgedGames: 0, nudgedAt: null, contributedAt: null };

/** The state after this table's game ended; unchanged when it was already counted. */
export function countGame(state: NudgeState, tableId: string): NudgeState {
  if (state.counted.includes(tableId)) return state;
  return { ...state, games: state.games + 1, counted: [...state.counted, tableId].slice(-REMEMBERED_TABLES) };
}

/** Whether the sheet is due now. */
export function nudgeDue(state: NudgeState, now: number, every = NUDGE_EVERY_GAMES): boolean {
  if (state.games - state.nudgedGames < every) return false;
  if (state.nudgedAt !== null && now - state.nudgedAt < NUDGE_MIN_DAYS_APART * DAY_MS) return false;
  if (state.contributedAt !== null && now - state.contributedAt < NUDGE_REST_AFTER_CONTRIBUTION_DAYS * DAY_MS) return false;
  return true;
}

export interface NudgeStorage {
  get(): Promise<NudgeState | null>;
  set(state: NudgeState): Promise<void>;
}

export const asyncNudgeStorage: NudgeStorage = {
  async get() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_NUDGE, ...(JSON.parse(raw) as Partial<NudgeState>) } : null;
  },
  set: (state) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)),
};

export interface NudgeView {
  /** The sheet should be up. */
  visible: boolean;
  /** The number the sheet shows ("You've played {{n}} games"). */
  games: number;
}

export interface NudgeController {
  getState(): NudgeView;
  subscribe(listener: () => void): () => void;
  /** Call when a game-over screen is shown for a table you sat at. Safe to call repeatedly. */
  gameFinished(tableId: string): Promise<void>;
  /** Either button: the sheet goes away and today counts as shown. */
  dismiss(): Promise<void>;
  /** A contribution went through (or is pending): rest for a while. */
  contributed(): Promise<void>;
}

export function createNudge(storage: NudgeStorage = asyncNudgeStorage, now: () => number = Date.now,
                            every = NUDGE_EVERY_GAMES): NudgeController {
  let state = EMPTY_NUDGE;
  let view: NudgeView = { visible: false, games: 0 };
  const listeners = new Set<() => void>();
  // Loaded once, lazily: a game can end before anything else used the nudge.
  let loading: Promise<void> | null = null;
  const ready = () => (loading ??= storage.get().then((saved) => { if (saved) state = saved; }).catch(() => {}));

  function show(next: NudgeView): void {
    if (next.visible === view.visible && next.games === view.games) return;
    view = next;
    listeners.forEach((l) => l());
  }
  async function save(next: NudgeState): Promise<void> {
    state = next;
    await storage.set(next).catch(() => {}); // unsaved: the count restarts, nothing worse
  }

  return {
    getState: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async gameFinished(tableId) {
      await ready();
      const next = countGame(state, tableId);
      if (next !== state) await save(next);
      show({ visible: nudgeDue(state, now(), every), games: state.games });
    },
    async dismiss() {
      await ready();
      show({ visible: false, games: view.games });
      await save({ ...state, nudgedGames: state.games, nudgedAt: now() });
    },
    async contributed() {
      await ready();
      show({ visible: false, games: view.games });
      await save({ ...state, contributedAt: now() });
    },
  };
}
