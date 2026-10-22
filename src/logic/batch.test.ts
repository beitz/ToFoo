import { describe, expect, it } from 'vitest';
import type { Batch, Ingredient } from '../storage/types';
import { applyChanges, compareIngredients, cookedWeight, potShare, sameIngredients, stockPortionsFor, withPortions, withPot } from './batch';

const ing = (code: string, grams: number, preparation: Ingredient['preparation'] = 'boiled'): Ingredient => ({ ref: { source: 'BLS', version: '4.0', code }, name: code, grams, preparation });
const beef = ing('U010000', 600);
const lentils = ing('H700000', 400);
const tofu = ing('H910000', 450);

const batch: Batch = {
  id: 'b1',
  schemaVersion: 1,
  recipeId: 'r1',
  recipe: { name: 'Chili', portions: 3, ingredients: [beef, lentils] },
  cookedDay: '2026-10-01',
  cookedAt: 0,
  plan: { fresh: 1, fridge: 1, freezer: 1 },
  remaining: { fresh: 1, fridge: 1, freezer: 1 },
  corrections: [],
};

describe('batch cooking', () => {
  it('takes the empty pot off the full one, and rejects weights that cannot be right', () => {
    expect(cookedWeight(3150, 1200)).toBe(1950);
    expect(cookedWeight(1950, undefined)).toBe(1950);
    expect(cookedWeight(1000, 1200)).toBeUndefined();
    expect(cookedWeight(undefined, 1200)).toBeUndefined();
    expect(cookedWeight(45000, 0)).toBeUndefined();
  });

  it('counts a serving by grams of a weighed pot, else by portions', () => {
    expect(potShare({ portions: 1 }, batch)).toBeCloseTo(1 / 3);
    expect(potShare({ portions: 1, grams: 350 }, batch)).toBeCloseTo(1 / 3); // not weighed: grams are ignored
    expect(potShare({ portions: 1, grams: 350 }, { ...batch, cookedGrams: 1400 })).toBeCloseTo(0.25);
    expect(potShare({ portions: 0, grams: 700 }, { ...batch, cookedGrams: 1400 })).toBeCloseTo(0.5);
  });

  it('takes the nearest whole number of portions from stock for a weighed serving, at least one', () => {
    const weighed = { ...batch, cookedGrams: 1200 }; // 400 g per portion
    expect(stockPortionsFor(350, weighed)).toBe(1);
    expect(stockPortionsFor(820, weighed)).toBe(2);
    expect(stockPortionsFor(90, weighed)).toBe(1);
    expect(stockPortionsFor(350, batch)).toBe(1);
  });

  it('compares lists by food, amount and preparation', () => {
    expect(sameIngredients([beef, lentils], [lentils, beef])).toBe(true);
    expect(sameIngredients([beef, lentils], [lentils, { ...beef, grams: 500 }])).toBe(false);
    const { marks, removed } = compareIngredients([beef, lentils], [{ ...lentils, grams: 300 }, tofu, { ...lentils, preparation: 'steamed' }]);
    expect(marks).toEqual([{ kind: 'changed', wasGrams: 400 }, { kind: 'new' }, { kind: 'new' }]);
    expect(removed).toEqual([beef]);
    expect(compareIngredients([beef], [{ ...beef, preparation: 'fried' }]).marks).toEqual([{ kind: 'changed', wasPreparation: 'boiled' }]);
  });

  it('turns a serving\'s swap into amounts for the whole pot', () => {
    // One portion of three: 150 g tofu instead of the portion's 200 g beef, and 20 g cheese on top.
    const cheese = ing('M800000', 20, 'asListed');
    const out = applyChanges([beef, lentils], [{ replaces: 'BLS:U010000', ingredient: ing('H910000', 150) }, { ingredient: cheese }], 1 / 3)!;
    expect(out.map((i) => [i.ref.source === 'BLS' && i.ref.code, i.grams])).toEqual([
      ['H910000', 450],
      ['H700000', 400],
      ['M800000', 60],
    ]);
    expect(applyChanges([beef, lentils], [{ replaces: 'BLS:H700000' }], 1)).toEqual([beef]);
    expect(applyChanges([beef], [{ replaces: 'BLS:X000000' }], 1)).toBeUndefined();
  });

  it('keeps the recipe\'s list beside a pot only while the pot differs', () => {
    const changed = withPot(batch, { ingredients: [tofu, lentils], cookedGrams: 1950.4 });
    expect(changed.recipe.ingredients).toEqual([tofu, lentils]);
    expect(changed.recipeIngredients).toEqual([beef, lentils]);
    expect(changed.cookedGrams).toBe(1950);
    const back = withPot(changed, { ingredients: [beef, lentils] });
    expect(back.recipeIngredients).toBeUndefined();
    expect(back.cookedGrams).toBeUndefined();
    expect(back.recipe.ingredients).toEqual([beef, lentils]);
  });

  it('shares a pot into more or fewer portions: extra go to the freezer, fewer come off freezer, fridge, then fresh', () => {
    const more = withPortions(batch, 5);
    expect([more.recipe.portions, more.plan, more.remaining]).toEqual([5, { fresh: 1, fridge: 1, freezer: 3 }, { fresh: 1, fridge: 1, freezer: 3 }]);
    expect(more.recipe.ingredients).toEqual(batch.recipe.ingredients);
    const eaten = { ...batch, remaining: { fresh: 0, fridge: 1, freezer: 1 } };
    const fewer = withPortions(eaten, 1);
    expect([fewer.plan, fewer.remaining]).toEqual([{ fresh: 1, fridge: 0, freezer: 0 }, { fresh: 0, fridge: 0, freezer: 0 }]);
    // A portion eaten by count is now a share of the bigger pot.
    expect(potShare({ portions: 1 }, more)).toBeCloseTo(1 / 5);
    expect(withPortions(batch, 0)).toBe(batch);
    expect(withPortions(batch, 3)).toBe(batch);
    expect(withPortions(batch, 500)).toBe(batch);
  });

  it('changes a pot\'s portions together with its ingredients', () => {
    const b = withPot(batch, { ingredients: [beef, tofu], portions: 4 });
    expect([b.recipe.portions, b.remaining.freezer, b.recipeIngredients]).toEqual([4, 2, [beef, lentils]]);
  });
});
