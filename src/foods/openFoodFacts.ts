/**
 * Open Food Facts (openfoodfacts.org): packaged products by barcode. An opt-in online feature
 * (Settings → Open Food Facts); a lookup sends only the barcode. Data licence: ODbL.
 *
 * Only barcode lookup is used. OFF's name search cannot be called from a browser app: the
 * full-text search service sends no CORS headers, and the legacy search API answers 503 to
 * anonymous clients (checked 2026-10-16; docs/OPEN_QUESTIONS.md).
 *
 * The parsing is pure and tested (openFoodFacts.test.ts); `lookupBarcode` takes `fetch` as a
 * parameter so it can be tested without a network.
 */
import { NUTRIENT_BY_ID } from '../model/nutrients';

export const OFF_SITE = 'https://world.openfoodfacts.org';

export const productUrl = (code: string) => `${OFF_SITE}/product/${encodeURIComponent(code)}`;

/** A product as fetched: label values in BLS ids and units. */
export interface ProductData {
  /** Barcode, as Open Food Facts stores it. */
  code: string;
  name: string;
  /** Brands, comma-separated as on Open Food Facts (e.g. "Ferrero, Giotto"). */
  brand?: string;
  /** Pack size as printed, e.g. "38,7 g". */
  quantity?: string;
  /** Serving from the label, e.g. { label: "3 balls (13 g)", grams: 13 }. */
  serving?: { label: string; grams: number };
  /** Values per 100 g (per 100 ml for drinks) by BLS nutrient id. A nutrient not on the label is absent, never 0. */
  per100: Record<string, number>;
  /** True when the label values are per 100 ml. */
  perMl?: boolean;
  /** English category names, most general first (for suggesting a similar BLS food). */
  categories: string[];
  /** When the product was last edited on Open Food Facts (epoch ms). */
  lastModified?: number;
}

/**
 * Open Food Facts nutriment key → BLS component id. OFF reports `<key>_100g` in grams (kcal for
 * energy-kcal); the factor to the BLS unit comes from the nutrient's unit. Left out on purpose:
 * vitamin A and folate (labels mix units: retinol vs. carotenoid equivalents, folic acid vs.
 * folate equivalents) and selenium (not in BLS).
 */
export const NUTRIMENT_IDS: Readonly<Record<string, string>> = {
  'energy-kcal': 'ENERCC',
  proteins: 'PROT625',
  fat: 'FAT',
  'saturated-fat': 'FASAT',
  // EU labels give available carbohydrate (fibre listed separately), as BLS CHO does.
  carbohydrates: 'CHO',
  sugars: 'SUGAR',
  fiber: 'FIBT',
  sodium: 'NA',
  potassium: 'K',
  chloride: 'CLD',
  calcium: 'CA',
  magnesium: 'MG',
  phosphorus: 'P',
  iron: 'FE',
  zinc: 'ZN',
  iodine: 'ID',
  copper: 'CU',
  manganese: 'MN',
  fluoride: 'FD',
  chromium: 'CR',
  molybdenum: 'MO',
  'vitamin-d': 'VITD',
  'vitamin-e': 'VITE',
  'vitamin-k': 'VITK',
  'vitamin-b1': 'THIA',
  'vitamin-b2': 'RIBF',
  'vitamin-pp': 'NIAEQ',
  'pantothenic-acid': 'PANTAC',
  'vitamin-b6': 'VITB6',
  biotin: 'BIOT',
  'vitamin-b12': 'VITB12',
  'vitamin-c': 'VITC',
};

const FROM_GRAMS: Record<string, number> = { g: 1, mg: 1e3, µg: 1e6 };

/** kJ per kcal (thermochemical calorie), for labels that give only kJ. */
const KJ_PER_KCAL = 4.184;
/**
 * Sanity limits for label values, not physiological numbers: no food has more than 100 g of a
 * nutrient per 100 g, or more energy than pure fat (9 kcal/g, Regulation (EU) No 1169/2011,
 * Annex XIV). Values outside are typing errors on Open Food Facts and are dropped.
 */
const MAX_KCAL_PER_100G = 900;
const MAX_GRAMS_PER_100G = 100;

/** The fields a lookup asks for (keeps the response small). */
export const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'product_name_de',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'nutrition_data_per',
  'product_quantity_unit',
  'categories_tags_en',
  'last_modified_t',
].join(',');

/** Digits only; null if it cannot be a barcode. GTIN lengths (8, 12, 13, 14) must have a valid check digit. */
export function normalizeBarcode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '');
  if (!/^\d{4,14}$/.test(code)) return null;
  if ([8, 12, 13, 14].includes(code.length) && !validGtin(code)) return null;
  return code;
}

/** GS1 check digit: weights 3 and 1 alternate from the right, excluding the check digit. */
export function validGtin(code: string): boolean {
  let sum = 0;
  for (let i = code.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(code[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Label values per 100 g in BLS ids and units; implausible values are dropped. */
export function parseNutriments(nutriments: unknown): Record<string, number> {
  const n = (nutriments ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, id] of Object.entries(NUTRIMENT_IDS)) {
    const unit = NUTRIENT_BY_ID.get(id)?.unit;
    let v = num(n[`${key}_100g`]);
    if (key === 'energy-kcal' && v === undefined) {
      const kj = num(n['energy-kj_100g']);
      if (kj !== undefined) v = kj / KJ_PER_KCAL;
    }
    if (v === undefined || v < 0) continue;
    if (unit === 'kcal') {
      if (v <= MAX_KCAL_PER_100G) out[id] = v;
      continue;
    }
    const factor = unit ? FROM_GRAMS[unit] : undefined;
    if (factor === undefined || v > MAX_GRAMS_PER_100G) continue;
    out[id] = v * factor;
  }
  return out;
}

/** Turn an Open Food Facts product object into ProductData; null if it has no usable name. */
export function parseProduct(raw: unknown, fallbackCode = ''): ProductData | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const code = str(p.code) ?? fallbackCode;
  // The name as printed on the pack (main language) beats a translation, which is often generic ("Hazelnut").
  const name = str(p.product_name) ?? str(p.product_name_en) ?? str(p.product_name_de);
  if (!code || !name) return null;
  const brand = str(p.brands)
    ?.split(',')
    .map((b) => b.trim())
    .filter(Boolean)
    .join(', ');
  const servingGrams = num(p.serving_quantity);
  const servingLabel = str(p.serving_size);
  const lastModified = num(p.last_modified_t);
  const categories = Array.isArray(p.categories_tags_en) ? p.categories_tags_en.filter((c): c is string => typeof c === 'string' && !c.includes(':')) : [];
  return {
    code,
    name,
    ...(brand ? { brand } : {}),
    ...(str(p.quantity) ? { quantity: str(p.quantity) } : {}),
    ...(servingGrams && servingGrams > 0 && servingLabel ? { serving: { label: servingLabel, grams: servingGrams } } : {}),
    per100: parseNutriments(p.nutriments),
    ...(str(p.product_quantity_unit)?.toLowerCase() === 'ml' || str(p.nutrition_data_per) === '100ml' ? { perMl: true } : {}),
    categories,
    ...(lastModified ? { lastModified: lastModified * 1000 } : {}),
  };
}

export type LookupResult =
  | { kind: 'found'; product: ProductData }
  | { kind: 'notFound' }
  | { kind: 'error'; reason: 'offline' | 'busy' | 'other' };

/** Look up one barcode (already normalised). Sends only the barcode. */
export async function lookupBarcode(code: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<LookupResult> {
  let res: Response;
  try {
    // No custom headers: they would need a CORS preflight, and browsers do not let apps set User-Agent.
    res = await fetchImpl(`${OFF_SITE}/api/v3/product/${encodeURIComponent(code)}?fields=${FIELDS}`);
  } catch {
    return { kind: 'error', reason: 'offline' };
  }
  if (res.status === 404) return { kind: 'notFound' };
  if (res.status === 429 || res.status >= 500) return { kind: 'error', reason: 'busy' };
  if (!res.ok) return { kind: 'error', reason: 'other' };
  try {
    const body = (await res.json()) as { product?: unknown };
    const product = parseProduct(body.product, code);
    return product ? { kind: 'found', product } : { kind: 'notFound' };
  } catch {
    return { kind: 'error', reason: 'other' };
  }
}
