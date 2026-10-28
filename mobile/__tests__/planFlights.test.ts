import type { CardView, GameView } from '../src/api/tables';
import { planFlights } from '../src/features/table/planFlights';

const c = (id: number, label = 'AS'): CardView => ({ id, label });
const meld = (id: number, cards: CardView[]) => ({ id, cards, kind: 'trinca' as const, wilds: 0, canastra: null });
const game = (over: Partial<GameView>): GameView => ({
  seat: 0, current: 0, phase: 'play', hand: [], hand_sizes: [11, 11], stock_size: 50, discard: [],
  teams: [{ morto_waiting: true, took_morto: false, melds: [] }, { morto_waiting: true, took_morto: false, melds: [] }],
  went_out: null, ...over,
});
const route = (plans: ReturnType<typeof planFlights>) => plans.map((p) => `${p.from[0]} -> ${p.to[0]}${p.label ? ` ${p.label}` : ''}`);

describe('planFlights', () => {
  it('flies my drawn card face down from the stock into my hand', () => {
    const plans = planFlights(game({ phase: 'draw', hand: [c(1)] }), game({ hand: [c(1), c(2)], stock_size: 49 }));
    expect(route(plans)).toEqual(['stock -> card:2 AS']);
    expect(plans[0]).toMatchObject({ id: 2, flip: true });
  });

  it("flies a bot's draw to its seat and its discard from its seat", () => {
    const before = game({ current: 1, phase: 'draw', discard: [c(5, 'KH')] });
    const drew = game({ current: 1, stock_size: 49 });
    expect(route(planFlights(before, { ...drew, discard: before.discard }))).toEqual(['stock -> seat:1']);
    const threw = game({ current: 0, phase: 'draw', stock_size: 49, discard: [c(5, 'KH'), c(9, '7D')] });
    expect(route(planFlights({ ...drew, discard: before.discard }, threw))).toEqual(['seat:1 -> card:9 7D']);
  });

  it('flies my laid-down cards from their place in my hand to the meld', () => {
    const cards = [c(1, '5S'), c(2, '5H'), c(3, '5D')];
    const before = game({ hand: [...cards, c(4)] });
    const after = game({ hand: [c(4)], teams: [{ morto_waiting: true, took_morto: false, melds: [meld(1, cards)] },
                                                 before.teams[1]] });
    expect(route(planFlights(before, after))).toEqual(['card:1 -> card:1 5S', 'card:2 -> card:2 5H', 'card:3 -> card:3 5D']);
    expect(planFlights(before, after).map((p) => p.delay)).toEqual([0, 70, 140]);
  });

  it('flies the whole lixo into the hand of whoever took it', () => {
    const pile = [c(5, 'KH'), c(9, '7D')];
    const before = game({ current: 1, phase: 'draw', discard: pile });
    expect(route(planFlights(before, game({ current: 1, discard: [] })))).toEqual(['card:5 -> card:5 KH', 'card:9 -> card:9 7D']);
    expect(planFlights(before, game({ current: 1, discard: [] }))[0].to).toEqual(['card:5', 'seat:1']);
  });

  it('flies nothing when a new round is dealt', () => {
    expect(planFlights(game({ stock_size: 10 }), game({ stock_size: 60, hand: [c(1)] }))).toEqual([]);
    expect(planFlights(null, game({}))).toEqual([]);
  });
});
