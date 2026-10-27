import { useColorScheme } from 'react-native';

import { usePreferences } from '../settings/PreferencesContext';
import { colors, radius, shadow, size, space, type, type ThemeName } from './tokens';

export { radius, size, space, type };

export type Colors = { -readonly [K in keyof (typeof colors)['light']]: string };

/** The palette for a theme and felt choice. The blue-grey felt swaps exactly two tokens
 * (design system: "swap table → table-alt and table-raised → table-alt-raised"). */
export function palette(theme: ThemeName, felt: 'green' | 'blue'): Colors {
  const base: Colors = { ...colors[theme] };
  if (felt === 'blue') {
    base.table = base.tableAlt;
    base.tableRaised = base.tableAltRaised;
  }
  return base;
}

export function useTheme() {
  const system = useColorScheme();
  const { theme, felt } = usePreferences();
  const name: ThemeName = theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
  return { name, c: palette(name, felt), shadow: shadow[name], space, radius, size, type };
}
