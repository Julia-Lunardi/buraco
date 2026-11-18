import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import { createTipJar, type TipJarController, type TipJarState } from './controller';
import { createNudge, type NudgeController, type NudgeView } from './nudge';
import { createStore } from './tipJar';
import type { TipStore } from './types';

interface Support {
  tips: TipJarController;
  nudge: NudgeController;
}

const SupportContext = createContext<Support | null>(null);

/** Mounted at the app root: the purchase listener and the recovery of unfinished purchases
 * must run even when the Support screen is never opened. `store` is injectable for tests. */
export function TipJarProvider({ children, store }: { children: ReactNode; store?: TipStore }) {
  const value = useMemo<Support>(() => ({ tips: createTipJar(store ?? createStore()), nudge: createNudge() }), [store]);
  useEffect(() => {
    const { tips, nudge } = value;
    void tips.start();
    // A contribution, from wherever it was made, rests the nudge.
    const unsubscribe = tips.subscribe(() => {
      const { status } = tips.getState();
      if (status === 'thanks' || status === 'pending') void nudge.contributed();
    });
    return () => { unsubscribe(); tips.stop(); };
  }, [value]);
  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

function useSupport(): Support {
  const value = useContext(SupportContext);
  if (!value) throw new Error('useTipJar must be used inside <TipJarProvider>');
  return value;
}

/** The thin hook the UI uses: state plus actions, no billing library in sight. */
export function useTipJar(): TipJarState & Pick<TipJarController, 'buy' | 'dismiss' | 'retryLoad'> {
  const { tips } = useSupport();
  const state = useSyncExternalStore(tips.subscribe, tips.getState);
  return { ...state, buy: tips.buy, dismiss: tips.dismiss, retryLoad: tips.retryLoad };
}

/** The game-over nudge. `visible` is false while the store has no products to offer: a nudge
 * toward "contributions aren't available" would be worse than none. */
export function useSupportNudge(): NudgeView & Pick<NudgeController, 'gameFinished' | 'dismiss'> {
  const { tips, nudge } = useSupport();
  const view = useSyncExternalStore(nudge.subscribe, nudge.getState);
  const { status } = useSyncExternalStore(tips.subscribe, tips.getState);
  const offerable = status !== 'unavailable' && status !== 'loading';
  return { ...view, visible: view.visible && offerable, gameFinished: nudge.gameFinished, dismiss: nudge.dismiss };
}
