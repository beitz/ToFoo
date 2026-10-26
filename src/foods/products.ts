/**
 * Foods from online databases (Open Food Facts products, USDA foods) as foods the model can use
 * (pure, tested in products.test.ts).
 *
 * A label gives energy, macros and salt (sometimes a few vitamins). Everything else is borrowed
 * from the closest BLS food the user (or the assistant) picked, per 100 g, as docs/SPEC.md
 * describes. USDA generic foods have most nutrients themselves; the BLS food only fills gaps.
 * Provenance follows the BLS categories: label values are "B" (Labelangabe), USDA generic values
 * "D" (Nährstoffdatenbank, taken from another database, as BLS itself marks USDA values),
 * borrowed ones "U" (Übernommener Wert, taken over from a similar food), so the model's data
 * uncertainty treats them like the matching BLS cases. Without a match, the rest stays missing,
 * never zero.
 */
import { DERIVED } from '../model/nutrients';
import type { RawValue } from '../model/types';
import type { FoodRef, Product, ProductSource } from '../storage/types';
import { COFID_PROVENANCE } from './blsTypes';
import { sumDerived, type Food, type FoodDb } from './foodDb';
import { isUndeclaredZero, productUrl } from './openFoodFacts';
import { usdaFoodUrl, usdaGroup } from './usda';

/** Storage id and food code of a product: `OFF:<barcode>` or `USDA:<fdcId>`. */
export const productId = (code: string, source: ProductSource = 'OFF') => `${source}:${code}`;
export const isProductCode = (code: string) => code.startsWith('OFF:') || code.startsWith('USDA:');
export const productRef = (p: Pick<Product, 'source' | 'code'>): FoodRef => ({ source: p.source, code: p.code });

/** USDA generic foods (not branded) carry most nutrients themselves; a BLS match is optional. */
export const hasOwnMicros = (p: Pick<Product, 'source' | 'usdaType'>) => p.source === 'USDA' && p.usdaType !== 'Branded';

/** A pairing the user has not looked at: picked by the app, or none found (and "label only" not chosen). */
export const needsCheck = (p: Pick<Product, 'source' | 'usdaType' | 'match' | 'labelOnly'>) => !hasOwnMicros(p) && (p.match ? !!p.match.auto : !p.labelOnly);

/**
 * Where a food's numbers come from, in short, for the small tag on things in the kitchen and on
 * the assistant's At home cards (owner's ask 2026-10-26: "is this from Open Food Facts? is it
 * linked with BLS?"). `off`/`usda` alone: a product not saved on this phone, so its pairing is unknown.
 */
export type FoodSourceKind = 'bls' | 'offBls' | 'offLabel' | 'off' | 'usda' | 'usdaBls' | 'usdaLabel' | 'custom' | 'none';
export function foodSourceKind(ref: FoodRef | undefined, product?: Pick<Product, 'source' | 'usdaType' | 'match'>): FoodSourceKind {
  if (!ref) return 'none';
  if (ref.source === 'BLS') return 'bls';
  if (ref.source === 'custom') return 'custom';
  if (ref.source === 'OFF') return !product ? 'off' : product.match ? 'offBls' : 'offLabel';
  if (!product) return 'usda';
  return product.match ? 'usdaBls' : hasOwnMicros(product) ? 'usda' : 'usdaLabel';
}

/** The food's page at its source. */
export const productPageUrl = (p: Pick<Product, 'source' | 'code'>) => (p.source === 'USDA' ? usdaFoodUrl(p.code) : productUrl(p.code));

/** Provenance codes (data/README.md): label value, database value, value taken over from a similar food. */
export const LABEL_PROVENANCE = 'B';
export const DATABASE_PROVENANCE = 'D';
export const BORROWED_PROVENANCE = 'U';

/**
 * The product's own values per 100 g. Open Food Facts products saved before zeros were read as
 * "not on the label" still carry them: they are left out here too (see isUndeclaredZero).
 */
export function labelValues(p: Pick<Product, 'source' | 'per100'>): Record<string, number> {
  if (p.source !== 'OFF') return p.per100;
  return Object.fromEntries(Object.entries(p.per100).filter(([id, v]) => !isUndeclaredZero(id, v)));
}

const UNSATURATED = ['FAMS', 'FAPU', 'FAPUN3', 'FAPUN6', 'F18:3CN3', 'F18:2CN6', 'F20:5CN3', 'F22:6CN3', 'EPADHA'];
const AMINO_ACIDS = ['HIS', 'ILE', 'LEU', 'LYS', 'MET', 'CYSTE', 'PHE', 'TYR', 'THR', 'TRP', 'VAL', 'SAA', 'AAA'];
const num = (v: RawValue | undefined) => (typeof v === 'number' ? v : v === 't' ? 0 : undefined);
const diff = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? undefined : Math.max(0, a - b));

/**
 * Parts of a whole the label gives. Borrowed per 100 g as they are, a similar food's parts can
 * outgrow the product's whole (chicken fat's 26 g linoleic acid in a meal with 7.1 g fat), so
 * they are scaled to the label: fatty acids to its fat (the unsaturated ones to fat minus
 * saturates when it gives both), amino acids to its protein, starch and sugars to its
 * carbohydrate. Plain arithmetic on the label, not a physiological number.
 */
const PARTS: Array<{ ids: readonly string[]; whole: (v: (id: string) => number | undefined) => number | undefined }> = [
  { ids: UNSATURATED, whole: (v) => (v('FASAT') === undefined ? v('FAT') : diff(v('FAT'), v('FASAT'))) },
  { ids: ['FASAT'], whole: (v) => v('FAT') },
  { ids: AMINO_ACIDS, whole: (v) => v('PROT625') },
  { ids: ['STARCH', 'SUGAR'], whole: (v) => v('CHO') },
];

function scaleToLabel(per100: Record<string, RawValue>, label: Record<string, number>, match: Food): void {
  for (const { ids, whole } of PARTS) {
    const own = whole((id) => label[id]);
    const borrowed = whole((id) => num(match.per100[id]));
    if (own === undefined || borrowed === undefined) continue;
    for (const id of ids) {
      const v = per100[id];
      if (v === undefined || v === null || id in label) continue;
      // A food without any of the whole says nothing about how a product with some is made up.
      if (borrowed === 0) per100[id] = own === 0 ? 0 : null;
      else if (typeof v === 'number') per100[id] = (v * own) / borrowed;
    }
  }
}

// Stable objects per product record and food list, so the model's per-food caches keep working.
const cache = new WeakMap<Product, { foods: Pick<FoodDb, 'byCode'>; food: Food }>();

/** The product as a Food: label values, the rest from the matched BLS food, scaled to the label where it is part of a label value. */
export function productFood(product: Product, foods: Pick<FoodDb, 'byCode'>): Food {
  const hit = cache.get(product);
  if (hit && hit.foods === foods) return hit.food;
  const match = product.match ? foods.byCode.get(product.match.code) : undefined;
  const per100: Record<string, RawValue> = {};
  const provenance: Record<string, string> = {};
  if (match) {
    for (const [id, v] of Object.entries(match.per100)) {
      per100[id] = v;
      // Selenium estimated from CoFID stays marked as such: borrowing doesn't make it more certain.
      provenance[id] = v === null ? '-' : match.provenance[id] === COFID_PROVENANCE ? COFID_PROVENANCE : BORROWED_PROVENANCE;
    }
  }
  const label = labelValues(product);
  if (match) {
    scaleToLabel(per100, label, match);
    for (const id of Object.keys(per100)) if (per100[id] === null) provenance[id] = '-';
  }
  const own = hasOwnMicros(product) ? DATABASE_PROVENANCE : LABEL_PROVENANCE;
  for (const [id, v] of Object.entries(label)) {
    per100[id] = v;
    provenance[id] = own;
  }
  // Sums like methionine + cysteine, from the merged parts (USDA has amino and fatty acids).
  for (const [id, parts] of Object.entries(DERIVED)) {
    if (!parts.some((p) => p in label)) continue;
    per100[id] = sumDerived(per100, parts);
    provenance[id] = provenance[parts[0]!] ?? '-';
  }
  const food: Food = {
    code: product.id,
    nameEn: product.name,
    nameDe: product.brand ?? '',
    // The group drives the iron estimates (meat/fish, phytate): the matched food's, else the USDA category's.
    group: match?.group ?? (product.source === 'USDA' && product.usdaType !== 'Branded' ? usdaGroup(product.categories) : ''),
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
