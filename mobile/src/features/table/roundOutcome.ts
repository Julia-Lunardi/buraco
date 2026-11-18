import type { TableView } from '../../api/tables';

export type WentOut = 'you' | 'us' | 'them' | 'stock';
export type Mood = 'won' | 'lost' | 'tie';

/** How the last finished round ended, as you see it: who went out (backend `round_endings`; the
 * round's own state is gone by then) and whether your team scored more in it. "stock" is only a
 * stock that ran out with no morto left to replace it: a morto that becomes the stock (R-MORTO-3)
 * keeps the round going. */
export function roundOutcome(table: TableView): { wentOut: WentOut; mood: Mood } | null {
  const round = table.rounds[table.rounds.length - 1];
  if (!round) return null;
  const me = table.my_seat ?? 0;
  const myTeam = me % 2;
  const seat = table.round_endings?.[table.rounds.length - 1] ?? null;
  const wentOut: WentOut = seat === null ? 'stock' : seat === me ? 'you' : seat % 2 === myTeam ? 'us' : 'them';
  const diff = round[myTeam].total - round[1 - myTeam].total;
  return { wentOut, mood: diff > 0 ? 'won' : diff < 0 ? 'lost' : 'tie' };
}
