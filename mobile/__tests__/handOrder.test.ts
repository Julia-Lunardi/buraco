import { arrangeHand, inOrder } from '../src/game/handOrder';

test('kept cards keep their places and leaving cards drop out', () => {
  expect(arrangeHand([5, 3, 9, 1], [1, 9, 5])).toEqual([5, 9, 1]);
});

test('a new card goes where the random number puts it', () => {
  expect(arrangeHand([5, 3, 9], [3, 5, 9, 7], () => 0)).toEqual([7, 5, 3, 9]);
  expect(arrangeHand([5, 3, 9], [3, 5, 9, 7], () => 0.99)).toEqual([5, 3, 9, 7]);
  expect(arrangeHand([5, 3, 9], [3, 5, 9, 7], () => 0.5)).toEqual([5, 3, 7, 9]);
});

test('every new card is placed, each at its own random spot', () => {
  const order = arrangeHand([1, 2], [1, 2, 10, 11, 12])!;
  expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 10, 11, 12]);
  expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
});

test('a new deal leaves the order to the caller', () => {
  expect(arrangeHand([1, 2, 3], [7, 8, 9])).toBeNull();
  expect(arrangeHand([], [7, 8, 9])).toBeNull();
});

test('cards come out in order, unknown ones last', () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];
  expect(inOrder(cards, [3, 9, 1]).map((c) => c.id)).toEqual([3, 1, 2]);
});
