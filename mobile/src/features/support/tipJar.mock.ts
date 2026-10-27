import type { StoreErrorKind, StorePurchase, TipId, TipProduct, TipStore } from './types';

export type MockOutcome = 'success' | 'cancel' | 'fail' | 'pending' | 'refused-consume';

export interface MockOptions {
  /** What the next purchase does. Default 'success'. */
  outcome?: MockOutcome;
  /** No products: the store is unavailable. */
  unavailable?: boolean;
  /** Purchases the store still holds at launch. */
  unfinished?: StorePurchase[];
  /** Milliseconds before outcomes arrive (0 in tests, a little in the dev app). */
  delay?: number;
}

const PRICES: Record<TipId, string> = { tip_small: 'R$ 4,90', tip_medium: 'R$ 14,90', tip_large: 'R$ 24,90' };

/** A pretend store: used in Expo Go (no native billing there), with
 * EXPO_PUBLIC_TIP_JAR_MOCK=1, and in tests. It never charges anything. */
export function createMockStore(options: MockOptions = {}) {
  const purchaseListeners = new Set<(p: StorePurchase) => void>();
  const errorListeners = new Set<(k: StoreErrorKind) => void>();
  const finished: StorePurchase[] = [];
  const later = (fn: () => void) => (options.delay ? setTimeout(fn, options.delay) : Promise.resolve().then(fn));

  const store: TipStore & { finished: StorePurchase[]; options: MockOptions } = {
    finished,
    options,
    async connect() {},
    async products(ids): Promise<TipProduct[]> {
      return options.unavailable ? [] : ids.map((id) => ({ id, displayPrice: PRICES[id] }));
    },
    async buy(id) {
      const outcome = options.outcome ?? 'success';
      later(() => {
        if (outcome === 'cancel') errorListeners.forEach((l) => l('cancelled'));
        else if (outcome === 'fail') errorListeners.forEach((l) => l('failed'));
        else {
          const state = outcome === 'pending' ? 'pending' : 'purchased';
          purchaseListeners.forEach((l) => l({ productId: id, state, raw: { mock: true, outcome } }));
        }
      });
    },
    onPurchase(listener) {
      purchaseListeners.add(listener);
      return () => purchaseListeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    async finish(purchase) {
      if ((purchase.raw as { outcome?: MockOutcome })?.outcome === 'refused-consume') {
        throw new Error('consume refused');
      }
      finished.push(purchase);
    },
    async unfinished() {
      return options.unfinished ?? [];
    },
  };
  return store;
}
