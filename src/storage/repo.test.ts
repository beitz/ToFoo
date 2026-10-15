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
});
