/**
 * Open Food Facts products as foods the model can use (pure, tested in products.test.ts).
 *
 * The label gives energy, macros and salt (sometimes a few vitamins). Everything else is borrowed
 * from the closest BLS food the user (or the assistant) picked, per 100 g, as docs/SPEC.md
 * describes. Provenance follows the BLS categories: label values are "B" (Labelangabe), borrowed
 * ones "U" (Übernommener Wert, taken over from a similar food), so the model's data uncertainty
 * treats them like the matching BLS cases. Without a match, the rest stays missing, never zero.
 */
import type { RawValue } from '../model/types';
import type { Product } from '../storage/types';
import type { Food, FoodDb } from './foodDb';

export const OFF_PREFIX = 'OFF:';

/** Storage id and food code of a product: `OFF:<barcode>`. */
export const productId = (barcode: string) => `${OFF_PREFIX}${barcode}`;
export const isProductCode = (code: string) => code.startsWith(OFF_PREFIX);
export const barcodeOf = (code: string) => (isProductCode(code) ? code.slice(OFF_PREFIX.length) : code);

/** Provenance codes (data/README.md): label value, and value taken over from a similar food. */
export const LABEL_PROVENANCE = 'B';
export const BORROWED_PROVENANCE = 'U';

// Stable objects per product record and food list, so the model's per-food caches keep working.
const cache = new WeakMap<Product, { foods: Pick<FoodDb, 'byCode'>; food: Food }>();

/** The product as a Food: label values, the rest from the matched BLS food. */
export function productFood(product: Product, foods: Pick<FoodDb, 'byCode'>): Food {
  const hit = cache.get(product);
  if (hit && hit.foods === foods) return hit.food;
  const match = product.match ? foods.byCode.get(product.match.code) : undefined;
  const per100: Record<string, RawValue> = {};
  const provenance: Record<string, string> = {};
  if (match) {
    for (const [id, v] of Object.entries(match.per100)) {
      per100[id] = v;
      provenance[id] = v === null ? '-' : BORROWED_PROVENANCE;
    }
  }
  for (const [id, v] of Object.entries(product.per100)) {
    per100[id] = v;
    provenance[id] = LABEL_PROVENANCE;
  }
  const food: Food = {
    code: productId(product.code),
    nameEn: product.name,
    nameDe: product.brand ?? '',
    // The matched food's group drives the iron estimates (meat/fish, phytate); none without a match.
    group: match?.group ?? '',
    per100,
    provenance,
  };
  cache.set(product, { foods, food });
  return food;
}

/** Display name with the brands the name does not already contain. */
export function productLabel(p: Pick<Product, 'name' | 'brand'>): string {
  const name = p.name.toLowerCase();
  const brands = (p.brand ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter((b) => b && !name.includes(b.toLowerCase()));
  return brands.length ? `${p.name} · ${brands.join(', ')}` : p.name;
}

/**
 * Search words for suggesting a similar BLS food: the most specific categories first
 * (Open Food Facts lists them from general to specific).
 */
export function matchQueries(p: Pick<Product, 'categories'>, max = 3): string[] {
  return [...p.categories].reverse().slice(0, max);
}
