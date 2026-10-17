import { describe, expect, it } from 'vitest';
import type { CustomFood, FoodRef, LogEntry } from '../storage/types';
import { canReplaceFood, completeDraft, gramsBefore, replaceFood } from './editEntry';

const base = { id: 'e1', schemaVersion: 1, time: Date.UTC(2026, 9, 16, 18), day: '2026-10-16', confidence: 'B' as const };
const dish: Extract<LogEntry, { kind: 'food' }> = { ...base, kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'X123000' }, grams: 350, preparation: 'baked', label: 'Lasagne' };
const manual: LogEntry = { ...base, kind: 'manual', nutrients: { ENERCC: 500 }, isSupplement: false, label: 'Pasta salad' };
const custom: LogEntry = { ...base, kind: 'custom', customFoodId: 'c1', servings: 2, label: 'Protein bar' };
const portion: LogEntry = { ...base, kind: 'portion', batchId: 'b1', storage: 'freezer', portions: 1, label: 'Curry' };
const tea: LogEntry = { ...base, kind: 'drink', drink: 'tea', label: 'Tea' };
const bar: CustomFood = { id: 'c1', schemaVersion: 1, name: 'Protein bar', isSupplement: false, servingLabel: '1 bar', servingGrams: 45, nutrients: {}, confidence: 'A', createdAt: 0 };
const customFoods = new Map([[bar.id, bar]]);
const product: FoodRef = { source: 'OFF', code: '4001234567890' };

describe('canReplaceFood', () => {
  it('allows foods, saved items and manual entries, not recipe portions or drinks', () => {
    expect([dish, manual, custom, portion, tea].map(canReplaceFood)).toEqual([true, true, true, false, false]);
  });
});

describe('gramsBefore', () => {
  it('keeps the grams of a food, converts saved-item servings, and has none for a manual entry', () => {
    expect(gramsBefore(dish, customFoods)).toBe(350);
    expect(gramsBefore(custom, customFoods)).toBe(90);
    expect(gramsBefore(custom, new Map())).toBeUndefined();
    expect(gramsBefore(manual, customFoods)).toBeUndefined();
  });
});

describe('replaceFood', () => {
  it('swaps the food but keeps id, time, day, confidence, amount and preparation', () => {
    const next = replaceFood(dish, product, 'Frozen lasagne (Brand)', customFoods);
    expect(next).toEqual({ ...base, kind: 'food', ref: product, label: 'Frozen lasagne (Brand)', grams: 350, preparation: 'baked' });
  });

  it('turns a manual entry into a food entry whose amount still has to be entered', () => {
    const next = replaceFood(manual, product, 'Pasta salad (Brand)', customFoods);
    expect(next).toMatchObject({ id: 'e1', kind: 'food', grams: undefined, preparation: 'asListed' });
    expect(next).not.toHaveProperty('nutrients');
    expect(completeDraft(next)).toBeNull();
    expect(completeDraft({ ...next, grams: 200 })).toMatchObject({ kind: 'food', grams: 200 });
  });

  it('leaves no fields of the old kind behind', () => {
    const next = replaceFood(custom, product, 'Bar', customFoods);
    expect(next).not.toHaveProperty('customFoodId');
    expect(next).not.toHaveProperty('servings');
    expect(next.grams).toBe(90);
  });
});

describe('completeDraft', () => {
  it('passes other entries through and rejects a zero amount', () => {
    expect(completeDraft(portion)).toBe(portion);
    expect(completeDraft({ ...dish, grams: 0 })).toBeNull();
  });
});
