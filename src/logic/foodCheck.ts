/**
 * Checking what was logged (owner's ask, 2026-10-27: "check all the food I logged over the past week:
 * do the BLS codes make sense?", after a scanned beer was paired with a beer sausage). Every food
 * eaten in a period, directly or in a cooked portion, with the BLS food its vitamins and minerals come
 * from; the ones that may be wrong first. Pure, tested in foodCheck.test.ts.
 */
import type { FoodDb } from '../foods/foodDb';
import { GOOD_FIT, kindMismatch, kindOf, labelFit } from '../foods/productMatch';
import { hasOwnMicros, productLabel } from '../foods/products';
import { refKey } from '../lib/refs';
import type { Batch, FoodRef, HomePlace, LogEntry, Product, Settings } from '../storage/types';

/**
 * Why a food is worth a look: the user marked it "Not right" (owner's ask, 2026-10-28: "I can say
 * looks right, I can't say doesn't look right or check again please"), it borrows from another
 * kind of food (a drink from a food, tofu from fish), its label does not fit the food it borrows
 * from, it borrows from none (only the label counts), or the app picked that food and nobody
 * checked it yet.
 */
export type CheckFlag = 'doubt' | 'kind' | 'misfit' | 'none' | 'auto';

/** What the user said about foods: "Looks right" and "Not right", each refKey → checkSignature when marked. */
export type FoodMarks = Pick<Settings, 'checkedFoods' | 'doubtedFoods'>;
export type KindReason = NonNullable<ReturnType<typeof kindMismatch>>;

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
  /** Where it is at home, for things in the kitchen the check was asked to cover too. */
  home?: HomePlace[];
  /** Label against the food it borrows from (0–1), for paired products. */
  fit?: number;
  /** With the 'kind' flag: how the food it borrows from is of another kind. */
  kind?: KindReason;
  flags: CheckFlag[];
  /** Marked "Looks right" by the user (or fixed by them) with the food it has now. */
  checked: boolean;
  /** Marked "Not right" by the user with the food it has now (the 'doubt' flag). */
  doubted: boolean;
}

const FLAG_ORDER: readonly CheckFlag[] = ['doubt', 'kind', 'misfit', 'none', 'auto'];

/** The flags of one product, most serious first. */
export function productFlags(p: Product, foods: Pick<FoodDb, 'byCode'>): { fit?: number; kind?: KindReason; flags: CheckFlag[] } {
  if (hasOwnMicros(p)) return { flags: [] };
  const fit = labelFit(p, foods);
  // A mix comes from the product's own ingredient list, so only a single similar food can be of another kind.
  const single = p.match && !p.match.parts ? foods.byCode.get(p.match.code) : undefined;
  const kind = single ? kindMismatch(kindOf(p), single) : undefined;
  const flags: CheckFlag[] = [];
  if (kind) flags.push('kind');
  if (fit !== undefined && fit < GOOD_FIT) flags.push('misfit');
  if (!p.match && !p.labelOnly) flags.push('none');
  if (p.match?.auto) flags.push('auto');
  return { ...(fit !== undefined ? { fit } : {}), ...(kind ? { kind } : {}), flags };
}

/**
 * What a "Looks right" (or "Not right") holds for: a BLS food itself, a product with the food it
 * borrows from now. When the pairing changes (the app's better pick, a fix), the mark no longer holds.
 */
export function checkSignature(ref: FoodRef, product?: Pick<Product, 'match' | 'labelOnly'>): string {
  if (!product) return ref.source;
  const m = product.match;
  if (!m) return product.labelOnly ? 'label' : 'none';
  return m.parts ? `mix:${m.parts.map((p) => p.code).join(',')}` : m.code;
}

/** A thing at home with the food it is, for checking the kitchen too. */
export interface HomeRef {
  ref: FoodRef;
  name: string;
  place: HomePlace;
}

/**
 * Every BLS food and product eaten from `from` to `to` (day keys, inclusive), and each one at home
 * in `home`, flagged ones first (in FLAG_ORDER, the ones the user marked "Not right" first), then by
 * how often, the ones the user checked last (`marks`). Own foods carry their own values and are
 * left out.
 */
export function foodCheck(
  log: readonly LogEntry[],
  batchesById: ReadonlyMap<string, Batch>,
  productsById: ReadonlyMap<string, Product>,
  foods: Pick<FoodDb, 'byCode'>,
  from: string,
  to: string,
  marks: FoodMarks = {},
  home: readonly HomeRef[] = [],
): CheckRow[] {
  const rows = new Map<string, CheckRow>();
  const row = (ref: FoodRef, fallback: string) => {
    const key = refKey(ref);
    let r = rows.get(key);
    if (!r) {
      const product = ref.source === 'OFF' || ref.source === 'USDA' ? productsById.get(key) : undefined;
      const name = product ? productLabel(product) : ref.source === 'BLS' ? (foods.byCode.get(ref.code)?.nameEn ?? fallback) : fallback;
      const signature = checkSignature(ref, product);
      const flagged = product ? productFlags(product, foods) : { flags: [] as CheckFlag[] };
      // "Not right" wins over a "Looks right" that is somehow there too; setting one clears the other.
      const doubted = marks.doubtedFoods?.[key] === signature;
      r = {
        key,
        ref,
        name,
        ...(product ? { product } : {}),
        count: 0,
        grams: 0,
        recipes: [],
        ...flagged,
        flags: doubted ? ['doubt', ...flagged.flags] : flagged.flags,
        checked: !doubted && marks.checkedFoods?.[key] === signature,
        doubted,
      };
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
  for (const h of home) {
    if (h.ref.source === 'custom') continue;
    const r = row(h.ref, h.name);
    if (!r.home) r.home = [];
    if (!r.home.includes(h.place)) r.home.push(h.place);
  }
  // Checked ones last: the user has looked at them, whatever the flags say.
  const rank = (r: CheckRow) => {
    if (r.checked) return FLAG_ORDER.length + 1;
    const i = FLAG_ORDER.findIndex((f) => r.flags.includes(f));
    return i < 0 ? FLAG_ORDER.length : i;
  };
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.name.localeCompare(b.name));
}

/** Unchecked foods that pile up before Home asks for a look, when none is flagged (owner's pick, 2026-10-27). */
export const CHECK_PILE_UP = 10;

/**
 * What Home's "foods to check" line says: foods not checked yet and those worth a look among
 * them; shown while any is worth a look or CHECK_PILE_UP have piled up (undefined: no line).
 */
export function checkNudge(rows: readonly CheckRow[]): { unchecked: number; flagged: number } | undefined {
  const open = rows.filter((r) => !r.checked);
  const flagged = open.filter((r) => r.flags.length).length;
  return flagged > 0 || open.length >= CHECK_PILE_UP ? { unchecked: open.length, flagged } : undefined;
}

/** Both marks of these foods as they are now, to put back on undo (repo.setFoodMarks). */
export function marksOf(marks: FoodMarks, keys: readonly string[]): Record<string, { checked?: string; doubted?: string }> {
  return Object.fromEntries(
    keys.map((k) => {
      const checked = marks.checkedFoods?.[k];
      const doubted = marks.doubtedFoods?.[k];
      return [k, { ...(checked !== undefined ? { checked } : {}), ...(doubted !== undefined ? { doubted } : {}) }];
    }),
  );
}
