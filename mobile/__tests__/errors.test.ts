import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describeError } from '../src/api/errors';
import { i18n } from '../src/i18n';
import ptBR from '../src/i18n/pt-BR';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'pt-BR' }] }));

afterEach(() => { i18n.locale = 'pt-BR'; });

test('known codes are explained in the app language, not the server English', () => {
  expect(describeError('invalid_meld', 'These cards are not a sequence…', 'x'))
    .toMatch(/^Um jogo precisa de 3 cartas/);
  i18n.locale = 'da';
  expect(describeError('not_your_turn', 'It is not your turn.', 'x')).toBe('Det er ikke din tur endnu.');
});

test('wrong_phase depends on whether you already drew', () => {
  expect(describeError('wrong_phase', 'x', 'x', 'draw')).toMatch(/^Primeiro compre/);
  expect(describeError('wrong_phase', 'x', 'x', 'play')).toMatch(/^Você já comprou/);
});

test('an unknown code falls back to the server detail, then to the fallback', () => {
  expect(describeError('brand_new_code', 'Server says why.', 'Fallback')).toBe('Server says why.');
  expect(describeError(undefined, undefined, 'Fallback')).toBe('Fallback');
});

// Codes a player can't trigger through the app's own screens (validated client-side or internal).
const INTERNAL = new Set(['bad_seats', 'bad_target', 'bad_bot_level', 'unknown_preset', 'no_such_message', 'no_such_user']);

function backendCodes(): Set<string> {
  const root = join(__dirname, '../../backend/app');
  const codes = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.py')) {
        const src = readFileSync(path, 'utf8');
        for (const m of src.matchAll(/(?:IllegalMove\(|TableError\([^,]+,\s*)"([a-z_]+)"/g)) codes.add(m[1]);
      }
    }
  };
  walk(root);
  return codes;
}

test('every error code the backend can send is explained in the app', () => {
  const explained = new Set(Object.keys(ptBR.errors).map((k) => k.replace(/_(draw|play)$/, '')));
  const codes = backendCodes();
  expect(codes.size).toBeGreaterThan(20); // the scan found the backend
  const missing = [...codes].filter((c) => !explained.has(c) && !INTERNAL.has(c));
  expect(missing).toEqual([]);
});
