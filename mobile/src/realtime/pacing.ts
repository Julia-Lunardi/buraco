import type { BotStep, TableView } from '../api/tables';

/** How long a bot "thinks" before each kind of move, in ms. The server decides at once; these
 * make a bot's turn read like a person's: a pause to draw, a beat per meld, a pause to discard. */
export const BOT_PAUSE: Record<NonNullable<BotStep['action']>, number> = {
  draw: 900,
  take_discard: 1000,
  lay_down: 750,
  add_to_meld: 650,
  discard: 800,
};
/** After the last move ends a round, before the summary replaces the table. */
export const ROUND_END_PAUSE = 1400;

export interface Frame {
  table: TableView;
  /** Wait this long after the previous frame before showing this one. */
  delay: number;
}

/** A pushed state as frames to show in order: each bot move (still "playing", that seat's turn),
 * then the state itself. Without steps it is a single frame, shown at once. `jitter` (0..1)
 * varies each pause by up to ±15%, so bots don't move like a metronome. */
export function framesFor(next: TableView, jitter: () => number = Math.random): Frame[] {
  const steps = next.steps ?? [];
  if (!steps.length) return [{ table: next, delay: 0 }];
  const vary = (ms: number) => Math.round(ms * (0.85 + 0.3 * jitter()));
  const frames: Frame[] = steps.map((step) => ({
    table: { ...next, status: 'playing', current_seat: step.game.current, game: step.game, steps: [] },
    delay: step.action ? vary(BOT_PAUSE[step.action]) : 0,
  }));
  // The last step is the table now: swap it in at once, unless the round ended on that move.
  frames.push({ table: { ...next, steps: [] }, delay: next.status === 'playing' ? 0 : ROUND_END_PAUSE });
  return frames;
}
