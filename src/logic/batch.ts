/**
 * Batch cooking (docs/SPEC.md, "Cooked weight per batch" and "Changing a dish when logging it"):
 * the cooked pot's weight, portions eaten by grams, and ingredients changed for one pot or one
 * serving. Pure, tested in batch.test.ts.
 */
import { refKey } from '../lib/refs';
import type { Batch, Ingredient } from '../storage/types';

/** Sanity limit for a cooked pot, not a physiological number: above it a unit slip (kg typed as g) is more likely. */
export const MAX_POT_GRAMS = 30000;

/** The cooked food's weight: the full pot minus the empty pot; undefined unless that is a plausible weight. */
export function cookedWeight(fullPot: number | undefined, emptyPot: number | undefined): number | undefined {
  if (fullPot === undefined || !(fullPot > 0)) return undefined;
  const food = fullPot - (emptyPot ?? 0);
  return food > 0 && food <= MAX_POT_GRAMS ? Math.round(food) : undefined;
}

type BatchWeight = Pick<Batch, 'cookedGrams'> & { recipe: Pick<Batch['recipe'], 'portions' | 'ingredients'> };

/** Grams in one portion of a weighed pot (the pot split evenly); undefined when it was not weighed. */
export function portionGrams(b: BatchWeight): number | undefined {
  return b.cookedGrams && b.recipe.portions > 0 ? b.cookedGrams / b.recipe.portions : undefined;
}

/** The share of the whole pot one entry ate: by grams of a weighed pot, else by portions. */
export function potShare(e: { portions: number; grams?: number }, b: BatchWeight): number {
  if (e.grams !== undefined && e.grams > 0 && b.cookedGrams) return e.grams / b.cookedGrams;
  return b.recipe.portions > 0 ? e.portions / b.recipe.portions : 0;
}

/**
 * Portions a serving by weight takes from stock: the nearest whole number of the pot's average
 * portion, at least one (a weighed serving usually is one box or bowl). The user can change it.
 */
export function stockPortionsFor(grams: number, b: BatchWeight): number {
  const per = portionGrams(b);
  if (!per || !(grams > 0)) return 1;
  return Math.max(1, Math.round(grams / per));
}

/** What a serving was made of: its own changed ingredients, else the pot's. */
export function servingIngredients(e: { ingredients?: Ingredient[] }, b: Pick<Batch, 'recipe'>): Ingredient[] {
  return e.ingredients ?? b.recipe.ingredients;
}

const sameIngredient = (a: Ingredient, b: Ingredient) => refKey(a.ref) === refKey(b.ref) && a.grams === b.grams && a.preparation === b.preparation;

/** True if two ingredient lists are the same foods, amounts and preparations (order aside). */
export function sameIngredients(a: readonly Ingredient[], b: readonly Ingredient[]): boolean {
  if (a.length !== b.length) return false;
  const rest = [...b];
  for (const x of a) {
    const i = rest.findIndex((y) => sameIngredient(x, y));
    if (i < 0) return false;
    rest.splice(i, 1);
  }
  return true;
}

/** How one ingredient differs from the original list. */
export type IngredientMark = { kind: 'same' } | { kind: 'new' } | { kind: 'changed'; wasGrams?: number; wasPreparation?: Ingredient['preparation'] };

/**
 * Marks for a changed list against the original: per ingredient whether it is new or changed
 * (with the old amount or preparation), and the original ingredients that were taken out.
 * Ingredients are matched by food, in order, so two lines of one food pair up one by one.
 */
export function compareIngredients(original: readonly Ingredient[], changed: readonly Ingredient[]): { marks: IngredientMark[]; removed: Ingredient[] } {
  const left = [...original];
  const marks = changed.map((ing): IngredientMark => {
    const i = left.findIndex((o) => refKey(o.ref) === refKey(ing.ref));
    if (i < 0) return { kind: 'new' };
    const [o] = left.splice(i, 1);
    if (o!.grams === ing.grams && o!.preparation === ing.preparation) return { kind: 'same' };
    return { kind: 'changed', ...(o!.grams !== ing.grams ? { wasGrams: o!.grams } : {}), ...(o!.preparation !== ing.preparation ? { wasPreparation: o!.preparation } : {}) };
  });
  return { marks, removed: left };
}

/** The same ingredients with every amount multiplied (whole pot ↔ one serving). */
export function scaleIngredients(list: readonly Ingredient[], factor: number): Ingredient[] {
  return list.map((i) => ({ ...i, grams: i.grams * factor }));
}

/** One change to a serving or a pot: replace or re-weigh an ingredient (`replaces` set), take one out (`ingredient` missing) or add one. */
export interface IngredientChange {
  /** refKey of the ingredient it replaces, re-weighs or takes out; absent for an added one. */
  replaces?: string;
  /** The new ingredient, in the amount of the serving (or pot) it is for; absent to take `replaces` out. */
  ingredient?: Ingredient;
}

/**
 * Apply changes to a list of whole-pot ingredients. `share` is the part of the pot the changes'
 * amounts are for (one serving's share, or 1 for the whole pot), so "150 g tofu in my bowl"
 * becomes the matching amount for the pot. Returns undefined if a change names an ingredient the
 * list does not have.
 */
export function applyChanges(list: readonly Ingredient[], changes: readonly IngredientChange[], share: number): Ingredient[] | undefined {
  if (!(share > 0)) return undefined;
  const out = [...list];
  for (const c of changes) {
    const toPot = c.ingredient ? { ...c.ingredient, grams: Math.round((c.ingredient.grams / share) * 10) / 10 } : undefined;
    if (c.replaces === undefined) {
      if (toPot) out.push(toPot);
      continue;
    }
    const i = out.findIndex((o) => refKey(o.ref) === c.replaces);
    if (i < 0) return undefined;
    if (toPot) out[i] = toPot;
    else out.splice(i, 1);
  }
  return out;
}

/** What the user knows about one pot: what went in, if weighed the cooked food's weight, and the portions it made. */
export interface PotDetails {
  ingredients: Ingredient[];
  cookedGrams?: number;
  /** Portions this pot was shared into, when not the recipe's number. */
  portions?: number;
}

/** Sanity limit for portions from one pot, not a physiological number: above it a typing slip is more likely. */
export const MAX_POT_PORTIONS = 100;

type Split = Batch['plan'];

/** Add portions to the freezer, or take them away freezer first, then fridge, then fresh (never below zero). */
function shiftSplit(split: Split, delta: number): Split {
  if (delta >= 0) return { ...split, freezer: split.freezer + delta };
  const out = { ...split };
  let take = -delta;
  for (const k of ['freezer', 'fridge', 'fresh'] as const) {
    const n = Math.min(out[k], take);
    out[k] -= n;
    take -= n;
  }
  return out;
}

/**
 * The same pot shared into another number of portions (a bigger celeriac made five boxes, not
 * four). The ingredients stay as they are, so each portion gets smaller or bigger, also portions
 * already eaten by count. Extra portions go to the freezer, which is "the rest" in every plan;
 * fewer come off the freezer first, then the fridge, then fresh, in the plan and in what is left.
 */
export function withPortions(b: Batch, portions: number): Batch {
  const n = Math.round(portions);
  if (!(n >= 1) || n > MAX_POT_PORTIONS || n === b.recipe.portions) return b;
  const delta = n - b.recipe.portions;
  return { ...b, recipe: { ...b.recipe, portions: n }, plan: shiftSplit(b.plan, delta), remaining: shiftSplit(b.remaining, delta) };
}

/**
 * A batch with its pot's ingredients, weight and (when given) portions. The recipe's own list is kept beside the pot's
 * only while they differ, so the batch can show what this pot had instead.
 */
export function withPot(b: Batch, pot: PotDetails): Batch {
  const original = b.recipeIngredients ?? b.recipe.ingredients;
  const { recipeIngredients: _was, cookedGrams: _weight, ...rest } = b;
  const potted: Batch = {
    ...rest,
    recipe: { ...b.recipe, ingredients: pot.ingredients.map((i) => ({ ...i })) },
    ...(sameIngredients(original, pot.ingredients) ? {} : { recipeIngredients: original }),
    ...(pot.cookedGrams && pot.cookedGrams > 0 ? { cookedGrams: Math.round(pot.cookedGrams) } : {}),
  };
  return pot.portions === undefined ? potted : withPortions(potted, pot.portions);
}
