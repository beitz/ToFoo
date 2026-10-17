import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ToFooDB } from './db';
import { createRepo } from './repo';
import type { Recipe } from './types';

let n = 0;
const fresh = async () => {
  const repo = createRepo(new ToFooDB(`test-${n++}`));
  await repo.init('2026-10-15');
  return repo;
};

describe('repository', () => {
  it('creates profile and settings on first start', async () => {
    const repo = await fresh();
    expect((await repo.getProfile())!.modelStartDay).toBe('2026-10-15');
    expect((await repo.getSettings())!.shortWindowDays).toBe(7);
  });

  it('tracks freezer stock when portions are logged, deleted and restored', async () => {
    const repo = await fresh();
    const recipe: Recipe = await repo.saveRecipe({ name: 'Linsencurry', portions: 6, ingredients: [], tags: [] });
    const batch = await repo.cookBatch(recipe, { fresh: 1, fridge: 1, freezer: 4 }, '2026-10-15');
    const entry = await repo.addLog({ kind: 'portion', batchId: batch.id, storage: 'freezer', portions: 1, time: 1, day: '2026-10-16', confidence: 'A', label: 'Linsencurry' });
    expect((await repo.db.batches.get(batch.id))!.remaining.freezer).toBe(3);
    const removed = await repo.deleteLog(entry.id);
    expect((await repo.db.batches.get(batch.id))!.remaining.freezer).toBe(4);
    await repo.restoreLog(removed!);
    expect((await repo.db.batches.get(batch.id))!.remaining.freezer).toBe(3);
    await repo.correctBatch(batch.id, 'freezer', -1, 'givenAway');
    const b = (await repo.db.batches.get(batch.id))!;
    expect(b.remaining.freezer).toBe(2);
    expect(b.corrections).toHaveLength(1);
  });

  it('restores a snapshot', async () => {
    const a = await fresh();
    await a.updateProfile({ sex: 'female', birthYear: 1985 });
    await a.addLog({ kind: 'drink', drink: 'coffee', time: 5, day: '2026-10-15', confidence: 'A', label: 'Coffee' });
    const snap = await a.snapshot();
    const b = await fresh();
    await b.restore(snap);
    expect((await b.getProfile())!.sex).toBe('female');
    expect(await b.db.log.count()).toBe(1);
  });

  it('keeps the chosen BLS match when a product is fetched again, and backs products up', async () => {
    const repo = await fresh();
    const product = { id: 'OFF:8000500319475', source: 'OFF' as const, code: '8000500319475', name: 'GiOTTO', per100: { ENERCC: 632 }, categories: [], fetchedAt: 1 };
    await repo.saveProduct(product);
    await repo.setProductMatch(product.id, { version: '4.0', code: 'S610000' });
    await repo.saveProduct({ ...product, per100: { ENERCC: 630 }, fetchedAt: 2 });
    expect(await repo.getProduct(product.id)).toMatchObject({ per100: { ENERCC: 630 }, match: { code: 'S610000' }, schemaVersion: 1 });
    await repo.setProductMatch(product.id, null);
    expect((await repo.getProduct(product.id))!.match).toBeUndefined();
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect(await b.db.products.count()).toBe(1);
  });

  it('adds, edits, deletes and restores journal entries, and backs them up', async () => {
    const repo = await fresh();
    const e = await repo.addJournal({ time: 10, day: '2026-10-15', text: 'Headache since noon' });
    expect(e.schemaVersion).toBe(1);
    await repo.updateJournal({ ...e, text: 'Headache since noon, better after a walk' });
    expect((await repo.db.journal.get(e.id))!.text).toBe('Headache since noon, better after a walk');
    const removed = await repo.deleteJournal(e.id);
    expect(await repo.db.journal.count()).toBe(0);
    await repo.restoreJournal(removed!);
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect(await b.db.journal.where('day').equals('2026-10-15').toArray()).toEqual([removed]);
  });

  it('starts and ends a sleep, replaces overlapping sleeps on save, and backs them up', async () => {
    const repo = await fresh();
    const H = 3_600_000;
    const night = new Date(2026, 9, 15, 23, 30).getTime();
    const started = await repo.startSleep(night);
    expect(started!.day).toBe('2026-10-15');
    expect(await repo.startSleep(night + H)).toBeUndefined(); // already asleep
    const before = await repo.endSleep(night + 7.5 * H);
    expect(before).toEqual(started);
    expect((await repo.db.sleep.get(started!.id))!).toMatchObject({ end: night + 7.5 * H, day: '2026-10-16' });
    // The same night told to the assistant replaces the one from the buttons; undo brings it back.
    const { saved, replaced } = await repo.saveSleep({ start: night - 0.5 * H, end: night + 7 * H });
    expect(replaced.map((r) => r.id)).toEqual([started!.id]);
    expect(await repo.db.sleep.count()).toBe(1);
    await repo.undoSleep(saved, replaced);
    expect((await repo.db.sleep.toArray()).map((r) => r.id)).toEqual([started!.id]);
    // An afternoon nap overlaps nothing.
    await repo.saveSleep({ start: night + 15 * H, end: night + 15.5 * H });
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect(await b.db.sleep.count()).toBe(2);
  });

  it('adds, edits, deletes and restores activities, and backs them up', async () => {
    const repo = await fresh();
    const a = await repo.addActivity({ kind: 'walk', time: 10, day: '2026-10-15', minutes: 30, intensity: 'easy', outside: true, sunSkin: 'faceHands' });
    expect(a.schemaVersion).toBe(1);
    await repo.updateActivity({ ...a, minutes: 45 });
    expect((await repo.db.activities.get(a.id))!.minutes).toBe(45);
    const removed = await repo.deleteActivity(a.id);
    expect(await repo.db.activities.count()).toBe(0);
    await repo.restoreActivity(removed!);
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect(await b.db.activities.where('day').equals('2026-10-15').toArray()).toEqual([removed]);
  });

  it('adds, edits, deletes and restores water, and backs it up', async () => {
    const repo = await fresh();
    const w = await repo.addWater({ time: 10, day: '2026-10-15', ml: 250 });
    await repo.updateWater({ ...w, ml: 500 });
    const removed = await repo.deleteWater(w.id);
    expect(await repo.db.water.count()).toBe(0);
    await repo.restoreWater(removed!);
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect(await b.db.water.toArray()).toEqual([{ ...w, ml: 500 }]);
  });

  it('pins and unpins favourite foods', async () => {
    const repo = await fresh();
    const oats = { source: 'BLS', version: '4.0', code: 'C133000' } as const;
    expect(await repo.toggleFavourite(oats)).toBe(true);
    expect(await repo.toggleFavourite({ source: 'custom', id: 'x' })).toBe(true);
    expect((await repo.getSettings())!.favourites).toEqual([oats, { source: 'custom', id: 'x' }]);
    expect(await repo.toggleFavourite({ ...oats, version: '4.1' })).toBe(false);
    expect((await repo.getSettings())!.favourites).toEqual([{ source: 'custom', id: 'x' }]);
  });
});
