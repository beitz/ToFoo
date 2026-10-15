import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exchangeJsonSchema } from './jsonSchema';
import { backupSummary, buildBackup, parseExchange } from './parse';
import { defaultProfile, defaultSettings } from '../storage/defaults';
import type { Snapshot } from '../storage/repo';

const snapshot: Snapshot = {
  profile: defaultProfile('2026-10-15'),
  settings: defaultSettings(),
  recipes: [],
  batches: [],
  log: [
    { id: '1', schemaVersion: 1, time: 1, day: '2026-10-15', confidence: 'A', label: 'Hafer', kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, grams: 60.5, preparation: 'asListed' },
    { id: '2', schemaVersion: 1, time: 2, day: '2026-10-15', confidence: 'C', label: 'Tea', kind: 'drink', drink: 'tea' },
  ],
  customFoods: [],
  dayStatus: [{ day: '2026-10-14', status: 'fasted', schemaVersion: 1 }],
  fasts: [],
  sunEntries: [],
};

describe('exchange format', () => {
  it('round-trips a backup', () => {
    const file = buildBackup(snapshot, '0.1.0', new Date('2026-10-15T10:00:00Z'));
    const parsed = parseExchange(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.value.type === 'backup') {
      expect(parsed.value.data).toEqual(snapshot);
      expect(backupSummary(parsed.value)[0]).toEqual(['Log entries', 2]);
    }
  });

  it('rejects invalid input with a clear message, never partially', () => {
    expect(parseExchange('{nope')).toEqual({ ok: false, error: 'This is not valid JSON.' });
    const bad = parseExchange(JSON.stringify({ format: 'other' }));
    expect(bad.ok).toBe(false);
    const file = buildBackup(snapshot, '0.1.0', new Date());
    (file.data.log[0] as { grams: number }).grams = -5;
    const neg = parseExchange(JSON.stringify(file));
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.error).toContain('data.log.0.grams');
  });

  it('refuses newer format versions', () => {
    const res = parseExchange(JSON.stringify({ format: 'tofoo', formatVersion: 99, type: 'backup' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/version 99/);
  });

  it('ignores unknown fields', () => {
    const res = parseExchange(
      JSON.stringify({
        format: 'tofoo',
        formatVersion: 1,
        type: 'recipe',
        futureField: 1,
        recipe: { name: 'Linsencurry', portions: 6, ingredients: [{ source: 'BLS', version: '4.0', code: 'H700000', grams: 400, extra: true }] },
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.type === 'recipe') {
      expect(res.value.recipe.ingredients[0]).toMatchObject({ preparation: 'asListed' });
      expect('futureField' in res.value).toBe(false);
    }
  });

  it('keeps docs/exchange-format.schema.json in sync (run `npm run schema`)', () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../../docs/exchange-format.schema.json'), 'utf8'));
    expect(file).toEqual(JSON.parse(JSON.stringify(exchangeJsonSchema())));
  });
});
