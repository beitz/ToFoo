import { describe, expect, it } from 'vitest';
import type { Batch, LogEntry } from '../storage/types';
import { favouriteAsMeal, favouriteFromMeal, mealSignature, pickFromMeal, recentMeals, repeatAmount, repeatMeal, withAmount } from './repeat';

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 14, 8);
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

function food(id: string, time: number, code: string, grams: number): LogEntry {
  return { id, schemaVersion: 1, kind: 'food', ref: { source: 'BLS', version: '4.0', code }, grams, preparation: 'asListed', time, day: dayOf(time), confidence: 'A', label: code };
}
function tea(id: string, time: number): LogEntry {
  return { id, schemaVersion: 1, kind: 'drink', drink: 'tea', time, day: dayOf(time), confidence: 'A', label: 'Tea' };
}
function portion(id: string, time: number, batchId: string, portions = 1): LogEntry {
  return { id, schemaVersion: 1, kind: 'portion', batchId, storage: 'freezer', portions, time, day: dayOf(time), confidence: 'A', label: 'Curry' };
}
function batch(remaining: Batch['remaining'], id = 'b1', cookedAt = 0): Batch {
  return {
    id,
    schemaVersion: 1,
    recipeId: 'r1',
    recipe: { name: 'Curry', portions: 6, ingredients: [] },
    cookedDay: '2026-10-01',
    cookedAt,
    plan: { fresh: 1, fridge: 1, freezer: 4 },
    remaining,
    corrections: [],
  };
}

describe('repeatMeal', () => {
  it('copies items so the last lands at the new time, keeping their spacing', () => {
    const meal = [food('a', T0, 'C131000', 80), tea('b', T0 + 0.5 * H)];
    const now = T0 + 48 * H;
    const { entries, skipped } = repeatMeal(meal, now, dayOf, new Map());
    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.time)).toEqual([now - 0.5 * H, now]);
    expect(entries[0]).toMatchObject({ kind: 'food', grams: 80, day: '2026-10-16' });
    expect(entries[0]).not.toHaveProperty('id');
    expect(entries[0]).not.toHaveProperty('schemaVersion');
  });

  it('takes portions from current stock and skips a batch that has run out', () => {
    const meal = [portion('a', T0, 'b1'), food('b', T0, 'C131000', 10)];
    const withStock = repeatMeal(meal, T0 + 24 * H, dayOf, new Map([['b1', batch({ fresh: 0, fridge: 1, freezer: 2 })]]));
    expect(withStock.entries[0]).toMatchObject({ kind: 'portion', storage: 'fridge' });
    const empty = repeatMeal(meal, T0 + 24 * H, dayOf, new Map([['b1', batch({ fresh: 0, fridge: 0, freezer: 0 })]]));
    expect(empty.entries).toHaveLength(1);
    expect(empty.skipped).toEqual(['Curry']);
  });

  it('does not overdraw a batch when a meal had two portion entries of it', () => {
    const meal = [portion('a', T0, 'b1'), portion('b', T0 + 1000, 'b1')];
    const { entries, skipped } = repeatMeal(meal, T0 + 24 * H, dayOf, new Map([['b1', batch({ fresh: 0, fridge: 0, freezer: 1 })]]));
    expect(entries).toHaveLength(1);
    expect(skipped).toEqual(['Curry']);
  });

  it('takes the portion from the newest batch of the same recipe when the logged batch has run out', () => {
    const batches = new Map([
      ['b1', batch({ fresh: 0, fridge: 0, freezer: 0 })],
      ['b2', batch({ fresh: 0, fridge: 0, freezer: 1 }, 'b2', 10)],
      ['b3', batch({ fresh: 0, fridge: 2, freezer: 0 }, 'b3', 20)],
    ]);
    const { entries, skipped } = repeatMeal([portion('a', T0, 'b1')], T0 + 24 * H, dayOf, batches);
    expect(skipped).toEqual([]);
    expect(entries[0]).toMatchObject({ kind: 'portion', batchId: 'b3', storage: 'fridge' });
  });
});

describe('favourite meals', () => {
  it('keep items and spacing, and repeat like the meal they were pinned from', () => {
    const meal = [tea('b', T0 + 0.5 * H), food('a', T0, 'C131000', 80)];
    const fav = favouriteFromMeal(meal, 'f1');
    expect(fav.items.map((i) => [i.kind, i.offsetMinutes])).toEqual([
      ['food', 30],
      ['drink', 0],
    ]);
    expect(fav.items[0]).not.toHaveProperty('time');
    expect(fav.items[0]).not.toHaveProperty('day');
    expect(fav.items[0]).not.toHaveProperty('id');
    const now = T0 + 72 * H;
    const again = repeatMeal(favouriteAsMeal(fav), now, dayOf, new Map());
    expect(again.entries).toEqual(repeatMeal(meal, now, dayOf, new Map()).entries);
    expect(mealSignature(favouriteAsMeal(fav), new Map())).toBe(mealSignature(meal, new Map()));
  });
});

describe('recentMeals', () => {
  it('returns distinct meals with several items, newest first', () => {
    const log = [
      food('a', T0, 'C131000', 80),
      food('b', T0 + 1000, 'M111000', 200),
      food('c', T0 + 24 * H, 'C131000', 80),
      food('d', T0 + 24 * H + 1000, 'M111000', 200),
      food('e', T0 + 30 * H, 'X000000', 50),
      food('f', T0 + 48 * H, 'C131000', 60),
      food('g', T0 + 48 * H + 1000, 'M111000', 200),
    ];
    const meals = recentMeals(log, 120, new Map());
    expect(meals.map((m) => m.map((e) => e.id))).toEqual([
      ['f', 'g'],
      ['c', 'd'],
    ]);
  });
});

describe('logging part of a meal again', () => {
  const weighed = (remaining: Batch['remaining']): Batch => ({ ...batch(remaining), cookedGrams: 2400 });
  const byWeight = (grams: number, portions = 1): LogEntry => ({ ...portion('s', T0, 'b1', portions), grams }) as LogEntry;

  it('keeps only the picked items, with their new amounts, the last picked one at the new time', () => {
    const meal = [food('roast', T0, 'U000000', 300), food('soup', T0 + 0.25 * H, 'S000000', 350), tea('t', T0 + 0.5 * H)];
    const picked = pickFromMeal(meal, new Map([['soup', 250]]), new Map());
    expect(picked.map((e) => [e.id, e.kind === 'food' && e.grams])).toEqual([['soup', 250]]);
    const now = T0 + 72 * H;
    const { entries } = repeatMeal(picked, now, dayOf, new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'food', grams: 250, time: now });
  });

  it('leaves an amount as it was when none is given, and keeps the spacing of the picked items', () => {
    const meal = [food('soup', T0, 'S000000', 350), food('bread', T0 + 1000, 'B000000', 60), tea('t', T0 + 0.5 * H)];
    const picked = pickFromMeal(meal, new Map([['soup', undefined], ['t', undefined]]), new Map());
    expect(picked).toEqual([meal[0], meal[2]]);
    const now = T0 + 72 * H;
    expect(repeatMeal(picked, now, dayOf, new Map()).entries.map((e) => e.time)).toEqual([now - 0.5 * H, now]);
  });

  it('changes pieces with their grams, and portions or grams of a pot in their own unit', () => {
    const gum: LogEntry = { ...food('g', T0, 'X', 2.8), pieces: 2 } as LogEntry;
    expect(repeatAmount(gum)).toEqual({ value: 2, unit: 'pieces' });
    expect(withAmount(gum, 3, new Map())).toMatchObject({ pieces: 3, grams: 4.2 });
    expect(repeatAmount(portion('p', T0, 'b1', 2))).toEqual({ value: 2, unit: 'portions' });
    expect(withAmount(portion('p', T0, 'b1', 2), 1, new Map())).toMatchObject({ portions: 1 });
    // A pot of 2400 g in 6 portions: 800 g is two portions taken from stock.
    const b = weighed({ fresh: 0, fridge: 3, freezer: 0 });
    expect(repeatAmount(byWeight(400))).toEqual({ value: 400, unit: 'g' });
    expect(withAmount(byWeight(400), 800, new Map([['b1', b]]))).toMatchObject({ grams: 800, portions: 2 });
    // Eaten straight from the pot, taking no portion: still none.
    expect(withAmount(byWeight(400, 0), 800, new Map([['b1', b]]))).toMatchObject({ grams: 800, portions: 0 });
    expect(repeatAmount(tea('t', T0))).toBeUndefined();
    expect(withAmount(food('f', T0, 'X', 100), 0, new Map())).toMatchObject({ grams: 100 });
  });

  it('takes the picked leftovers from the pot in stock', () => {
    const b = weighed({ fresh: 0, fridge: 2, freezer: 0 });
    const batches = new Map([['b1', b]]);
    const meal = [food('roast', T0, 'U000000', 300), byWeight(400)];
    const { entries, skipped } = repeatMeal(pickFromMeal(meal, new Map([['s', 400]]), batches), T0 + 72 * H, dayOf, batches);
    expect(skipped).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'portion', batchId: 'b1', storage: 'fridge', grams: 400, portions: 1 });
  });
});
