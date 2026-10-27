import { analyse, RULES, sortHand } from '../src/game/melds';

// The same cases as backend/tests/engine/test_melds.py, so client and server agree.
const aberto = RULES.aberto;
const shape = (codes: string, rules = aberto, kind?: 'sequence' | 'trinca') => analyse(codes.split(' '), rules, kind);

test.each(['3H 4H 5H', '5H 3H 4H', '9S 10S JS QS KS', 'QD KD AD', 'AC 2C 3C'])('valid clean sequence %s', (codes) => {
  expect(shape(codes)).toEqual({ kind: 'sequence', wilds: 0 });
});

test.each(['3H 4H', '3H 4H 6H', '3H 4S 5H', 'KH AH 3H', '5H 5H 6H'])('invalid %s', (codes) => {
  expect(shape(codes)).toBeNull();
});

test('K-A-2 only as a wild Q', () => expect(shape('KH AH 2H')).toEqual({ kind: 'sequence', wilds: 1 }));
test('full ace-to-ace run', () => expect(shape('AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH')?.wilds).toBe(0));
test('fifteen cards never fit', () => expect(shape('AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH JK')).toBeNull());
test('joker fills a gap', () => expect(shape('3H JK 5H')?.wilds).toBe(1));
test('2 of another suit is wild', () => expect(shape('3H 2S 5H')?.wilds).toBe(1));
test('2 in its natural place is not wild', () => {
  expect(shape('AH 2H 3H')?.wilds).toBe(0);
  expect(shape('2H 3H 4H')?.wilds).toBe(0);
});
test('at most one wild', () => {
  expect(shape('3H JK 2S 6H')).toBeNull();
  expect(shape('3H JK JK')).toBeNull();
});
test('natural 2 plus one wild', () => expect(shape('2H 3H JK 5H')?.wilds).toBe(1));
test('only wilds is not a meld', () => expect(shape('JK 2S 2D')).toBeNull());
test('trinca in Aberto, not in STBL', () => {
  expect(shape('7H 7S 7D')).toEqual({ kind: 'trinca', wilds: 0 });
  expect(shape('7H 7S 7D', RULES.stbl)).toBeNull();
});
test('trinca with one wild; never of 2s', () => {
  expect(shape('KH KS JK')?.wilds).toBe(1);
  expect(shape('2H 2S 2D')).toBeNull();
});
test('kind is kept when extending', () => {
  expect(shape('7H 7S 7D 8H', aberto, 'trinca')).toBeNull();
  expect(shape('7H 8H 9H 7S', aberto, 'sequence')).toBeNull();
});

test('sorting by suit groups suits with aces high and jokers last', () => {
  const hand = ['JK', '3D', 'AS', '5S', 'KH', '2C'].map((label, id) => ({ id, label }));
  expect(sortHand(hand, 'suit').map((c) => c.label)).toEqual(['5S', 'AS', 'KH', '2C', '3D', 'JK']);
  expect(sortHand(hand, 'rank').map((c) => c.label)).toEqual(['2C', '3D', '5S', 'KH', 'AS', 'JK']);
});
