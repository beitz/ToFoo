/**
 * Where one nutrient of a recipe portion or a meal comes from (docs/SPEC.md, "Which part gives
 * what"): each ingredient's or item's amount and its share of the whole, biggest first, e.g. how
 * much of a lentil soup's vitamin K is the spinach. Amounts are intake after losses, as the recipe
 * and meal pages show them; the shares are of that intake, so they add up to the whole. Pure
 * (tested in nutrientSplit.test.ts).
 */
import { entryIntake, TRACKED_IDS } from '../model/intake';
import type { Storage } from '../model/paramTypes';
import type { Ingredient, Recipe } from '../storage/types';
import { previewBatch } from './recipeIdeas';
import { batchParts, type ResolveContext } from './resolve';

/** What one part gave: intake per nutrient, and the nutrients it has no data for. */
export interface SplitPiece {
  intake: Readonly<Record<string, number>>;
  missing: readonly string[];
}

export interface SplitRow<T> {
  piece: T;
  amount: number;
  /** Of the whole (the sum of all parts' amounts). */
  share: number;
  /** The part has no data for some of its foods (a recipe portion in a meal): its real amount may be higher. */
  partial: boolean;
}

export interface Split<T> {
  /** The sum of the parts. */
  total: number;
  /** Parts that gave some of it, biggest first. */
  rows: SplitRow<T>[];
  /** Parts with data that gave none. */
  none: T[];
  /** Parts without any data for it ("missing is not zero"): the whole may be higher. */
  noData: T[];
}

/** One nutrient over the parts of a whole. */
export function splitNutrient<T extends SplitPiece>(pieces: readonly T[], id: string): Split<T> {
  const rows: SplitRow<T>[] = [];
  const none: T[] = [];
  const noData: T[] = [];
  for (const piece of pieces) {
    const amount = piece.intake[id] ?? 0;
    const missing = piece.missing.includes(id);
    if (amount > 0) rows.push({ piece, amount, share: 0, partial: missing });
    else if (missing) noData.push(piece);
    else none.push(piece);
  }
  const total = rows.reduce((a, r) => a + r.amount, 0);
  for (const r of rows) r.share = total > 0 ? r.amount / total : 0;
  rows.sort((a, b) => b.amount - a.amount);
  return { total, rows, none, noData };
}

/** One recipe ingredient's part of a portion: its index in the recipe, so the page can link to it. */
export interface IngredientPiece extends SplitPiece {
  index: number;
  ingredient: Ingredient;
  /** The food it resolved to (BLS code or product id); none when the food is no longer there. */
  code?: string;
  /** The food's name, or the name it was added under when the food is gone. */
  label: string;
}

/** What each ingredient gives to one portion, after cooking (and storage) losses, as portionIntake sums it. */
export function ingredientPieces(recipe: Pick<Recipe, 'name' | 'portions' | 'ingredients' | 'saltOverride'>, ctx: ResolveContext, storage: Storage = 'fresh'): IngredientPiece[] {
  const batch = previewBatch(recipe);
  return recipe.ingredients.map((ingredient, index) => {
    const parts = batchParts(batch, 1 / recipe.portions, storage, ctx, [ingredient]);
    const part = parts[0];
    // A food no longer there: no data for anything, not nothing.
    if (!part) return { index, ingredient, label: ingredient.name, intake: {}, missing: TRACKED_IDS };
    const res = entryIntake({ id: 'portion', label: recipe.name, time: 0, dayKey: '', confidence: 'A', isSupplement: false, parts }, 'central', { retention: true });
    return { index, ingredient, code: part.code, label: part.label, intake: res.intake, missing: res.missing };
  });
}
