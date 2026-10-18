import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ToFooDB } from './db';
import { createRepo } from './repo';
import { CURRENT_SCHEMA_VERSION } from './types';

// A phone that last ran the first release: database version 1, before products, journal, sleep,
// activities, water and saved chats existed. Opening it with today's app must keep every record.
async function firstReleaseDb(name: string) {
  const old = new Dexie(name);
  old.version(1).stores({
    profile: 'id',
    settings: 'id',
    recipes: 'id, name, updatedAt',
    batches: 'id, recipeId, cookedDay',
    log: 'id, time, day, kind',
    customFoods: 'id, name',
    dayStatus: 'day',
    fasts: 'id, startDay',
    sunEntries: 'id, day',
    meta: 'key',
  });
  await old.open();
  await old.table('profile').put({ id: 'profile', schemaVersion: 1, weightHistory: [{ day: '2026-10-01', kg: 80 }], salt: { iodised: true, fluoridated: false }, exclusions: { groups: [], foods: [] }, startingLevel: 'empty', modelStartDay: '2026-10-01', onboarded: true, sex: 'male' });
  await old.table('log').bulkPut([
    { id: 'l1', schemaVersion: 1, time: 1, day: '2026-10-01', confidence: 'A', label: 'Oats', kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, grams: 60, preparation: 'asListed' },
    // Pre-release record without a schema version: upgraded, values kept.
    { id: 'l2', time: 2, day: '2026-10-01', label: 'Tea', kind: 'drink', drink: 'tea' },
  ]);
  await old.table('recipes').put({ id: 'r1', schemaVersion: 1, name: 'Linsencurry', portions: 6, ingredients: [], tags: ['lunch'], createdAt: 1, updatedAt: 1 });
  await old.table('meta').put({ key: 'portions:C133000', value: [{ label: 'My bowl', grams: 60 }] });
  old.close();
}

describe('opening data from an older app version', () => {
  it('keeps every record and only fills in what old records lack', async () => {
    await firstReleaseDb('upgrade-1');
    const repo = createRepo(new ToFooDB('upgrade-1'));
    await repo.init('2026-10-18');

    expect(await repo.getProfile()).toMatchObject({ sex: 'male', weightHistory: [{ day: '2026-10-01', kg: 80 }], modelStartDay: '2026-10-01', onboarded: true });
    const log = await repo.db.log.orderBy('time').toArray();
    expect(log[0]).toEqual({ id: 'l1', schemaVersion: 1, time: 1, day: '2026-10-01', confidence: 'A', label: 'Oats', kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'C133000' }, grams: 60, preparation: 'asListed' });
    expect(log[1]).toEqual({ id: 'l2', schemaVersion: CURRENT_SCHEMA_VERSION, time: 2, day: '2026-10-01', confidence: 'B', label: 'Tea', kind: 'drink', drink: 'tea' });
    expect((await repo.db.recipes.get('r1'))!.tags).toEqual(['lunch']);
    expect(await repo.getMeta('portions:C133000')).toEqual([{ label: 'My bowl', grams: 60 }]);
    // Tables added since then exist and are empty.
    expect(await repo.db.journal.count()).toBe(0);
    expect(await repo.db.water.count()).toBe(0);
  });

  it('does not rewrite current records when the app starts', async () => {
    await firstReleaseDb('upgrade-2');
    const first = createRepo(new ToFooDB('upgrade-2'));
    await first.init('2026-10-18');
    const before = await first.snapshot();
    first.db.close();

    const again = createRepo(new ToFooDB('upgrade-2'));
    await again.init('2026-10-19');
    expect(await again.snapshot()).toEqual(before);
  });
});
