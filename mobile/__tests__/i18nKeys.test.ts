import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import ptBR from '../src/i18n/pt-BR';

// t() takes any string, so the compiler can't catch a key that isn't there: every literal
// t('a.b') in the app must exist in pt-BR (the other locales are typed against it).
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const has = (key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], ptBR) !== undefined;

test('every t() key used in the app exists', () => {
  const missing: string[] = [];
  for (const file of files(join(__dirname, '../src'))) {
    for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      if (!has(key)) missing.push(`${key} (${file.split('/src/')[1]})`);
    }
  }
  expect(missing).toEqual([]);
});
