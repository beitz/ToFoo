/**
 * Finding the BLS food most similar to a product, whose vitamins and minerals fill what the label
 * lacks (pure, tested in productMatch.test.ts). Each query (the product name, its most specific
 * categories) scores BLS names loosely; a food that fits several of them wins, so "Rolled oats"
 * plus "Bio Haferflocken" lands on Oat flakes rather than on sweetened cereal flakes.
 */
import type { RawValue } from '../model/types';
import type { Product } from '../storage/types';
import type { Food, FoodDb } from './foodDb';
import { hasOwnMicros } from './products';
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

function cleanQuery(text: string, drop: ReadonlySet<string>): string {
  // "Milch 1,5%" → "milch 1.5", which BLS writes as "1.5 % fat"; other numbers (pack sizes, "No. 5") say nothing.
  return normalize(text.replace(/(\d),(\d)/g, '$1.$2').replace(/%/g, ' '))
    .split(' ')
    .filter((w) => (w.length > 1 && !NOISE.has(w) && !drop.has(w) && !/^[0-9.]+$/.test(w)) || /^\d+\.\d+$/.test(w))
    .join(' ');
}

const amount = (v: RawValue | undefined) => (typeof v === 'number' ? v : v === 't' ? 0 : undefined);

/** How alike two foods are in fat, protein and carbohydrate (0–1); 1 when fewer than two can be compared. */
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
  return n < 2 || sum === 0 ? 1 : 1 - diff / sum;
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
  const groupBoost = dish ? (key: string) => ('XY'.includes(key.charAt(0)) ? 1 : (boost?.(key) ?? 1)) : boost;
  const total = new Map<string, number>();
  for (const [q, weight] of queries) {
    const n = q.split(' ').filter(Boolean).length;
    if (!n) continue;
    for (const r of looseSearch(index, q, { limit: PER_QUERY, rare: true, ...(groupBoost ? { boost: groupBoost } : {}) })) {
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
): Array<{ id: string; match: { version: string; code: string } }> {
  return products.flatMap((p) => {
    if (!wantsAutoMatch(p)) return [];
    const code = bestMatch(p, index, foods, boost);
    return code && code !== p.match?.code ? [{ id: p.id, match: { version: foods.version, code } }] : [];
  });
}

/**
 * The similar food while a product is being logged or edited. `food` undefined means none:
 * `auto` then says whether the app found nothing (true) or the user chose "label values only".
 */
export interface MatchChoice {
  food?: Food;
  auto: boolean;
}

/** Start from the saved choice, else the app's pick. */
export function initialChoice(product: Product, foods: Pick<FoodDb, 'byCode'>, index: SearchIndex, boost?: (key: string) => number): MatchChoice {
  if (product.match) {
    const food = foods.byCode.get(product.match.code);
    return food ? { food, auto: !!product.match.auto } : { auto: true };
  }
  if (product.labelOnly || hasOwnMicros(product)) return { auto: !product.labelOnly };
  const code = bestMatch(product, index, foods, boost);
  const food = code ? foods.byCode.get(code) : undefined;
  return food ? { food, auto: true } : { auto: true };
}

/** The product as it will be saved with this choice. */
export function withChoice(product: Product, choice: MatchChoice, version: string): Product {
  const { match: _m, labelOnly: _l, ...rest } = product;
  if (choice.food) return { ...rest, match: { version, code: choice.food.code, ...(choice.auto ? { auto: true as const } : {}) } };
  return choice.auto ? rest : { ...rest, labelOnly: true };
}
