/**
 * USDA FoodData Central (fdc.nal.usda.gov): an opt-in online search for foods the BLS lacks
 * (Settings → USDA FoodData Central). A search sends only the search words (and the API key).
 * Data: public domain (CC0 1.0).
 *
 * FoodData Central has two kinds of data, and ToFoo treats them differently (docs/SPEC.md):
 * - Generic foods (Foundation, SR Legacy, Survey (FNDDS)): analysed or calculated values for most
 *   vitamins and minerals, used as they are. A similar BLS food can fill the gaps (iodine, often).
 * - Branded foods: US label values only, which work like Open Food Facts products.
 *
 * The API sends CORS headers for any origin and answers name searches, so it works from the app
 * (checked 2026-10-17). It needs an api.data.gov key; the shared DEMO_KEY allows a few dozen
 * requests a day per IP address, a free personal key 1,000 an hour.
 *
 * Parsing is pure and tested (usda.test.ts); `searchUsda` takes `fetch` as a parameter.
 */
import type { ProductData } from './openFoodFacts';
import { KJ_PER_KCAL, MAX_GRAMS_PER_100G, MAX_KCAL_PER_100G } from './openFoodFacts';

export const USDA_API = 'https://api.nal.usda.gov/fdc/v1';
/** api.data.gov's shared demo key: works without signing up, with low per-IP limits. */
export const DEMO_KEY = 'DEMO_KEY';
export const USDA_KEY_SIGNUP = 'https://fdc.nal.usda.gov/api-key-signup';

export const usdaFoodUrl = (fdcId: string) => `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(fdcId)}/nutrients`;

export const GENERIC_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'] as const;
export type UsdaDataType = (typeof GENERIC_TYPES)[number] | 'Branded';
export type UsdaKind = 'generic' | 'branded' | 'all';

/** A USDA food as fetched: values per 100 g (per 100 ml if perMl) in BLS ids and units. */
export interface UsdaFood extends ProductData {
  usdaType: UsdaDataType;
}

/**
 * USDA nutrient number → BLS component id and BLS unit. Where several numbers exist, the first
 * one present wins. Choices that matter:
 * - Energy: 208 (kcal); Foundation foods often give only Atwater energy (958 specific, 957 general).
 * - CHO: BLS gives available carbohydrate; USDA 205 is "by difference", which includes fibre, so
 *   fibre is subtracted (see parseUsdaNutrients).
 * - Linoleic acid and ALA: the cis isomers (675, 851) as in BLS; SR Legacy often has only the
 *   totals (618, 619), which are almost entirely those isomers in ordinary foods.
 * - Folate: BLS "folate equivalent" is natural folate plus converted folic acid. USDA 432 (food
 *   folate) is the same thing when no folic acid is added; for fortified foods USDA's DFE (435) is
 *   used, which converts folic acid with factor 1.7 (docs/OPEN_QUESTIONS.md).
 * - Niacin: USDA gives preformed niacin (406 → BLS NIA), not niacin equivalents (NIAEQ), so the
 *   gauge value comes from the similar BLS food if one is chosen, or stays missing.
 * Left out: vitamin A and D in IU (the µg values are used).
 */
export const USDA_NUTRIENTS: ReadonlyArray<readonly [id: string, numbers: readonly string[], unit: string]> = [
  ['PROT625', ['203'], 'g'],
  ['FAT', ['204'], 'g'],
  ['FASAT', ['606'], 'g'],
  ['SUGAR', ['269'], 'g'],
  ['FIBT', ['291'], 'g'],
  ['F18:2CN6', ['675', '618'], 'g'],
  ['F18:3CN3', ['851', '619'], 'g'],
  ['F20:5CN3', ['629'], 'g'],
  ['F22:6CN3', ['621'], 'g'],
  ['HIS', ['512'], 'g'],
  ['ILE', ['503'], 'g'],
  ['LEU', ['504'], 'g'],
  ['LYS', ['505'], 'g'],
  ['MET', ['506'], 'g'],
  ['CYSTE', ['507'], 'g'],
  ['PHE', ['508'], 'g'],
  ['TYR', ['509'], 'g'],
  ['THR', ['502'], 'g'],
  ['TRP', ['501'], 'g'],
  ['VAL', ['510'], 'g'],
  ['VITAA', ['320'], 'µg'],
  ['RETOL', ['319'], 'µg'],
  ['VITD', ['328'], 'µg'],
  ['VITE', ['323'], 'mg'],
  ['VITK', ['430'], 'µg'],
  ['THIA', ['404'], 'mg'],
  ['RIBF', ['405'], 'mg'],
  ['NIA', ['406'], 'mg'],
  ['PANTAC', ['410'], 'mg'],
  ['VITB6', ['415'], 'µg'],
  ['BIOT', ['416'], 'µg'],
  ['FOLAC', ['431'], 'µg'],
  ['VITB12', ['418'], 'µg'],
  ['VITC', ['401'], 'mg'],
  ['NA', ['307'], 'mg'],
  ['K', ['306'], 'mg'],
  ['CA', ['301'], 'mg'],
  ['MG', ['304'], 'mg'],
  ['P', ['305'], 'mg'],
  ['FE', ['303'], 'mg'],
  ['ZN', ['309'], 'mg'],
  ['ID', ['314'], 'µg'],
  ['SE', ['317'], 'µg'],
  ['CU', ['312'], 'µg'],
  ['MN', ['315'], 'µg'],
  ['FD', ['313'], 'µg'],
];

const PER_GRAM: Record<string, number> = { g: 1, mg: 1e3, µg: 1e6 };

/** USDA unit names come as "g", "MG", "UG", "µg", "KCAL" or "kJ". */
function unitOf(name: string): string {
  const u = name.trim().toLowerCase();
  if (u === 'ug' || u === 'mcg' || u === 'μg') return 'µg';
  return u;
}

interface RawNutrient {
  number: string;
  unit: string;
  value: number;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Nutrients in the three shapes FoodData Central uses: search results
 * ({nutrientNumber, unitName, value}), food details ({nutrient: {number, unitName}, amount}) and
 * the abridged format ({number, unitName, amount}).
 */
function rawNutrients(list: unknown): RawNutrient[] {
  if (!Array.isArray(list)) return [];
  const out: RawNutrient[] = [];
  for (const item of list) {
    const n = (item ?? {}) as Record<string, unknown>;
    const inner = (n.nutrient ?? {}) as Record<string, unknown>;
    const number = String(n.nutrientNumber ?? n.number ?? inner.number ?? '');
    const unit = str(n.unitName) ?? str(inner.unitName);
    const value = num(n.value) ?? num(n.amount);
    if (number && unit && value !== undefined && value >= 0) out.push({ number, unit: unitOf(unit), value });
  }
  return out;
}

/** Values per 100 g in BLS ids and units; implausible values are dropped. */
export function parseUsdaNutrients(list: unknown, usdaType: UsdaDataType): Record<string, number> {
  const raw = rawNutrients(list);
  const byNumber = new Map<string, RawNutrient>();
  for (const r of raw) if (!byNumber.has(r.number)) byNumber.set(r.number, r);
  const grams = (r: RawNutrient | undefined, unit: string): number | undefined => {
    const from = r ? PER_GRAM[r.unit] : undefined;
    const to = PER_GRAM[unit];
    if (!r || from === undefined || to === undefined) return undefined;
    const v = (r.value / from) * to;
    return r.value / from > MAX_GRAMS_PER_100G ? undefined : v;
  };

  const out: Record<string, number> = {};
  for (const [id, numbers, unit] of USDA_NUTRIENTS) {
    const r = numbers.map((x) => byNumber.get(x)).find((x) => x !== undefined);
    const v = grams(r, unit);
    if (v !== undefined) out[id] = v;
  }

  const kcal = [byNumber.get('208'), byNumber.get('958'), byNumber.get('957')].find((r) => r?.unit === 'kcal')?.value;
  const kj = byNumber.get('268');
  const energy = kcal ?? (kj?.unit === 'kj' ? kj.value / KJ_PER_KCAL : undefined);
  if (energy !== undefined && energy <= MAX_KCAL_PER_100G) out.ENERCC = energy;

  // Available carbohydrate = carbohydrate by difference − fibre. US labels must list fibre unless
  // it is insignificant (21 CFR 101.9(c)(6)(i)), so a branded food without it counts as none;
  // for generic foods an unmeasured fibre leaves carbohydrate unknown.
  const total = grams(byNumber.get('205'), 'g');
  const fibre = out.FIBT ?? (usdaType === 'Branded' ? 0 : undefined);
  if (total !== undefined && fibre !== undefined) out.CHO = Math.max(0, total - fibre);

  // Folate equivalents: natural folate, or USDA's DFE when folic acid was added.
  const foodFolate = grams(byNumber.get('432'), 'µg');
  const dfe = grams(byNumber.get('435'), 'µg');
  if (!out.FOLAC && foodFolate !== undefined) out.FOL = foodFolate;
  else if (dfe !== undefined) out.FOL = dfe;
  return out;
}

/** "KIMCHI, NAPA CABBAGE" → "Kimchi, napa cabbage" (branded names are often all caps). */
export function tidyName(name: string): string {
  if (/[a-z]/.test(name)) return name;
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const dataTypeOf = (v: unknown): UsdaDataType | undefined => {
  const s = str(v);
  return s === 'Branded' || GENERIC_TYPES.includes(s as never) ? (s as UsdaDataType) : undefined;
};

/** One serving: the label serving for branded foods, the first household measure otherwise. */
function servingOf(f: Record<string, unknown>, perMl: boolean): ProductData['serving'] {
  const size = num(f.servingSize);
  const unit = str(f.servingSizeUnit)?.toLowerCase();
  if (size && size > 0 && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt')) {
    const own = `${Math.round(size * 10) / 10} ${perMl ? 'ml' : 'g'}`;
    const household = str(f.householdServingFullText);
    return { label: household ? `${household} (${own})` : own, grams: size };
  }
  const measures = Array.isArray(f.foodMeasures) ? f.foodMeasures : Array.isArray(f.foodPortions) ? f.foodPortions : [];
  for (const m of measures as Array<Record<string, unknown>>) {
    const g = num(m.gramWeight);
    const unitName = str((m.measureUnit as Record<string, unknown> | undefined)?.name);
    const label =
      str(m.disseminationText) ??
      str(m.portionDescription) ??
      [num(m.amount), str(m.modifier), unitName && unitName !== 'undetermined' ? unitName : undefined].filter((x) => x !== undefined).join(' ');
    if (g && g > 0 && label && !/not specified/i.test(label)) return { label: tidyName(label), grams: g };
  }
  return undefined;
}

/** A search result or food details object as a UsdaFood; null without an id, name or data type. */
export function parseUsdaFood(raw: unknown): UsdaFood | null {
  const f = (raw ?? {}) as Record<string, unknown>;
  const fdcId = num(f.fdcId);
  const description = str(f.description);
  const usdaType = dataTypeOf(f.dataType);
  if (!fdcId || !description || !usdaType) return null;
  const branded = usdaType === 'Branded';
  const unit = str(f.servingSizeUnit)?.toLowerCase();
  const perMl = branded && (unit === 'ml' || unit === 'mlt');
  const brand = branded ? (str(f.brandName) ?? str(f.brandOwner)) : undefined;
  const category = str(f.foodCategory) ?? str((f.foodCategory as Record<string, unknown> | undefined)?.description) ?? str(f.brandedFoodCategory);
  // Most general first (as for Open Food Facts), so the food's own name is the first match query.
  const categories = [category, tidyName(description.split(',')[0]!.trim())].filter((c): c is string => !!c);
  const modified = Date.parse(str(f.modifiedDate) ?? str(f.publishedDate) ?? str(f.publicationDate) ?? '');
  const serving = servingOf(f, perMl);
  const pack = branded ? str(f.packageWeight) : undefined;
  return {
    code: String(fdcId),
    name: tidyName(description),
    ...(brand ? { brand: tidyName(brand) } : {}),
    ...(pack ? { quantity: pack } : {}),
    ...(serving ? { serving } : {}),
    per100: parseUsdaNutrients(f.foodNutrients, usdaType),
    ...(perMl ? { perMl: true } : {}),
    categories,
    ...(Number.isFinite(modified) ? { lastModified: modified } : {}),
    usdaType,
  };
}

export type UsdaSearchResult = { kind: 'ok'; foods: UsdaFood[] } | { kind: 'error'; reason: 'offline' | 'busy' | 'rateLimit' | 'badKey' | 'other' };

export function searchUrl(query: string, kind: UsdaKind, pageSize: number, apiKey: string): string {
  const types = kind === 'generic' ? GENERIC_TYPES : kind === 'branded' ? ['Branded'] : [...GENERIC_TYPES, 'Branded'];
  const params = new URLSearchParams({ api_key: apiKey || DEMO_KEY, query, dataType: types.join(','), pageSize: String(pageSize) });
  return `${USDA_API}/foods/search?${params.toString()}`;
}

/** Search FoodData Central by name. Sends only the query (and the key). */
export async function searchUsda(
  query: string,
  opts: { apiKey?: string; kind?: UsdaKind; pageSize?: number; fetchImpl?: typeof fetch } = {},
): Promise<UsdaSearchResult> {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  let res: Response;
  try {
    // A plain GET: no custom headers, so no CORS preflight (which would fail without detail on a rate limit).
    res = await fetchImpl(searchUrl(query, opts.kind ?? 'all', opts.pageSize ?? 25, opts.apiKey ?? ''));
  } catch {
    return { kind: 'error', reason: 'offline' };
  }
  if (res.status === 429) return { kind: 'error', reason: 'rateLimit' };
  if (res.status === 401 || res.status === 403) return { kind: 'error', reason: 'badKey' };
  if (res.status >= 500) return { kind: 'error', reason: 'busy' };
  if (!res.ok) return { kind: 'error', reason: 'other' };
  try {
    const body = (await res.json()) as { foods?: unknown };
    const foods = (Array.isArray(body.foods) ? body.foods : []).map(parseUsdaFood).filter((f): f is UsdaFood => !!f);
    return { kind: 'ok', foods };
  } catch {
    return { kind: 'error', reason: 'other' };
  }
}

/**
 * USDA food categories (SR Legacy and Foundation) → BLS main group, for the group-based iron rules
 * (meat, fish and poultry; phytate from bread, cereals, legumes) when no similar BLS food is
 * chosen. Only unambiguous categories; the rest get no group.
 */
const CATEGORY_GROUPS: Readonly<Record<string, string>> = {
  'Baked Products': 'B',
  'Cereal Grains and Pasta': 'C',
  'Breakfast Cereals': 'C',
  'Fruits and Fruit Juices': 'F',
  'Vegetables and Vegetable Products': 'G',
  'Legumes and Legume Products': 'H',
  'Nut and Seed Products': 'H',
  'Fats and Oils': 'Q',
  'Spices and Herbs': 'R',
  'Sweets': 'S',
  'Finfish and Shellfish Products': 'T',
  'Beef Products': 'U',
  'Pork Products': 'U',
  'Lamb, Veal, and Game Products': 'U',
  'Poultry Products': 'V',
  'Sausages and Luncheon Meats': 'W',
};

/** The BLS main group for a USDA food's category, or '' if there is no clear one. */
export const usdaGroup = (categories: readonly string[]): string => CATEGORY_GROUPS[categories[0] ?? ''] ?? '';

/** Generic foods first (they carry full nutrient data), each group in the API's relevance order. */
export function genericFirst(foods: readonly UsdaFood[]): UsdaFood[] {
  return [...foods.filter((f) => f.usdaType !== 'Branded'), ...foods.filter((f) => f.usdaType === 'Branded')];
}
