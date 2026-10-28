import type { GameView, TableView } from '../src/api/tables';
import { BOT_PAUSE, framesFor, ROUND_END_PAUSE } from '../src/realtime/pacing';

const game = (current: number, stock: number) => ({ current, stock_size: stock }) as GameView;
const table = (over: Partial<TableView>) => ({ status: 'playing', current_seat: 0, game: game(0, 50), ...over }) as TableView;
const mid = () => 0.5; // no jitter

describe('framesFor', () => {
  it('shows a state without bot moves at once', () => {
    const t = table({ steps: [] });
    expect(framesFor(t, mid)).toEqual([{ table: t, delay: 0 }]);
  });

  it('replays each bot move after its pause, then the state itself', () => {
    const t = table({ current_seat: 0, game: game(0, 48), steps: [
      { seat: null, action: null, game: game(1, 50) },
      { seat: 1, action: 'draw', game: game(1, 49) },
      { seat: 1, action: 'discard', game: game(0, 49) },
    ] });
    const frames = framesFor(t, mid);
    expect(frames.map((f) => f.delay)).toEqual([0, BOT_PAUSE.draw, BOT_PAUSE.discard, 0]);
    expect(frames.map((f) => f.table.current_seat)).toEqual([1, 1, 0, 0]);
    expect(frames[1].table.game?.stock_size).toBe(49);
    expect(frames[3].table.game?.stock_size).toBe(48);
    expect(frames.every((f) => !f.table.steps?.length)).toBe(true);
  });

  it('keeps the table up a moment when a bot ends the round', () => {
    const t = table({ status: 'round_over', steps: [{ seat: 1, action: 'discard', game: game(1, 30) }] });
    const frames = framesFor(t, mid);
    expect(frames[0].table.status).toBe('playing');
    expect(frames[1]).toEqual({ table: { ...t, steps: [] }, delay: ROUND_END_PAUSE });
  });

  it('varies pauses by at most 15%', () => {
    const t = table({ steps: [{ seat: 1, action: 'draw', game: game(1, 49) }] });
    expect(framesFor(t, () => 0)[0].delay).toBe(Math.round(BOT_PAUSE.draw * 0.85));
    expect(framesFor(t, () => 1)[0].delay).toBe(Math.round(BOT_PAUSE.draw * 1.15));
  });
});
