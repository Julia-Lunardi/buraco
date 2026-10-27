import { TIP_IDS, type StorePurchase, type TipId, type TipProduct, type TipStore } from './types';

/**
 * The tip jar's behaviour, independent of React and of any billing library:
 * - started once at app launch, so purchases completed while the Support screen is closed
 *   (or after a restart) are still finished;
 * - every purchased consumable is finished with isConsumable semantics; a store that
 *   refuses the consume is a failure, never a thank-you (Google refunds unconsumed
 *   purchases after 3 days, and the same tip could not be bought again);
 * - pending purchases ("Ask to Buy", cash payments) are left alone until they complete;
 * - a cancel is silent;
 * - no logging of payment details and no analytics: nothing here records anything.
 */

export type TipStatus = 'loading' | 'ready' | 'unavailable' | 'purchasing' | 'thanks' | 'pending' | 'failed';

export interface TipJarState {
  status: TipStatus;
  products: TipProduct[];
  /** The tip being bought, while status is 'purchasing'. */
  buying: TipId | null;
}

export interface TipJarController {
  getState(): TipJarState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  stop(): void;
  buy(id: TipId): Promise<void>;
  /** Back to the buttons after a thank-you, failure or pending note. */
  dismiss(): void;
  retryLoad(): Promise<void>;
}

const isTip = (id: string): id is TipId => (TIP_IDS as readonly string[]).includes(id);

export function createTipJar(store: TipStore): TipJarController {
  let state: TipJarState = { status: 'loading', products: [], buying: null };
  const listeners = new Set<() => void>();
  const unsubscribers: (() => void)[] = [];
  let started = false;

  const current = (): TipJarState => state;

  function set(next: Partial<TipJarState>): void {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  }

  /** Finish a purchased tip. True when the store confirmed it. */
  async function finish(purchase: StorePurchase): Promise<boolean> {
    try {
      await store.finish(purchase);
      return true;
    } catch {
      return false; // left unfinished: recovered and retried at the next launch
    }
  }

  async function onPurchase(purchase: StorePurchase): Promise<void> {
    if (!isTip(purchase.productId)) return;
    if (purchase.state === 'pending') {
      if (state.status === 'purchasing') set({ status: 'pending', buying: null });
      return;
    }
    if (purchase.state !== 'purchased') return;
    const finished = await finish(purchase);
    // A purchase finishing in the background (no sheet open) is completed quietly.
    if (state.status === 'purchasing' || state.status === 'pending') {
      set({ status: finished ? 'thanks' : 'failed', buying: null });
    }
  }

  async function loadProducts(): Promise<void> {
    set({ status: 'loading' });
    try {
      const products = await store.products(TIP_IDS);
      // Same order as the ids (small, medium, large), whatever order the store returns.
      const ordered = TIP_IDS.map((id) => products.find((p) => p.id === id)).filter((p): p is TipProduct => !!p);
      set({ status: ordered.length ? 'ready' : 'unavailable', products: ordered });
    } catch {
      set({ status: 'unavailable', products: [] });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (started) return;
      started = true;
      try {
        await store.connect();
      } catch {
        set({ status: 'unavailable' });
        return;
      }
      unsubscribers.push(store.onPurchase((p) => { void onPurchase(p); }));
      unsubscribers.push(store.onError((kind) => {
        if (state.status !== 'purchasing') return;
        if (kind === 'cancelled') set({ status: 'ready', buying: null }); // silent
        else set({ status: kind === 'pending' ? 'pending' : 'failed', buying: null });
      }));
      try {
        for (const purchase of await store.unfinished()) {
          if (isTip(purchase.productId) && purchase.state === 'purchased') await finish(purchase);
        }
      } catch {
        // Recovery is retried at the next launch.
      }
      await loadProducts();
    },
    stop() {
      unsubscribers.splice(0).forEach((u) => u());
      started = false;
    },
    async buy(id) {
      if (state.status !== 'ready') return;
      set({ status: 'purchasing', buying: id });
      try {
        await store.buy(id);
      } catch {
        // Read through a function: listeners may have changed `state` while the sheet was open.
        if (current().status === 'purchasing') set({ status: 'failed', buying: null });
      }
    },
    dismiss() {
      if (['thanks', 'failed', 'pending'].includes(state.status)) {
        set({ status: state.products.length ? 'ready' : 'unavailable' });
      }
    },
    retryLoad: loadProducts,
  };
}
