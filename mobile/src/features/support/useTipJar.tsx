import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import { createTipJar, type TipJarController, type TipJarState } from './controller';
import { createStore } from './tipJar';
import type { TipStore } from './types';

const TipJarContext = createContext<TipJarController | null>(null);

/** Mounted at the app root: the purchase listener and the recovery of unfinished purchases
 * must run even when the Support screen is never opened. `store` is injectable for tests. */
export function TipJarProvider({ children, store }: { children: ReactNode; store?: TipStore }) {
  const controller = useMemo(() => createTipJar(store ?? createStore()), [store]);
  useEffect(() => {
    void controller.start();
    return () => controller.stop();
  }, [controller]);
  return <TipJarContext.Provider value={controller}>{children}</TipJarContext.Provider>;
}

/** The thin hook the UI uses: state plus actions, no billing library in sight. */
export function useTipJar(): TipJarState & Pick<TipJarController, 'buy' | 'dismiss' | 'retryLoad'> {
  const controller = useContext(TipJarContext);
  if (!controller) throw new Error('useTipJar must be used inside <TipJarProvider>');
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return { ...state, buy: controller.buy, dismiss: controller.dismiss, retryLoad: controller.retryLoad };
}
