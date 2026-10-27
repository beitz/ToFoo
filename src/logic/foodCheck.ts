/**
 * Checking what was logged (owner's ask, 2026-10-27: "check all the food I logged over the past week:
 * do the BLS codes make sense?", after a scanned beer was paired with a beer sausage). Every food
 * eaten in a period, directly or in a cooked portion, with the BLS food its vitamins and minerals come
 * from; the ones that may be wrong first. Pure, tested in foodCheck.test.ts.
 */
import type { FoodDb } from '../foods/foodDb';
import { GOOD_FIT, labelFit } from '../foods/productMatch';
import { hasOwnMicros, productLabel } from '../foods/products';
import { refKey } from '../lib/refs';
import type { Batch, FoodRef, LogEntry, Product } from '../storage/types';

/**
 * Why a food is worth a look: its label does not fit the food it borrows from, it borrows from
 * none (only the label counts), or the app picked that food and nobody checked it yet.
 */
export type CheckFlag = 'misfit' | 'none' | 'auto';

export interface CheckRow {
  /** refKey of the food: also the product's id for products. */
  key: string;
  ref: FoodRef;
  name: string;
  product?: Product;
  /** Times logged by itself, and the grams of those. */
  count: number;
  grams: number;
  /** Recipes it was eaten in (cooked portions), by name. */
  recipes: string[];
  /** Label against the food it borrows from (0–1), for paired products. */
  fit?: number;
  flags: CheckFlag[];
}

const FLAG_ORDER: readonly CheckFlag[] = ['misfit', 'none', 'auto'];

/** The flags of one product, most serious first. */
export function productFlags(p: Product, foods: Pick<FoodDb, 'byCode'>): { fit?: number; flags: CheckFlag[] } {
  if (hasOwnMicros(p)) return { flags: [] };
  const fit = labelFit(p, foods);
  const flags: CheckFlag[] = [];
  if (fit !== undefined && fit < GOOD_FIT) flags.push('misfit');
  if (!p.match && !p.labelOnly) flags.push('none');
  if (p.match?.auto) flags.push('auto');
  return { ...(fit !== undefined ? { fit } : {}), flags };
}

/**
 * Every BLS food and product eaten from `from` to `to` (day keys, inclusive), flagged ones first
 * (in FLAG_ORDER), then by how often. Own foods carry their own values and are left out.
 */
export function foodCheck(
  log: readonly LogEntry[],
  batchesById: ReadonlyMap<string, Batch>,
  productsById: ReadonlyMap<string, Product>,
  foods: Pick<FoodDb, 'byCode'>,
  from: string,
  to: string,
): CheckRow[] {
  const rows = new Map<string, CheckRow>();
  const row = (ref: FoodRef, fallback: string) => {
    const key = refKey(ref);
    let r = rows.get(key);
    if (!r) {
      const product = ref.source === 'OFF' || ref.source === 'USDA' ? productsById.get(key) : undefined;
      const name = product ? productLabel(product) : ref.source === 'BLS' ? (foods.byCode.get(ref.code)?.nameEn ?? fallback) : fallback;
      r = { key, ref, name, ...(product ? { product } : {}), count: 0, grams: 0, recipes: [], ...(product ? productFlags(product, foods) : { flags: [] }) };
      rows.set(key, r);
    }
    return r;
  };
  for (const e of log) {
    if (e.day < from || e.day > to) continue;
    if (e.kind === 'food') {
      if (e.ref.source === 'custom') continue;
      const r = row(e.ref, e.label);
      r.count++;
      r.grams += e.grams;
    } else if (e.kind === 'portion') {
      const batch = batchesById.get(e.batchId);
      if (!batch) continue;
      for (const ing of e.ingredients ?? batch.recipe.ingredients) {
        if (ing.ref.source === 'custom') continue;
        const r = row(ing.ref, ing.name);
        if (!r.recipes.includes(batch.recipe.name)) r.recipes.push(batch.recipe.name);
      }
    }
  }
  const rank = (r: CheckRow) => {
    const i = FLAG_ORDER.findIndex((f) => r.flags.includes(f));
    return i < 0 ? FLAG_ORDER.length : i;
  };
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.name.localeCompare(b.name));
}
