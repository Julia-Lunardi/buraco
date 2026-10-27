/** Consumable contributions toward the app's server costs (docs/plans/tip-jar.md).
 * The same ids on both stores. They unlock nothing. */
export const TIP_IDS = ['tip_small', 'tip_medium', 'tip_large'] as const;
export type TipId = (typeof TIP_IDS)[number];

export interface TipProduct {
  id: TipId;
  /** The store's localised price string ("R$ 4,90"). Prices are never hard-coded. */
  displayPrice: string;
}

export interface StorePurchase {
  productId: string;
  state: 'purchased' | 'pending' | 'unknown';
  /** The library's own purchase object, handed back to finish(). */
  raw: unknown;
}

export type StoreErrorKind = 'cancelled' | 'pending' | 'failed';

/** The only surface the tip jar needs from a billing library (expo-iap or the mock). */
export interface TipStore {
  connect(): Promise<void>;
  products(ids: readonly TipId[]): Promise<TipProduct[]>;
  /** Starts the store's purchase sheet; the outcome arrives through the listeners. */
  buy(id: TipId): Promise<void>;
  onPurchase(listener: (purchase: StorePurchase) => void): () => void;
  onError(listener: (kind: StoreErrorKind) => void): () => void;
  /** Consume (Android) / finish (iOS). Throws if the store refuses: never report that as done. */
  finish(purchase: StorePurchase): Promise<void>;
  /** Purchases the store still holds unfinished (e.g. completed while the app was closed). */
  unfinished(): Promise<StorePurchase[]>;
}
