/**
 * "Next to cook" on Home (owner's rule, 2026-10-22): only dishes that really help, at most three.
 * A dish helps when one portion lifts a nutrient that is low or a bit low by at least
 * MIN_LIFT_POINTS of its average over the window, and pushes no limit over its maximum. Ready
 * portions in the fridge or freezer count too. With one recipe in the book, it is not shown just
 * because it is the only one. Pure (tested in nextToCook.test.ts).
 */
import type { NutrientResult } from '../model/simulate';
import { checkPortion, type PortionShare } from './recipeIdeas';

/** Points of the window average one portion must add to a gap (owner's decision, not physiology). */
export const MIN_LIFT_POINTS = 5;
/** A limit counts as pushed over only when the portion adds at least this many points to it. */
const LIMIT_NOISE_POINTS = 1;
export const MAX_SHOWN = 3;

type Status = Pick<NutrientResult, 'status' | 'kind' | 'value' | 'limit'>;
type Portion = { intake: Readonly<Record<string, number>>; missing: readonly string[] };

export interface CookOption<T> {
  item: T;
  /** The gaps it lifts enough, biggest share first: shares of a day's need from one portion. */
  helps: PortionShare[];
  score: number;
}

const GAP_WEIGHT = { low: 2, gettingLow: 1 } as const;

/** Points a portion adds to a window average: its share of one day spread over the window, in percent. */
export const liftPoints = (share: number, windowDays: number) => (share * 100) / Math.max(1, windowDays);

/**
 * The dishes worth cooking or eating next, best first: weighted by how many gaps they lift (low
 * counts double), then by how much. Dishes that would push a limit over its maximum are left out.
 */
export function nextToCook<T>(
  items: readonly T[],
  portion: (item: T) => Portion,
  nutrients: ReadonlyMap<string, Status>,
  req: Parameters<typeof checkPortion>[2],
  windowDays: number,
  max = MAX_SHOWN,
): Array<CookOption<T>> {
  const out: Array<CookOption<T>> = [];
  for (const item of items) {
    const p = portion(item);
    const check = checkPortion(p, nutrients, req);
    const helps = check.gaps.filter((g) => liftPoints(g.share, windowDays) >= MIN_LIFT_POINTS).sort((a, b) => b.share - a.share);
    if (helps.length === 0) continue;
    if (pushesLimit(p, nutrients, windowDays)) continue;
    const score = helps.reduce((s, g) => s + GAP_WEIGHT[check.gaps.find((x) => x.id === g.id)!.status] * Math.min(1, g.share), 0);
    out.push({ item, helps, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Whether one portion takes a limit line (salt, saturated fat, sugar, an own maximum) over 100 %. */
function pushesLimit(p: Portion, nutrients: ReadonlyMap<string, Status>, windowDays: number): boolean {
  for (const [id, r] of nutrients) {
    if (r.kind !== 'limit' || !(r.limit! > 0)) continue;
    const added = liftPoints((p.intake[id] ?? 0) / r.limit!, windowDays);
    if (added >= LIMIT_NOISE_POINTS && r.value.central * 100 + added > 100) return true;
  }
  return false;
}
