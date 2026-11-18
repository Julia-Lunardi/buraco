import { countGame, createNudge, EMPTY_NUDGE, nudgeDue, type NudgeState, type NudgeStorage } from '../src/features/support/nudge';

const DAY = 24 * 60 * 60 * 1000;
const EVERY = 10;

function memory(initial: NudgeState | null = null) {
  let saved = initial;
  const storage: NudgeStorage = { get: async () => saved, set: async (s) => { saved = s; } };
  return { storage, saved: () => saved };
}

async function finishGames(nudge: ReturnType<typeof createNudge>, n: number, from = 0) {
  for (let i = from; i < from + n; i++) await nudge.gameFinished(`table-${i}`);
}

test('a table counts once, however often its result is opened', () => {
  const once = countGame(EMPTY_NUDGE, 'a');
  expect(once.games).toBe(1);
  expect(countGame(once, 'a')).toBe(once);
  expect(countGame(once, 'b').games).toBe(2);
});

test('due every N games, never twice within three days, and not for six months after a contribution', () => {
  const now = 1_000 * DAY;
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 9 }, now, EVERY)).toBe(false);
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 10 }, now, EVERY)).toBe(true);
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 10, nudgedGames: 10, nudgedAt: now }, now, EVERY)).toBe(false);
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 20, nudgedGames: 10, nudgedAt: now - 2 * DAY }, now, EVERY)).toBe(false);
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 20, nudgedGames: 10, nudgedAt: now - 4 * DAY }, now, EVERY)).toBe(true);
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 20, nudgedGames: 10, contributedAt: now - 100 * DAY }, now, EVERY)).toBe(false);
  expect(nudgeDue({ ...EMPTY_NUDGE, games: 20, nudgedGames: 10, contributedAt: now - 200 * DAY }, now, EVERY)).toBe(true);
});

test('the sheet comes up on the tenth game with the count, and "not now" rests it for ten more', async () => {
  let clock = 1_000 * DAY;
  const { storage, saved } = memory();
  const nudge = createNudge(storage, () => clock, EVERY);
  await finishGames(nudge, 9);
  expect(nudge.getState()).toEqual({ visible: false, games: 9 });
  await finishGames(nudge, 1, 9);
  expect(nudge.getState()).toEqual({ visible: true, games: 10 });
  await nudge.dismiss();
  expect(nudge.getState().visible).toBe(false);
  expect(saved()?.nudgedGames).toBe(10);
  clock += 7 * DAY;
  await finishGames(nudge, 9, 10);
  expect(nudge.getState()).toEqual({ visible: false, games: 19 });
  await finishGames(nudge, 1, 19);
  expect(nudge.getState()).toEqual({ visible: true, games: 20 });
});

test('a skipped nudge (too soon) waits for the next game, not another ten', async () => {
  let clock = 1_000 * DAY;
  const nudge = createNudge(memory().storage, () => clock, EVERY);
  await finishGames(nudge, 10);
  await nudge.dismiss();
  await finishGames(nudge, 10, 10); // 20 games, but only an hour later
  expect(nudge.getState().visible).toBe(false);
  clock += 4 * DAY;
  await finishGames(nudge, 1, 20);
  expect(nudge.getState()).toEqual({ visible: true, games: 21 });
});

test('a contribution hides the sheet and rests it, and the count survives a restart', async () => {
  const clock = 1_000 * DAY;
  const { storage, saved } = memory();
  const nudge = createNudge(storage, () => clock, EVERY);
  await finishGames(nudge, 10);
  expect(nudge.getState().visible).toBe(true);
  await nudge.contributed();
  expect(nudge.getState().visible).toBe(false);
  expect(saved()?.contributedAt).toBe(clock);

  const again = createNudge(storage, () => clock + 1, EVERY);
  await finishGames(again, 1, 10);
  expect(again.getState()).toEqual({ visible: false, games: 11 });
});

test('unreadable storage starts from zero without throwing', async () => {
  const broken: NudgeStorage = { get: async () => { throw new Error('nope'); }, set: async () => { throw new Error('nope'); } };
  const nudge = createNudge(broken, () => 0, EVERY);
  await finishGames(nudge, 1);
  expect(nudge.getState()).toEqual({ visible: false, games: 1 });
});
