import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as ExpoIap from 'expo-iap';

import { createMockStore } from './tipJar.mock';
import type { StoreErrorKind, StorePurchase, TipStore } from './types';

/**
 * The only file that imports the billing library (expo-iap, approved 26.10.2026 and pinned
 * to an exact version: Woddie's react-native-iap broke iOS builds when an OpenIAP pod moved
 * to a newer Xcode). Loaded lazily, because Expo Go has no native billing module.
 */
function createExpoIapStore(iap: typeof ExpoIap): TipStore {
  const toPurchase = (p: ExpoIap.Purchase): StorePurchase =>
    ({ productId: p.productId, state: p.purchaseState, raw: p });

  return {
    async connect() {
      await iap.initConnection();
    },
    async products(ids) {
      const products = (await iap.fetchProducts({ skus: [...ids], type: 'in-app' })) ?? [];
      return (products as ExpoIap.Product[]).map((p) => ({ id: p.id as (typeof ids)[number], displayPrice: p.displayPrice }));
    },
    async buy(id) {
      await iap.requestPurchase({ request: { apple: { sku: id }, google: { skus: [id] } }, type: 'in-app' });
    },
    onPurchase(listener) {
      const sub = iap.purchaseUpdatedListener((p) => listener(toPurchase(p)));
      return () => sub.remove();
    },
    onError(listener) {
      const sub = iap.purchaseErrorListener((error) => {
        let kind: StoreErrorKind = 'failed';
        if (iap.isUserCancelledError(error)) kind = 'cancelled';
        else if (error.code === iap.ErrorCode.Pending || error.code === iap.ErrorCode.DeferredPayment) kind = 'pending';
        listener(kind);
      });
      return () => sub.remove();
    },
    async finish(purchase) {
      // isConsumable: consume on Android (else refunded after 3 days and not buyable
      // again), finish the transaction on iOS. expo-iap >= 6.0.2 throws when the store
      // refuses, instead of reporting success (OpenIAP PR #528).
      await iap.finishTransaction({ purchase: purchase.raw as ExpoIap.Purchase, isConsumable: true });
    },
    async unfinished() {
      return (await iap.getAvailablePurchases()).map(toPurchase);
    },
  };
}

/** Mock in Expo Go (no native billing) or when EXPO_PUBLIC_TIP_JAR_MOCK=1. */
export function mockMode(): boolean {
  return process.env.EXPO_PUBLIC_TIP_JAR_MOCK === '1'
    || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function createStore(): TipStore {
  if (mockMode()) return createMockStore({ delay: 600 });
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: absent in Expo Go
  return createExpoIapStore(require('expo-iap') as typeof ExpoIap);
}
