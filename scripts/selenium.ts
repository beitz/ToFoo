/**
 * Selenium for BLS foods, estimated from the UK table CoFID (BLS 4.0 has no selenium).
 *
 * Each BLS food is paired with the CoFID food that is most alike: same kind of food (food group),
 * similar nutrient make-up (protein, fat, minerals, B vitamins…) and similar name. Its selenium is
 * then scaled by the protein ratio, because selenium in food sits almost entirely in protein (as
 * selenomethionine and selenocysteine; EFSA NDA Panel 2014, DRVs for selenium), so a cooked or drier
 * version of a food has more selenium per 100 g in step with its protein.
 *
 * The weights below are not physiological numbers: they steer a search and were tuned by checking
 * how well the same method predicts nutrients that both tables have (zinc, phosphorus…) — see
 * `scripts/selenium-check.ts` and data/README.md for the results. Pure functions, no file access.
 */
import type { BlsRawValue } from '../src/foods/blsTypes';

/** A CoFID value: per 100 g, "t" for trace, null when not measured ("N") or empty. */
export type CofidValue = number | 't' | null;

export interface CofidFood {
  code: string;
  name: string;
  /** CoFID food group code, e.g. "MAC" (beef). The first letter is the main group. */
  group: string;
  values: Record<string, CofidValue>;
}

export interface BlsFoodLike {
  code: string;
  nameEn: string;
  per100: Record<string, BlsRawValue>;
}

interface ProfileNutrient {
  bls: string;
  cofid: string;
  /** CoFID unit → BLS unit. */
  factor: number;
  /** Added to both sides before comparing, in BLS units: differences below about this size don't count. */
  floor: number;
}

/** Nutrients both tables have, used to tell how alike two foods are. */
export const PROFILE: readonly ProfileNutrient[] = [
  { bls: 'WATER', cofid: 'WATER', factor: 1, floor: 2 },
  { bls: 'PROT625', cofid: 'PROT', factor: 1, floor: 0.5 },
  { bls: 'FAT', cofid: 'FAT', factor: 1, floor: 0.5 },
  { bls: 'CHO', cofid: 'CHO', factor: 1, floor: 0.5 },
  { bls: 'FIBT', cofid: 'AOACFIB', factor: 1, floor: 0.5 },
  { bls: 'NA', cofid: 'NA', factor: 1, floor: 10 },
  { bls: 'K', cofid: 'K', factor: 1, floor: 20 },
  { bls: 'CA', cofid: 'CA', factor: 1, floor: 10 },
  { bls: 'MG', cofid: 'MG', factor: 1, floor: 5 },
  { bls: 'P', cofid: 'P', factor: 1, floor: 10 },
  { bls: 'FE', cofid: 'FE', factor: 1, floor: 0.2 },
  { bls: 'ZN', cofid: 'ZN', factor: 1, floor: 0.2 },
  { bls: 'CU', cofid: 'CU', factor: 1000, floor: 30 },
  { bls: 'MN', cofid: 'MN', factor: 1000, floor: 50 },
  { bls: 'THIA', cofid: 'THIA', factor: 1, floor: 0.02 },
  { bls: 'RIBF', cofid: 'RIBO', factor: 1, floor: 0.02 },
  { bls: 'NIA', cofid: 'NIAC', factor: 1, floor: 0.2 },
  { bls: 'VITB6', cofid: 'VITB6', factor: 1000, floor: 20 },
  { bls: 'VITB12', cofid: 'VITB12', factor: 1, floor: 0.1 },
  { bls: 'FOL', cofid: 'FOLT', factor: 1, floor: 5 },
  { bls: 'PANTAC', cofid: 'PANTO', factor: 1, floor: 0.1 },
  { bls: 'VITC', cofid: 'VITC', factor: 1, floor: 1 },
];

export const MATCH = {
  /** How much a fully matching name lowers the cost (cost = profile distance − nameWeight × name similarity). */
  nameWeight: 0.6,
  /** Fewer shared nutrients than this and two foods are not compared. */
  minShared: 6,
  /** Pairs costing more than this are too unlike: the BLS food keeps no selenium value. */
  maxCost: 1,
  /** Below this much protein (g/100 g) on either side, scale by dry matter instead of protein. */
  minProteinG: 1,
  /** Scale factors are kept within [1 / maxScale, maxScale]. */
  maxScale: 2,
};

/**
 * CoFID main groups (first letter) a BLS food may be paired with, by the BLS main group letter.
 * CoFID: A cereals, B milk, C eggs, D vegetables, F fruit, G nuts and seeds, H herbs and spices,
 * J fish, M meat, O fats, P drinks, Q alcoholic drinks, S sugars and sweets, W soups, sauces, misc.
 * Composite dishes (X, Y) may match anything but drinks.
 */
export const GROUPS: Record<string, string> = {
  B: 'A',
  C: 'A',
  D: 'A',
  E: 'CA',
  F: 'F',
  G: 'D',
  H: 'DGBAW',
  K: 'D',
  M: 'B',
  N: 'PFB',
  P: 'Q',
  Q: 'OB',
  R: 'HWSDOG',
  S: 'SBAG',
  T: 'J',
  U: 'M',
  V: 'M',
  W: 'M',
  X: 'ABCDFGHJMOSW',
  Y: 'ABCDFGHJMOSW',
};

const STOP = new Set([
  'and', 'with', 'in', 'of', 'the', 'a', 'or', 'from', 'for', 'to', 'on', 'type', 'average', 'eg', 'flesh', 'only', 'min',
]);

export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** Words that say how a food was prepared, not what it is: they count less when comparing names. */
const PREPARATION = new Set([
  'raw', 'boiled', 'fried', 'baked', 'grilled', 'roasted', 'stewed', 'steamed', 'braised', 'cooked', 'dried', 'canned',
  'smoked', 'frozen', 'deep', 'drained', 'salted', 'unsalted', 'water', 'oil', 'fat', 'without', 'homemade', 'retail',
  'fresh', 'whole', 'pan', 'oven', 're', 'heated', 'microwaved', 'casseroled', 'poached', 'toasted',
]);

/**
 * How alike two names are by their words, 0…1: mostly "how much of the BLS name is in the CoFID
 * name", so CoFID's longer names ("Salmon, farmed, flesh only, raw") aren't punished. BLS English
 * names start with the food itself ("Salmon steaks fried"), so the first word counts double and
 * preparation words count less.
 */
export function nameSimilarity(bls: readonly string[], cofid: readonly string[]): number {
  if (!bls.length || !cofid.length) return 0;
  const sb = new Set(cofid);
  let total = 0;
  let found = 0;
  const seen = new Set<string>();
  bls.forEach((w, i) => {
    if (seen.has(w)) return;
    seen.add(w);
    const weight = (PREPARATION.has(w) ? 0.3 : 1) * (i === 0 ? 2 : 1);
    total += weight;
    if (sb.has(w)) found += weight;
  });
  return found / total;
}

const num = (v: BlsRawValue | CofidValue | undefined): number | null => (v === 't' ? 0 : typeof v === 'number' ? v : null);

/** Mean absolute log ratio over the nutrients both foods have (0 = identical make-up). */
export function profileDistance(bls: BlsFoodLike, cofid: CofidFood, exclude?: string): { distance: number; shared: number } {
  let sum = 0;
  let shared = 0;
  for (const p of PROFILE) {
    if (p.bls === exclude) continue;
    const a = num(bls.per100[p.bls]);
    const c = num(cofid.values[p.cofid]);
    if (a === null || c === null) continue;
    sum += Math.abs(Math.log((a + p.floor) / (c * p.factor + p.floor)));
    shared++;
  }
  return { distance: shared ? sum / shared : Infinity, shared };
}

/** "Weighed with bone/stones/skin" entries are as-bought weights, not edible portions: never matched. */
export function isEdiblePortion(f: CofidFood): boolean {
  return !/weighed with/i.test(f.name);
}

export interface Prepared {
  food: CofidFood;
  words: string[];
}

export function prepare(cofid: readonly CofidFood[], target: { cofid: string }): Prepared[] {
  return cofid
    .filter((f) => isEdiblePortion(f) && num(f.values[target.cofid]) !== null)
    .map((food) => ({ food, words: tokens(food.name) }));
}

export interface Match {
  cofid: CofidFood;
  cost: number;
}

export function bestMatch(bls: BlsFoodLike, candidates: readonly Prepared[], exclude?: string): Match | undefined {
  const allowed = GROUPS[bls.code.charAt(0)] ?? '';
  const words = tokens(bls.nameEn);
  let best: Match | undefined;
  for (const c of candidates) {
    if (!allowed.includes(c.food.group.charAt(0))) continue;
    const { distance, shared } = profileDistance(bls, c.food, exclude);
    if (shared < MATCH.minShared) continue;
    const cost = distance - MATCH.nameWeight * nameSimilarity(words, c.words);
    if (!best || cost < best.cost) best = { cofid: c.food, cost };
  }
  return best && best.cost <= MATCH.maxCost ? best : undefined;
}

/** How much more (or less) of the target the BLS food has than its CoFID match: protein ratio, else dry-matter ratio. */
export function scaleFactor(bls: BlsFoodLike, cofid: CofidFood): number {
  const clamp = (x: number) => Math.min(MATCH.maxScale, Math.max(1 / MATCH.maxScale, x));
  const pb = num(bls.per100.PROT625);
  const pc = num(cofid.values.PROT);
  if (pb !== null && pc !== null && pb >= MATCH.minProteinG && pc >= MATCH.minProteinG) return clamp(pb / pc);
  const wb = num(bls.per100.WATER);
  const wc = num(cofid.values.WATER);
  if (wb !== null && wc !== null && wb < 100 && wc < 100) return clamp((100 - wb) / (100 - wc));
  return 1;
}

/** The target nutrient (default selenium) for one BLS food from its match, rounded like the tables. */
export function estimateFrom(bls: BlsFoodLike, cofid: CofidFood, target: { cofid: string; factor: number } = SELENIUM): BlsRawValue {
  const v = cofid.values[target.cofid];
  if (v === 't') return 't';
  if (typeof v !== 'number') return null;
  const x = v * target.factor * scaleFactor(bls, cofid);
  return Math.round(x * 10) / 10;
}

export const SELENIUM = { cofid: 'SE', factor: 1 } as const;
