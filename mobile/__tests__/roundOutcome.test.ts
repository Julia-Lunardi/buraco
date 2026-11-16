import type { TableView, TeamScore } from '../src/api/tables';
import { roundOutcome } from '../src/features/table/roundOutcome';

const score = (total: number): TeamScore =>
  ({ melded: 0, canastras: { suja: 0, limpa: 0, real: 0 }, canastra_bonus: 0, bater: 0, hand_penalty: 0, morto_penalty: 0, total });
const table = (mySeat: number, endings: (number | null)[], totals: [number, number]) =>
  ({ my_seat: mySeat, round_endings: endings, rounds: endings.map(() => [score(totals[0]), score(totals[1])]) }) as unknown as TableView;

test('who went out, from the round endings (not the finished round, which is gone)', () => {
  expect(roundOutcome(table(0, [0], [500, 100]))?.wentOut).toBe('you');
  expect(roundOutcome(table(0, [2], [500, 100]))?.wentOut).toBe('us');
  expect(roundOutcome(table(0, [3], [500, 100]))?.wentOut).toBe('them');
  expect(roundOutcome(table(1, [null], [500, 100]))?.wentOut).toBe('stock');
});

test('the mood is whether your team scored more this round', () => {
  expect(roundOutcome(table(0, [1], [700, 300]))?.mood).toBe('won'); // they went out, we still won
  expect(roundOutcome(table(1, [1], [700, 300]))?.mood).toBe('lost');
  expect(roundOutcome(table(1, [null], [200, 200]))?.mood).toBe('tie');
});

test('only the last round counts, and before any round there is nothing', () => {
  expect(roundOutcome(table(0, [null, 0], [900, 100]))?.wentOut).toBe('you');
  expect(roundOutcome(table(0, [], [0, 0]))).toBeNull();
});
