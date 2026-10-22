import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ToFooDB } from './db';
import { createRepo } from './repo';
import { planAdd, planClear } from '../logic/shopping';
import { leftOf, planStock, usageOf } from '../logic/pantry';
import type { FavouriteMeal, Recipe } from './types';

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

  it('cooks a pot that differs from the recipe, weighs it, remembers the empty pot, and undoes a change', async () => {
    const repo = await fresh();
    const beef = { ref: { source: 'BLS' as const, version: '4.0', code: 'U010000' }, name: 'Beef', grams: 600, preparation: 'boiled' as const };
    const tofu = { ...beef, ref: { source: 'BLS' as const, version: '4.0', code: 'H910000' }, name: 'Tofu' };
    const recipe = await repo.saveRecipe({ name: 'Chili', portions: 4, ingredients: [beef], tags: [] });
    const batch = await repo.cookBatch(recipe, { fresh: 1, fridge: 1, freezer: 2 }, '2026-10-15', undefined, { ingredients: [tofu], cookedGrams: 1950, emptyPotGrams: 1200 });
    expect([batch.recipe.ingredients, batch.recipeIngredients, batch.cookedGrams]).toEqual([[tofu], [beef], 1950]);
    expect((await repo.db.recipes.get(recipe.id))!.potGrams).toBe(1200);
    expect((await repo.getSettings())!.potGrams).toBe(1200);
    expect((await repo.db.recipes.get(recipe.id))!.ingredients).toEqual([beef]);
    const old = await repo.updateBatchPot(batch.id, { ingredients: [beef], cookedGrams: 2000 });
    const now = (await repo.db.batches.get(batch.id))!;
    expect([now.recipeIngredients, now.cookedGrams]).toEqual([undefined, 2000]);
    await repo.restoreBatch(old!);
    expect((await repo.db.batches.get(batch.id))!.recipe.ingredients).toEqual([tofu]);
    // A serving by weight takes the portions it says from stock, possibly none.
    await repo.addLog({ kind: 'portion', batchId: batch.id, storage: 'fresh', portions: 0, grams: 150, time: 1, day: '2026-10-15', confidence: 'A', label: 'Chili' });
    expect((await repo.db.batches.get(batch.id))!.remaining.fresh).toBe(1);
  });

  it('cooks a pot into its own number of portions and changes them later, the recipe untouched', async () => {
    const repo = await fresh();
    const celeriac = { ref: { source: 'BLS' as const, version: '4.0', code: 'G580000' }, name: 'Celeriac', grams: 500, preparation: 'boiled' as const };
    const recipe = await repo.saveRecipe({ name: 'Celeriac soup', portions: 4, ingredients: [celeriac], tags: [] });
    const batch = await repo.cookBatch(recipe, { fresh: 1, fridge: 1, freezer: 3 }, '2026-10-22', undefined, { ingredients: [{ ...celeriac, grams: 666 }], portions: 5 });
    expect([batch.recipe.portions, batch.remaining.freezer, batch.recipeIngredients]).toEqual([5, 3, [celeriac]]);
    const old = await repo.updateBatchPot(batch.id, { ingredients: batch.recipe.ingredients, portions: 6 });
    const now = (await repo.db.batches.get(batch.id))!;
    expect([now.recipe.portions, now.plan.freezer, now.remaining.freezer]).toEqual([6, 4, 4]);
    expect(old!.recipe.portions).toBe(5);
    expect((await repo.db.recipes.get(recipe.id))!.portions).toBe(4);
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
    await repo.setProductMatch(product.id, { match: { version: '4.0', code: 'S610000' } });
    await repo.saveProduct({ ...product, per100: { ENERCC: 630 }, fetchedAt: 2 });
    expect(await repo.getProduct(product.id)).toMatchObject({ per100: { ENERCC: 630 }, match: { code: 'S610000' }, schemaVersion: 1 });
    await repo.setProductMatch(product.id, {});
    expect((await repo.getProduct(product.id))!.match).toBeUndefined();
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect(await b.db.products.count()).toBe(1);
  });

  it('keeps "label only" and the app\'s own picks through refreshes and backups', async () => {
    const repo = await fresh();
    const giotto = { id: 'OFF:1', source: 'OFF' as const, code: '1', name: 'GiOTTO', per100: { ENERCC: 632 }, categories: [], fetchedAt: 1 };
    const goldbaeren = { ...giotto, id: 'OFF:2', code: '2', name: 'Goldbären' };
    await repo.saveProduct(giotto);
    await repo.saveProduct(goldbaeren);
    await repo.setProductMatch(goldbaeren.id, { labelOnly: true });
    // The app pairs only products with neither a match nor "label only".
    expect(await repo.setAutoMatches([giotto, goldbaeren].map((p) => ({ id: p.id, match: { version: '4.0', code: 'S610000' } })))).toBe(1);
    expect((await repo.getProduct(giotto.id))!.match).toEqual({ version: '4.0', code: 'S610000', auto: true });
    await repo.saveProduct({ ...goldbaeren, fetchedAt: 2 });
    expect(await repo.getProduct(goldbaeren.id)).toMatchObject({ labelOnly: true, fetchedAt: 2 });
    // A chosen food replaces "label only".
    await repo.saveProduct({ ...goldbaeren, match: { version: '4.0', code: 'S361000' } });
    expect((await repo.getProduct(goldbaeren.id))!.labelOnly).toBeUndefined();
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect((await b.getProduct(giotto.id))!.match).toEqual({ version: '4.0', code: 'S610000', auto: true });
    await b.setProductMatch(goldbaeren.id, { labelOnly: true });
    const c = await fresh();
    await c.restore(await b.snapshot());
    expect((await c.getProduct(goldbaeren.id))!.labelOnly).toBe(true);
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

  it('pins favourite meals, puts a removed one back in place, and keeps them in backups', async () => {
    const repo = await fresh();
    const meal = (id: string): FavouriteMeal => ({ id, items: [{ kind: 'drink', drink: 'tea', confidence: 'A', label: 'Tea', offsetMinutes: 0 }] });
    await repo.addFavouriteMeal(meal('a'));
    await repo.addFavouriteMeal(meal('b'));
    await repo.addFavouriteMeal(meal('c'));
    await repo.removeFavouriteMeal('b');
    await repo.addFavouriteMeal(meal('b'), 1);
    expect((await repo.getSettings())!.favouriteMeals!.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    const b = await fresh();
    await b.restore(await repo.snapshot());
    expect((await b.getSettings())!.favouriteMeals).toEqual([meal('a'), meal('b'), meal('c')]);
  });

  it('keeps saved chats out of backups, and deletes them with their photos and recordings (undoable)', async () => {
    const repo = await fresh();
    const chat = { id: 'c1', schemaVersion: 1, kind: 'log' as const, startedAt: 1, updatedAt: 2, model: 'm', title: 'lunch', features: {}, messages: [], events: [], photos: 2, audio: 1, tokens: {} };
    const photos = [1, 2].map((n) => ({ id: `c1:${n}`, chatId: 'c1', n, mediaType: 'image/jpeg', data: 'AAAA' }));
    const audio = [{ id: 'c1:a1', chatId: 'c1', n: 1, mediaType: 'audio/webm', ms: 4000, data: new Uint8Array([1, 2, 3]).buffer }];
    await repo.saveChat(chat, photos, audio);
    await repo.saveChat({ ...chat, id: 'c2' }, [{ ...photos[0]!, id: 'c2:1', chatId: 'c2' }]);
    expect((await repo.chatPhotos('c1')).map((p) => p.n)).toEqual([1, 2]);
    expect((await repo.chatAudio('c1')).map((a) => [a.n, a.ms, a.data.byteLength])).toEqual([[1, 4000, 3]]);
    expect((await repo.chatMediaSizes()).get('c1')).toBe(11);
    expect(JSON.stringify(await repo.snapshot())).not.toContain('lunch');
    const old = await repo.deleteChats(['c1']);
    expect(await repo.db.chats.count()).toBe(1);
    expect(await repo.db.chatPhotos.count()).toBe(1);
    expect(await repo.db.chatAudio.count()).toBe(0);
    await repo.restoreChats(old);
    expect(await repo.chatPhotos('c1')).toHaveLength(2);
    expect(await repo.chatAudio('c1')).toHaveLength(1);
  });

  it('adds to the shopping list, clears it after shopping, undoes both, and backs it up', async () => {
    const repo = await fresh();
    let k = 0;
    const ids = () => `s${++k}`;
    const added = await repo.changeShopping((items) => planAdd(items, [{ name: 'Milk', section: 'dairy', amount: '1 l' }, { name: 'Bread', section: 'bakery' }], 1, ids, 1));
    expect(added.created).toEqual(['s1', 's2']);
    const more = await repo.changeShopping((items) => planAdd(items, [{ name: 'milk', section: 'dairy', amount: '1 l' }], 2, ids, 1));
    expect(await repo.db.shopping.get('s1')).toMatchObject({ amount: '2 l' });
    await repo.undoShopping(more);
    expect(await repo.db.shopping.get('s1')).toMatchObject({ amount: '1 l' });

    await repo.db.shopping.update('s1', { checkedAt: 3 });
    const cleared = await repo.changeShopping((items) => planClear(items, 4));
    expect(await repo.db.shopping.get('s1')).toMatchObject({ clearedAt: 4 });
    expect((await repo.snapshot()).shopping).toHaveLength(2);
    await repo.undoShopping(cleared);
    expect((await repo.db.shopping.get('s1'))!.clearedAt).toBeUndefined();
    await repo.undoShopping(added);
    expect(await repo.db.shopping.count()).toBe(0);
  });

  it('puts things away at home with the shopping list in one go, undoes both, and backs it up', async () => {
    const repo = await fresh();
    let k = 0;
    const ids = () => `h${++k}`;
    await repo.changeShopping((items) => planAdd(items, [{ name: 'Cumin', section: 'pantry' }], 1, () => 's1', 1));
    const left = (i: Parameters<typeof leftOf>[0]) => leftOf(i, usageOf([], []));
    const undo = await repo.changeHome((pantry, shopping) => ({
      pantry: planStock(pantry, [{ name: 'Cumin', place: 'spices' }, { name: 'Lasagne', place: 'freezer', pieces: 2 }], 2, ids, 1, left),
      shopping: planClear(shopping.map((s) => ({ ...s, checkedAt: 2 })), 2),
    }));
    expect(undo.pantry.created).toEqual(['h1', 'h2']);
    expect(await repo.db.shopping.get('s1')).toMatchObject({ clearedAt: 2 });
    expect((await repo.snapshot()).pantry.map((i) => i.name)).toEqual(['Cumin', 'Lasagne']);
    await repo.undoHome(undo);
    expect(await repo.db.pantry.count()).toBe(0);
    expect((await repo.db.shopping.get('s1'))!.clearedAt).toBeUndefined();
  });
});
