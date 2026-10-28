import { getLocales } from 'expo-localization';
import { I18n, type TranslateOptions } from 'i18n-js';

import da from './da';
import en from './en';
import ptBR from './pt-BR';

export type Locale = 'pt-BR' | 'en' | 'da';

export const i18n = new I18n({ 'pt-BR': ptBR, en, da });
i18n.enableFallback = true;
i18n.defaultLocale = 'pt-BR';

/** The first device language we support. Any Portuguese → pt-BR. Anything else → English,
 * the most widely understood of the three. */
export function pickLocale(languageTags: string[]): Locale {
  for (const tag of languageTags) {
    const lang = tag.toLowerCase().split('-')[0];
    if (lang === 'pt') return 'pt-BR';
    if (lang === 'da') return 'da';
    if (lang === 'en') return 'en';
  }
  return 'en';
}

export function deviceLocale(): Locale {
  return pickLocale(getLocales().map((l) => l.languageTag));
}

i18n.locale = deviceLocale();

/** Settings → Language: a fixed language, or `system` to follow the phone. */
export type LanguagePref = 'system' | Locale;
export const LANGUAGES: { value: Locale; name: string }[] = [
  { value: 'pt-BR', name: 'Português (Brasil)' },
  { value: 'en', name: 'English' },
  { value: 'da', name: 'Dansk' },
];

export function applyLanguage(pref: LanguagePref): void {
  i18n.locale = pref === 'system' ? deviceLocale() : pref;
}

export function t(key: string, options?: TranslateOptions): string {
  return i18n.t(key, options);
}
