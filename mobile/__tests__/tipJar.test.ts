import { createTipJar, type TipJarController } from '../src/features/support/controller';
import { createMockStore, type MockOptions } from '../src/features/support/tipJar.mock';

jest.mock('expo-constants', () => ({ __esModule: true, default: {}, ExecutionEnvironment: {} }));

async function started(options: MockOptions = {}) {
  const store = createMockStore(options);
  const jar = createTipJar(store);
  await jar.start();
  return { store, jar };
}

/** Let the mock store's listeners fire. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function buy(jar: TipJarController, id: 'tip_small' | 'tip_medium' | 'tip_large' = 'tip_small') {
  await jar.buy(id);
  await settle();
}

test('products load in small, medium, large order with store prices', async () => {
  const { jar } = await started();
  expect(jar.getState().status).toBe('ready');
  expect(jar.getState().products).toEqual([
    { id: 'tip_small', displayPrice: 'R$ 4,90' },
    { id: 'tip_medium', displayPrice: 'R$ 14,90' },
    { id: 'tip_large', displayPrice: 'R$ 24,90' },
  ]);
});

test('success: the consumable is finished, then a quiet thank-you', async () => {
  const { jar, store } = await started({ outcome: 'success' });
  await buy(jar, 'tip_medium');
  expect(store.finished.map((p) => p.productId)).toEqual(['tip_medium']);
  expect(jar.getState().status).toBe('thanks');
  jar.dismiss();
  expect(jar.getState().status).toBe('ready');
});

test('cancel is silent: straight back to the buttons', async () => {
  const { jar, store } = await started({ outcome: 'cancel' });
  await buy(jar);
  expect(jar.getState().status).toBe('ready');
  expect(store.finished).toEqual([]);
});

test('failure shows a kind message and finishes nothing', async () => {
  const { jar, store } = await started({ outcome: 'fail' });
  await buy(jar);
  expect(jar.getState().status).toBe('failed');
  expect(store.finished).toEqual([]);
});

test('pending is not finished until it completes', async () => {
  const { jar, store } = await started({ outcome: 'pending' });
  await buy(jar);
  expect(jar.getState().status).toBe('pending');
  expect(store.finished).toEqual([]);
});

test('unavailable when the store has no products', async () => {
  const { jar } = await started({ unavailable: true });
  expect(jar.getState().status).toBe('unavailable');
  expect(jar.getState().products).toEqual([]);
});

test('unavailable (no error dialog) when the store cannot connect', async () => {
  const store = createMockStore();
  store.connect = async () => { throw new Error('billing unavailable'); };
  const jar = createTipJar(store);
  await jar.start();
  expect(jar.getState().status).toBe('unavailable');
});

test('a refused consume is a failure, never a thank-you', async () => {
  const { jar, store } = await started({ outcome: 'refused-consume' });
  await buy(jar);
  expect(jar.getState().status).toBe('failed');
  expect(store.finished).toEqual([]);
});

test('purchases completed while the app was closed are finished at launch', async () => {
  const { store, jar } = await started({ unfinished: [
    { productId: 'tip_large', state: 'purchased', raw: {} },
    { productId: 'tip_small', state: 'pending', raw: {} }, // still pending: left alone
    { productId: 'someone_elses_product', state: 'purchased', raw: {} }, // not ours
  ] });
  expect(store.finished.map((p) => p.productId)).toEqual(['tip_large']);
  expect(jar.getState().status).toBe('ready'); // finished quietly, no thank-you out of nowhere
});

test('a purchase arriving in the background is finished quietly', async () => {
  const { store, jar } = await started();
  // e.g. a pending purchase approved later: the listener fires with nothing on screen.
  store.onPurchase(() => {});
  await (store as unknown as { buy(id: string): Promise<void> }).buy('tip_small');
  await settle();
  expect(store.finished.map((p) => p.productId)).toEqual(['tip_small']);
  expect(jar.getState().status).toBe('ready');
});

test('a second tap while purchasing does nothing', async () => {
  const store = createMockStore({ delay: 50 });
  const jar = createTipJar(store);
  await jar.start();
  void jar.buy('tip_small');
  void jar.buy('tip_large');
  expect(jar.getState().buying).toBe('tip_small');
  jar.stop();
});

test('mock mode is on in Expo Go and with EXPO_PUBLIC_TIP_JAR_MOCK=1', () => {
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'storeClient' },
                                           ExecutionEnvironment: { StoreClient: 'storeClient' } }));
    const { mockMode } = require('../src/features/support/tipJar');
    expect(mockMode()).toBe(true);
  });
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'standalone' },
                                           ExecutionEnvironment: { StoreClient: 'storeClient' } }));
    const previous = process.env.EXPO_PUBLIC_TIP_JAR_MOCK;
    process.env.EXPO_PUBLIC_TIP_JAR_MOCK = '1';
    const { mockMode } = require('../src/features/support/tipJar');
    expect(mockMode()).toBe(true);
    process.env.EXPO_PUBLIC_TIP_JAR_MOCK = '0';
    expect(mockMode()).toBe(false);
    process.env.EXPO_PUBLIC_TIP_JAR_MOCK = previous;
  });
});
