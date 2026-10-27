import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import da from '../src/i18n/da';
import en from '../src/i18n/en';
import { pickLocale } from '../src/i18n';
import ptBR from '../src/i18n/pt-BR';
import { palette } from '../src/theme';
import { colors } from '../src/theme/tokens';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'pt-BR' }] }));

describe('locale', () => {
  test.each([
    [['pt-BR'], 'pt-BR'], [['pt-PT'], 'pt-BR'], [['da-DK'], 'da'], [['en-GB'], 'en'],
    [['fr-FR', 'da-DK'], 'da'], [['fr-FR'], 'en'], [[], 'en'],
  ])('%j → %s', (tags, expected) => {
    expect(pickLocale(tags)).toBe(expected);
  });
});

describe('translations', () => {
  const keys = (obj: object, prefix = ''): string[] => Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

  test('en and da have exactly the pt-BR keys', () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
    expect(keys(da).sort()).toEqual(keys(ptBR).sort());
  });

  test('no UI copy uses the word "doação" / donation (Apple 3.2.1)', () => {
    const all = JSON.stringify([ptBR, en, da]).toLowerCase();
    expect(all).not.toMatch(/doa[çc][ãa]o|donation|donér/);
  });
});

describe('theme', () => {
  test('tokens.ts matches the design-system snapshot', () => {
    expect(() => execFileSync('node', [join(__dirname, '../scripts/build-theme.mjs'), '--check'])).not.toThrow();
  });

  test('the blue-grey felt swaps exactly the two table tokens', () => {
    const green = palette('light', 'green');
    const blue = palette('light', 'blue');
    expect(blue.table).toBe(colors.light.tableAlt);
    expect(blue.tableRaised).toBe(colors.light.tableAltRaised);
    const changed = Object.keys(green).filter((k) => green[k as keyof typeof green] !== blue[k as keyof typeof blue]);
    expect(changed.sort()).toEqual(['table', 'tableRaised']);
  });
});
