import { describe, expect, it } from 'vitest';
import type { Batch, LogEntry } from '../storage/types';
import { recentMeals, repeatMeal } from './repeat';

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
function batch(remaining: Batch['remaining']): Batch {
  return {
    id: 'b1',
    schemaVersion: 1,
    recipeId: 'r1',
    recipe: { name: 'Curry', portions: 6, ingredients: [] },
    cookedDay: '2026-10-01',
    cookedAt: 0,
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
