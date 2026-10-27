import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Felt = 'green' | 'blue';
export type OrientationPref = 'auto' | 'portrait' | 'landscape';
export type HandSort = 'suit' | 'rank';

export interface Preferences {
  theme: ThemePref;
  felt: Felt;
  orientation: OrientationPref;
  /** Default hand order at the table; the table's own toggle changes it too. */
  sort: HandSort;
}

const DEFAULTS: Preferences = { theme: 'system', felt: 'green', orientation: 'auto', sort: 'suit' };
const STORAGE_KEY = 'preferences';

const LOCKS: Record<OrientationPref, ScreenOrientation.OrientationLock> = {
  auto: ScreenOrientation.OrientationLock.DEFAULT,
  portrait: ScreenOrientation.OrientationLock.PORTRAIT_UP,
  landscape: ScreenOrientation.OrientationLock.LANDSCAPE,
};

interface PreferencesValue extends Preferences {
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setPrefs({ ...DEFAULTS, ...JSON.parse(raw) }))
      .catch(() => {}); // unreadable prefs: defaults are fine
  }, []);

  // Android 16 ignores orientation locks on screens >= 600dp wide, so tablet layouts must
  // work both ways whatever is chosen here; on phones the lock is honoured.
  useEffect(() => {
    ScreenOrientation.lockAsync(LOCKS[prefs.orientation]).catch(() => {});
  }, [prefs.orientation]);

  const value = useMemo<PreferencesValue>(() => ({
    ...prefs,
    set(key, value) {
      setPrefs((current) => {
        const next = { ...current, [key]: value };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
  }), [prefs]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}
