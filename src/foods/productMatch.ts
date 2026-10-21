/**
 * Finding the BLS food most similar to a product, whose vitamins and minerals fill what the label
 * lacks (pure, tested in productMatch.test.ts). Each query (the product name, its most specific
 * categories) scores BLS names loosely; a food that fits several of them wins, so "Rolled oats"
 * plus "Bio Haferflocken" lands on Oat flakes rather than on sweetened cereal flakes.
 */
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
const CATEGORY_WEIGHTS = [1, 0.7, 0.5, 0.35];
/** Perfect score of one query word (an exact first-word hit, see search.ts tokenScore). */
const WORD_SCORE = 12;
/** Below this the best candidate is a guess too wild to use without asking. */
const MIN_SCORE = 0.6;

function cleanQuery(text: string, drop: ReadonlySet<string>): string {
  // "Milch 1,5%" → "milch 1.5", which BLS writes as "1.5 % fat"; other numbers (pack sizes, "No. 5") say nothing.
  return normalize(text.replace(/(\d),(\d)/g, '$1.$2').replace(/%/g, ' '))
    .split(' ')
    .filter((w) => (w.length > 1 && !NOISE.has(w) && !drop.has(w) && !/^[0-9.]+$/.test(w)) || /^\d+\.\d+$/.test(w))
    .join(' ');
}

/** Candidate BLS codes for a product, best first, with a 0–1+ score. */
export function rankMatches(
  product: Pick<Product, 'name' | 'brand' | 'categories'>,
  index: SearchIndex,
  boost?: (key: string) => number,
): Array<{ key: string; score: number }> {
  const brandWords = new Set(normalize(product.brand ?? '').split(' ').filter(Boolean));
  const queries: Array<[string, number]> = [[cleanQuery(product.name, brandWords), NAME_WEIGHT]];
  [...product.categories].reverse().forEach((c, i) => {
    const w = CATEGORY_WEIGHTS[i];
    if (w) queries.push([cleanQuery(c, brandWords), w]);
  });
  const total = new Map<string, number>();
  for (const [q, weight] of queries) {
    const n = q.split(' ').filter(Boolean).length;
    if (!n) continue;
    for (const r of looseSearch(index, q, { limit: 25, ...(boost ? { boost } : {}) })) total.set(r.key, (total.get(r.key) ?? 0) + (weight * r.score) / (WORD_SCORE * n));
  }
  return [...total].map(([key, score]) => ({ key, score })).sort((a, b) => b.score - a.score);
}

/** The BLS food the app picks by itself, or undefined when nothing fits well enough. */
export function bestMatch(product: Pick<Product, 'name' | 'brand' | 'categories'>, index: SearchIndex, boost?: (key: string) => number): string | undefined {
  const top = rankMatches(product, index, boost)[0];
  return top && top.score >= MIN_SCORE ? top.key : undefined;
}

/** Products the app pairs by itself: no similar food yet, "label only" not chosen, not a USDA generic food. */
export const wantsAutoMatch = (p: Product) => !p.match && !p.labelOnly && !hasOwnMicros(p);

/** The app's picks for every product that wants one and has a close enough BLS food. */
export function autoMatches(products: readonly Product[], index: SearchIndex, version: string, boost?: (key: string) => number): Array<{ id: string; match: { version: string; code: string } }> {
  return products.flatMap((p) => {
    if (!wantsAutoMatch(p)) return [];
    const code = bestMatch(p, index, boost);
    return code ? [{ id: p.id, match: { version, code } }] : [];
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
  const code = bestMatch(product, index, boost);
  const food = code ? foods.byCode.get(code) : undefined;
  return food ? { food, auto: true } : { auto: true };
}

/** The product as it will be saved with this choice. */
export function withChoice(product: Product, choice: MatchChoice, version: string): Product {
  const { match: _m, labelOnly: _l, ...rest } = product;
  if (choice.food) return { ...rest, match: { version, code: choice.food.code, ...(choice.auto ? { auto: true as const } : {}) } };
  return choice.auto ? rest : { ...rest, labelOnly: true };
}
