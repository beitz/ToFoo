/**
 * Cooking a batch (design 2026-10-22, "Cook a batch"): where each box of the pot goes, and the
 * empty pots remembered by name, so weighing next time is one number. Pure, tested in
 * cooking.test.ts.
 */
import { refKey } from '../lib/refs';
import type { Batch, Ingredient, LogEntry, PantryItem, Pot, Recipe, Settings } from '../storage/types';
import { leftOf, usageOf, type Left, type PieceUnits } from './pantry';

/** Where one box of the pot goes: eaten now (logged with the batch), the fridge or the freezer. */
export type Box = 'now' | 'fridge' | 'freezer';
export const BOX_ORDER: readonly Box[] = ['now', 'fridge', 'freezer'];

/** The boxes for a storage plan: fresh portions are eaten now, then the fridge, then the freezer. */
export function boxesOf(plan: { fresh: number; fridge: number; freezer: number }): Box[] {
  return [...Array<Box>(plan.fresh).fill('now'), ...Array<Box>(plan.fridge).fill('fridge'), ...Array<Box>(plan.freezer).fill('freezer')];
}

/** The storage plan for the boxes (eaten now counts as fresh). */
export function planOf(boxes: readonly Box[]): { fresh: number; fridge: number; freezer: number } {
  return {
    fresh: boxes.filter((b) => b === 'now').length,
    fridge: boxes.filter((b) => b === 'fridge').length,
    freezer: boxes.filter((b) => b === 'freezer').length,
  };
}

/** A tap on a box: eat now → fridge → freezer → eat now. */
export function nextBox(b: Box): Box {
  return BOX_ORDER[(BOX_ORDER.indexOf(b) + 1) % BOX_ORDER.length]!;
}

/** More or fewer portions: new boxes go to the freezer (the plan's "rest"), fewer come off the end. */
export function resizeBoxes(boxes: readonly Box[], n: number): Box[] {
  if (n <= boxes.length) return boxes.slice(0, Math.max(0, n));
  return [...boxes, ...Array<Box>(n - boxes.length).fill('freezer')];
}

/**
 * The pot to start with: the one this recipe was last cooked in, else a remembered pot of the
 * weight last used, else that weight without a name (pots weighed before pots had names).
 */
export function startPot(recipe: Pick<Recipe, 'potId' | 'potGrams'>, settings: Pick<Settings, 'pots' | 'potGrams'>): { pot?: Pot; grams?: number } {
  const pots = settings.pots ?? [];
  const byId = recipe.potId ? pots.find((p) => p.id === recipe.potId) : undefined;
  if (byId) return { pot: byId, grams: byId.grams };
  const grams = recipe.potGrams ?? settings.potGrams;
  const byWeight = grams ? pots.find((p) => p.grams === grams) : undefined;
  return byWeight ? { pot: byWeight, grams: byWeight.grams } : grams ? { grams } : {};
}

/** The pots with one added or changed (same id); an empty name or weight removes nothing and adds nothing. */
export function withPot(pots: readonly Pot[], pot: Pot): Pot[] {
  if (!pot.name.trim() || !(pot.grams > 0)) return [...pots];
  const clean = { ...pot, name: pot.name.trim(), grams: Math.round(pot.grams) };
  return pots.some((p) => p.id === pot.id) ? pots.map((p) => (p.id === pot.id ? clean : p)) : [...pots, clean];
}

/** An ingredient taken from what is at home, and what is left of it once the pot is cooked. */
export interface HomeUse {
  ingredient: Ingredient;
  item: PantryItem;
  after: Left;
}

/**
 * "Taken from home": the ingredients that are at home (not used up before cooking), with what the
 * kitchen will show once this pot counts. Nothing is stored for it: the kitchen works out what is
 * left from the log and the cooked pots (logic/pantry.ts), so cooking updates it by itself.
 */
export function takenFromHome(
  ingredients: readonly Ingredient[],
  items: readonly PantryItem[],
  log: readonly LogEntry[],
  batches: readonly Batch[],
  now: number,
  units?: (key: string) => PieceUnits | undefined,
): HomeUse[] {
  const before = usageOf(log, batches, units);
  const after = usageOf(log, [...batches, { cookedAt: now, recipe: { ingredients: [...ingredients] } }], units);
  const out: HomeUse[] = [];
  for (const ingredient of ingredients) {
    if (ingredient.isSalt) continue;
    const key = refKey(ingredient.ref);
    const item = items.find((i) => i.ref && refKey(i.ref) === key && !leftOf(i, before).out);
    if (item) out.push({ ingredient, item, after: leftOf(item, after) });
  }
  return out;
}
