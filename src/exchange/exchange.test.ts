import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exchangeJsonSchema } from './jsonSchema';
import { buildBackup, snapshotCounts } from './build';
import { parseExchange } from './parse';
import { defaultProfile, defaultSettings } from '../storage/defaults';
import type { Snapshot } from '../storage/repo';

const lentils = { ref: { source: 'BLS' as const, version: '4.0', code: 'H700000' }, name: 'Lentils', grams: 400, preparation: 'boiled' as const };
const snapshot: Snapshot = {
  profile: defaultProfile('2026-10-15'),
  settings: {
    ...defaultSettings(),
    favourites: [{ source: 'BLS', version: '4.0', code: 'C133000' }, { source: 'OFF', code: '8000500319475' }],
    favouriteMeals: [
      {
        id: 'm1',
        items: [
          { kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, grams: 60, preparation: 'asListed', confidence: 'A', label: 'Oats', offsetMinutes: 0 },
          { kind: 'drink', drink: 'coffee', confidence: 'A', label: 'Coffee', offsetMinutes: 0 },
        ],
      },
    ],
    logCollapsed: { saved: true },
    potGrams: 1200,
  },
  recipes: [
    { id: 'r1', schemaVersion: 1, name: 'Chili', portions: 4, ingredients: [lentils], tags: [], potGrams: 1200, createdAt: 1, updatedAt: 1 },
  ],
  batches: [
    {
      id: 'b1',
      schemaVersion: 1,
      recipeId: 'r1',
      recipe: { name: 'Chili', portions: 4, ingredients: [{ ...lentils, grams: 300 }] },
      recipeIngredients: [lentils],
      cookedGrams: 1600,
      cookedDay: '2026-10-15',
      cookedAt: 1,
      plan: { fresh: 1, fridge: 1, freezer: 2 },
      remaining: { fresh: 1, fridge: 1, freezer: 1 },
      corrections: [],
    },
  ],
  log: [
    { id: '1', schemaVersion: 1, time: 1, day: '2026-10-15', confidence: 'A', label: 'Hafer', kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, grams: 60.5, preparation: 'asListed' },
    { id: '2', schemaVersion: 1, time: 2, day: '2026-10-15', confidence: 'C', label: 'Tea', kind: 'drink', drink: 'tea' },
    { id: '3', schemaVersion: 1, time: 3, day: '2026-10-15', confidence: 'A', label: 'Giotto', kind: 'food', ref: { source: 'OFF', code: '8000500319475' }, grams: 4.3, preparation: 'asListed' },
    { id: '4', schemaVersion: 1, time: 4, day: '2026-10-15', confidence: 'C', label: 'Kimchi', kind: 'food', ref: { source: 'USDA', code: '170392' }, grams: 50, preparation: 'asListed' },
    { id: '5', schemaVersion: 1, time: 5, day: '2026-10-15', confidence: 'A', label: 'Chili', kind: 'portion', batchId: 'b1', storage: 'freezer', portions: 1, grams: 380, ingredients: [{ ...lentils, grams: 200 }] },
  ],
  customFoods: [],
  dayStatus: [{ day: '2026-10-14', status: 'fasted', schemaVersion: 1 }],
  fasts: [],
  sunEntries: [],
  products: [
    {
      id: 'OFF:8000500319475',
      schemaVersion: 1,
      source: 'OFF',
      code: '8000500319475',
      name: 'GiOTTO Haselnuss',
      brand: 'Ferrero',
      per100: { ENERCC: 632, FAT: 48, NA: 124 },
      categories: ['Snacks', 'Chocolate candies'],
      match: { version: '4.0', code: 'S610000' },
      fetchedAt: 1,
    },
    {
      id: 'USDA:170392',
      schemaVersion: 1,
      source: 'USDA',
      usdaType: 'SR Legacy',
      code: '170392',
      name: 'Cabbage, kimchi',
      serving: { label: '1 cup', grams: 150 },
      per100: { ENERCC: 15, NA: 498, VITB6: 213 },
      categories: ['Vegetables and Vegetable Products', 'Cabbage'],
      fetchedAt: 2,
    },
  ],
  journal: [{ id: 'j1', schemaVersion: 1, time: 5, day: '2026-10-15', text: 'Tired all afternoon.\nHeadache since noon.' }],
  sleep: [
    { id: 's1', schemaVersion: 1, start: 1, end: 6, day: '2026-10-15' },
    { id: 's2', schemaVersion: 1, start: 7, day: '2026-10-15' },
  ],
  activities: [
    { id: 'a1', schemaVersion: 1, kind: 'walk', time: 8, day: '2026-10-15', minutes: 40, intensity: 'easy', outside: true, sunSkin: 'faceHands' },
    { id: 'a2', schemaVersion: 1, kind: 'other', name: 'Yoga', time: 9, day: '2026-10-15', minutes: 30, outside: false },
  ],
  water: [{ id: 'w1', schemaVersion: 1, time: 10, day: '2026-10-15', ml: 500 }],
  shopping: [
    { id: 's1', schemaVersion: 1, name: 'Oat flakes', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, section: 'dry', grams: 750, amount: '1 pack', recipes: ['Porridge'], addedAt: 11 },
    { id: 's2', schemaVersion: 1, name: 'Toilet paper', section: 'other', addedAt: 12, checkedAt: 13, clearedAt: 14 },
  ],
  portionSizes: [{ food: 'C133000', sizes: [{ label: 'My bowl', grams: 60 }] }],
};

describe('exchange format', () => {
  it('round-trips a backup', () => {
    const file = buildBackup(snapshot, '0.1.0', new Date('2026-10-15T10:00:00Z'));
    const parsed = parseExchange(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.value.type === 'backup') {
      expect(parsed.value.data).toEqual(snapshot);
      expect(snapshotCounts(parsed.value.data)).toMatchObject({ log: 5, journal: 1, portionSizes: 1 });
    }
  });

  it('reads backups made before products, the journal, sleep, activities, water and the shopping list existed', () => {
    const { products: _products, journal: _journal, sleep: _sleep, activities: _activities, water: _water, shopping: _shopping, portionSizes: _sizes, ...older } = snapshot;
    const parsed = parseExchange(JSON.stringify(buildBackup({ ...older, log: snapshot.log.slice(0, 2) } as Snapshot, '0.1.0', new Date())));
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.products).toEqual([]);
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.journal).toEqual([]);
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.sleep).toEqual([]);
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.activities).toEqual([]);
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.water).toEqual([]);
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.shopping).toEqual([]);
    // Left missing, so restoring an older backup keeps the portion sizes on the phone.
    expect(parsed.ok && parsed.value.type === 'backup' && parsed.value.data.portionSizes).toBeUndefined();
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
