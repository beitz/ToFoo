/** Pure: how Home groups the nutrient list (by status, by kind of nutrient, or not at all). */
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { GaugeStatus, NutrientResult } from '../../model/simulate';
import { urgencyRank } from '../../ui/status';

export type HomeGrouping = 'status' | 'type' | 'none';

export interface NutrientGroup {
  /** Stable key for the collapsed state, e.g. 'status:low' or 'type:vitamins'. */
  key: string;
  /** i18n suffix: status id or type id. */
  id: string;
  items: NutrientResult[];
}

/** Collapsed unless the user opened them: the groups that need no action. */
export const COLLAPSED_BY_DEFAULT = new Set(['status:fine', 'status:info']);

const STATUS_ORDER: GaugeStatus[] = ['tooHigh', 'low', 'gettingLow', 'fine', 'unknown', 'info'];
const TYPE_ORDER = ['vitamins', 'minerals', 'protein', 'fat', 'carbs', 'macro'];

/** Most urgent first; within a status, the furthest from fine first. */
export function byUrgency(a: NutrientResult, b: NutrientResult): number {
  return (
    urgencyRank(a.status) - urgencyRank(b.status) ||
    (b.status === 'tooHigh' ? (b.ulRatio ?? b.value.central) - (a.ulRatio ?? a.value.central) : a.value.central - b.value.central)
  );
}

/** Kind of nutrient from its place in the visibility tree: vitamins, minerals, or the macronutrient it belongs to. */
export function nutrientType(id: string): string {
  const path = NUTRIENT_BY_ID.get(id)?.path ?? [];
  return path[0] === 'macro' ? (path[1] ?? 'macro') : (path[0] ?? 'macro');
}

export function groupNutrients(results: readonly NutrientResult[], grouping: HomeGrouping): NutrientGroup[] {
  const sorted = [...results].sort(byUrgency);
  if (grouping === 'none') return [{ key: 'none', id: 'none', items: sorted }];
  const keyOf = grouping === 'status' ? (r: NutrientResult) => r.status : (r: NutrientResult) => nutrientType(r.id);
  const order: readonly string[] = grouping === 'status' ? STATUS_ORDER : TYPE_ORDER;
  const map = new Map<string, NutrientResult[]>();
  for (const r of sorted) {
    const k = keyOf(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([id, items]) => ({ key: `${grouping}:${id}`, id, items }));
}

/** For a type group's heading: how many need attention, by status (most urgent first). */
export function attentionCounts(items: readonly NutrientResult[]): Array<{ status: GaugeStatus; n: number }> {
  const out: Array<{ status: GaugeStatus; n: number }> = [];
  for (const s of ['tooHigh', 'low', 'gettingLow'] as const) {
    const n = items.filter((r) => r.status === s).length;
    if (n) out.push({ status: s, n });
  }
  return out;
}
