import {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';

import type { fontFiles } from './tokens';

/** Font files for useFonts. Typed against the theme's own list, so a style that needs a
 * font not loaded here is a type error. */
export const fonts: Record<(typeof fontFiles)[number], number> = {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
  Fraunces_600SemiBold,
};
