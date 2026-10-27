/**
 * Finding the BLS food most similar to a product, whose vitamins and minerals fill what the label
 * lacks (pure, tested in productMatch.test.ts). Each query (the product name, its most specific
 * categories) scores BLS names loosely; a food that fits several of them wins, so "Rolled oats"
 * plus "Bio Haferflocken" lands on Oat flakes rather than on sweetened cereal flakes.
 */
import type { RawValue } from '../model/types';
import type { MixPart, Product } from '../storage/types';
import type { Food, FoodDb } from './foodDb';
import { ingredientFoods } from './ingredientFoods';
import { hasOwnMicros, labelValues, mixedFood } from './products';
import { looseSearch, normalize, type SearchIndex } from './search';

/** Words that say nothing about which food it is. */
const NOISE = new Set(
  'and with of the in for from to or a an bio organic eco oko based plant plants foods food products product snacks sweet salty groceries meals dishes other miscellaneous varied original classic premium mit und von aus der die das zart fein extra frozen tiefkuhl'.split(' '),
);

/** How much each query counts: the product name, then categories from the most specific one. */
const NAME_WEIGHT = 0.9;
/** A dish's name says more than its categories ("Meals with chicken" fits chicken fat too). */
const DISH_NAME_WEIGHT = 2;
const CATEGORY_WEIGHTS = [1, 0.7, 0.5, 0.35];
/** Perfect score of one query word (an exact first-word hit, see search.ts tokenScore). */
const WORD_SCORE = 12;
/** Below this the best candidate is a guess too wild to use without asking. */
const MIN_SCORE = 0.6;
/** Candidates per query: enough for a fitting dish to show up among many foods sharing one word. */
const PER_QUERY = 40;
/**
 * Fat, protein and carbohydrate per 100 g of the label against each candidate: a name that fits
 * but a make-up that doesn't ("Butter chicken" vs chicken fat, 100 g fat against 7 g) is no
 * similar food. Similarity is 1 − Σ|a − b| / Σ(a + b) over the three; at or above FIT it costs
 * nothing, below it the score falls with its square. Tuned by feel on real products.
 */
const MACROS = ['FAT', 'PROT625', 'CHO'] as const;
const FIT = 0.75;
/** Categories that make a product a dish, so BLS dishes (groups X, Y) are not pushed back. */
const DISH = /\b(meals?|dishes|soups?|stews?|pizzas?|lasagnas?|salads?|sandwiches)\b/i;
/**
 * Categories of beer, wine and spirits: only BLS alcoholic drinks (group P, alcohol-free beer
 * included) can stand for them, so "Helles" or "Beers" never lands on beer ham or Bierwurst
 * (ginger and root beer are soft drinks).
 */
const ALCOHOLIC = /^(?!(ginger|root) beer)(alcoholic beverages|(\S+ )*beers?|(\S+ )*wines?|spirits|liqueurs)$/i;

function cleanQuery(text: string, drop: ReadonlySet<string>): string {
  // "Milch 1,5%" → "milch 1.5", which BLS writes as "1.5 % fat"; other numbers (pack sizes, "No. 5") say nothing.
  return normalize(text.replace(/(\d),(\d)/g, '$1.$2').replace(/%/g, ' '))
    .split(' ')
    .filter((w) => (w.length > 1 && !NOISE.has(w) && !drop.has(w) && !/^[0-9.]+$/.test(w)) || /^\d+\.\d+$/.test(w))
    .join(' ');
}

const amount = (v: RawValue | undefined) => (typeof v === 'number' ? v : v === 't' ? 0 : undefined);

const closeness = (x: number, y: number) => (x + y === 0 ? 1 : 1 - Math.abs(x - y) / (x + y));

/**
 * How alike two foods are in fat, protein and carbohydrate (0–1). With fewer than two of them on
 * both, energy decides instead (a beer label giving only kcal and carbohydrate is no sausage);
 * 1 when that is missing too.
 */
export function macroSimilarity(a: Readonly<Record<string, RawValue>>, b: Readonly<Record<string, RawValue>>): number {
  let diff = 0;
  let sum = 0;
  let n = 0;
  for (const id of MACROS) {
    const x = amount(a[id]);
    const y = amount(b[id]);
    if (x === undefined || y === undefined) continue;
    diff += Math.abs(x - y);
    sum += x + y;
    n++;
  }
  if (n >= 2) return sum === 0 ? 1 : 1 - diff / sum;
  const x = amount(a.ENERCC);
  const y = amount(b.ENERCC);
  return x === undefined || y === undefined ? 1 : closeness(x, y);
}

type MatchInput = Pick<Product, 'name' | 'brand' | 'categories'> & Partial<Pick<Product, 'per100'>>;

/** Candidate BLS codes for a product, best first, with a 0–1+ score. */
export function rankMatches(
  product: MatchInput,
  index: SearchIndex,
  foods: Pick<FoodDb, 'byCode'>,
  boost?: (key: string) => number,
): Array<{ key: string; score: number }> {
  const brandWords = new Set(normalize(product.brand ?? '').split(' ').filter(Boolean));
  const dish = product.categories.some((c) => DISH.test(c));
  const queries: Array<[string, number]> = [[cleanQuery(product.name, brandWords), dish ? DISH_NAME_WEIGHT : NAME_WEIGHT]];
  // The same words twice ("Meals with chicken", "Chicken meals") would count twice for plain chicken.
  const seen = new Set(queries.map(([q]) => q));
  for (const c of [...product.categories].reverse()) {
    const q = cleanQuery(c, brandWords);
    const w = CATEGORY_WEIGHTS[queries.length - 1];
    if (!w) break;
    if (!q || seen.has(q)) continue;
    seen.add(q);
    queries.push([q, w]);
  }
  const alcoholic = product.categories.some((c) => ALCOHOLIC.test(c));
  const groupBoost = alcoholic
    ? (key: string) => (key.charAt(0) === 'P' ? 1 : 0)
    : dish
      ? (key: string) => ('XY'.includes(key.charAt(0)) ? 1 : (boost?.(key) ?? 1))
      : boost;
  const total = new Map<string, number>();
  for (const [q, weight] of queries) {
    const n = q.split(' ').filter(Boolean).length;
    if (!n) continue;
    for (const r of looseSearch(index, q, { limit: PER_QUERY, rare: true, ...(groupBoost ? { boost: groupBoost } : {}) })) {
      if (!r.score) continue;
      total.set(r.key, (total.get(r.key) ?? 0) + (weight * r.score) / (WORD_SCORE * n));
    }
  }
  const label = product.per100;
  return [...total]
    .map(([key, score]) => {
      const food = label && foods.byCode.get(key);
      const fit = food ? Math.min(1, macroSimilarity(label, food.per100) / FIT) : 1;
      return { key, score: score * fit * fit };
    })
    .sort((a, b) => b.score - a.score);
}

/** The BLS food the app picks by itself, or undefined when nothing fits well enough. */
export function bestMatch(product: MatchInput, index: SearchIndex, foods: Pick<FoodDb, 'byCode'>, boost?: (key: string) => number): string | undefined {
  const top = rankMatches(product, index, foods, boost)[0];
  return top && top.score >= MIN_SCORE ? top.key : undefined;
}

/** Share of the ingredient list (by weight) the mix must know, so the unknown rest stays small. */
const MIX_COVERED = 0.7;

/**
 * A product built from its ingredient list: each ingredient Open Food Facts recognised and
 * src/foods/ingredientFoods.ts knows becomes its BLS food at its share of the pack, the shares of
 * the known ones scaled up to 100 %. Rice, pasta and pulses come raw or cooked, whichever brings the
 * mix's energy closer to the label (biggest first): "Reis 42 %" in a meal with 144 kcal is cooked
 * rice. Undefined when less than 70 % of the list is known, or the mix's fat, protein and
 * carbohydrate do not fit the label.
 */
export function ingredientMix(product: Pick<Product, 'ingredients' | 'per100'>, foods: Pick<FoodDb, 'byCode'>): MixPart[] | undefined {
  const list = (product.ingredients ?? []).filter((i) => i.percent > 0);
  const all = list.reduce((a, i) => a + i.percent, 0);
  const known = list.flatMap((i) => {
    const pair = ingredientFoods(i.id);
    return pair && pair.every((c) => foods.byCode.has(c)) ? [{ pair, percent: i.percent, cooked: false }] : [];
  });
  const sum = known.reduce((a, i) => a + i.percent, 0);
  if (!all || sum / all < MIX_COVERED) return undefined;
  const kcal = (code: string) => amount(foods.byCode.get(code)!.per100.ENERCC) ?? 0;
  const energy = () => known.reduce((a, i) => a + (kcal(i.pair[i.cooked ? 1 : 0]) * i.percent) / sum, 0);
  const target = product.per100.ENERCC;
  for (const i of [...known].sort((a, b) => b.percent - a.percent)) {
    if (i.pair[0] === i.pair[1]) continue;
    if (target === undefined) {
      // Without the label's energy, a ready meal is eaten as sold: cooked.
      i.cooked = true;
      continue;
    }
    const before = Math.abs(energy() - target);
    i.cooked = true;
    if (Math.abs(energy() - target) >= before) i.cooked = false;
  }
  const byCode = new Map<string, number>();
  for (const i of known) {
    const code = i.pair[i.cooked ? 1 : 0];
    byCode.set(code, (byCode.get(code) ?? 0) + (i.percent / sum) * 100);
  }
  const parts = [...byCode].map(([code, share]) => ({ code, share: Math.round(share * 10) / 10 })).filter((p) => p.share > 0);
  parts.sort((a, b) => b.share - a.share);
  const mix = mixedFood(parts, foods);
  return mix && macroSimilarity(product.per100, mix.per100) >= FIT ? parts : undefined;
}

/** For showing a mix: each part with the ingredients it stands for, and what the mix left out (as percent of the list). */
export function mixDetail(
  product: Pick<Product, 'ingredients'>,
  parts: readonly MixPart[],
): { rows: Array<MixPart & { texts: string[] }>; leftOut: { texts: string[]; percent: number } } {
  const list = product.ingredients ?? [];
  const all = list.reduce((a, i) => a + i.percent, 0);
  const rows = parts.map((p) => ({ ...p, texts: list.filter((i) => ingredientFoods(i.id)?.includes(p.code)).map((i) => i.text) }));
  const out = list.filter((i) => !ingredientFoods(i.id));
  const percent = all ? (out.reduce((a, i) => a + i.percent, 0) / all) * 100 : 0;
  return { rows, leftOut: { texts: out.map((i) => i.text), percent } };
}

/** A pairing as the app works it out: one similar food, or a ready meal's BLS foods by share (`code` = the biggest). */
export type Pairing = { code: string; parts?: MixPart[] };

/**
 * What the app pairs a product with by itself: the mix from its ingredient list for a dish (or
 * when no single food fits as well), else the best single food; undefined when neither fits.
 */
export function bestPairing(product: MatchInput & Pick<Product, 'ingredients'>, index: SearchIndex, foods: Pick<FoodDb, 'byCode'>, boost?: (key: string) => number): Pairing | undefined {
  const code = bestMatch(product, index, foods, boost);
  const label = product.per100;
  const parts = label ? ingredientMix({ ingredients: product.ingredients, per100: label }, foods) : undefined;
  if (parts) {
    const dish = product.categories.some((c) => DISH.test(c));
    const single = code && label ? macroSimilarity(label, foods.byCode.get(code)!.per100) : 0;
    const mix = macroSimilarity(label!, mixedFood(parts, foods)!.per100);
    if (dish || mix > single) return { code: parts[0]!.code, parts };
  }
  return code ? { code } : undefined;
}

/** The food a product borrows from: the mix from its ingredients, or its one similar food. */
export function pairedFood(match: Pick<NonNullable<Product['match']>, 'code' | 'parts'>, foods: Pick<FoodDb, 'byCode'>): Food | undefined {
  return match.parts ? mixedFood(match.parts, foods) : foods.byCode.get(match.code);
}

/**
 * How well a product's label fits the food it borrows from (0–1, as macroSimilarity), undefined
 * without one; below `GOOD_FIT` the pairing is worth a second look (the check list in Settings).
 */
export function labelFit(product: Pick<Product, 'source' | 'per100' | 'match'>, foods: Pick<FoodDb, 'byCode'>): number | undefined {
  const food = product.match && pairedFood(product.match, foods);
  return food ? macroSimilarity(labelValues(product), food.per100) : undefined;
}
export const GOOD_FIT = FIT;

const sameParts = (a?: readonly MixPart[], b?: readonly MixPart[]) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Products the app pairs by itself: no similar food yet or only its own unchecked pick (so a
 * better matcher replaces its old guesses), "label only" not chosen, not a USDA generic food.
 */
export const wantsAutoMatch = (p: Product) => (!p.match || !!p.match.auto) && !p.labelOnly && !hasOwnMicros(p);

/** The app's picks for every product that wants one and has a close enough BLS food, where they change something. */
export function autoMatches(
  products: readonly Product[],
  index: SearchIndex,
  foods: Pick<FoodDb, 'byCode' | 'version'>,
  boost?: (key: string) => number,
): Array<{ id: string; match: NonNullable<Product['match']> }> {
  return products.flatMap((p) => {
    if (!wantsAutoMatch(p)) return [];
    const pick = bestPairing(p, index, foods, boost);
    if (!pick || (pick.code === p.match?.code && sameParts(pick.parts, p.match?.parts))) return [];
    return [{ id: p.id, match: { version: foods.version, ...pick } }];
  });
}

/**
 * The similar food while a product is being logged or edited. `food` undefined means none:
 * `auto` then says whether the app found nothing (true) or the user chose "label values only".
 * With `parts`, the product is built from its ingredients and `food` is the biggest of them.
 */
export interface MatchChoice {
  food?: Food;
  parts?: MixPart[];
  auto: boolean;
}

function choiceOf(pick: Pairing | undefined, foods: Pick<FoodDb, 'byCode'>, auto: boolean): MatchChoice {
  const food = pick ? foods.byCode.get(pick.code) : undefined;
  return food ? { food, ...(pick?.parts ? { parts: pick.parts } : {}), auto } : { auto: true };
}

/** Start from the saved choice, else the app's pick. */
export function initialChoice(product: Product, foods: Pick<FoodDb, 'byCode'>, index: SearchIndex, boost?: (key: string) => number): MatchChoice {
  if (product.match) return choiceOf(product.match, foods, !!product.match.auto);
  if (product.labelOnly || hasOwnMicros(product)) return { auto: !product.labelOnly };
  return choiceOf(bestPairing(product, index, foods, boost), foods, true);
}

/** The product as it will be saved with this choice. */
export function withChoice(product: Product, choice: MatchChoice, version: string): Product {
  const { match: _m, labelOnly: _l, ...rest } = product;
  if (choice.food) return { ...rest, match: { version, code: choice.food.code, ...(choice.parts ? { parts: choice.parts } : {}), ...(choice.auto ? { auto: true as const } : {}) } };
  return choice.auto ? rest : { ...rest, labelOnly: true };
}
