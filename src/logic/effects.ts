import type { Requirement } from '../model/requirements';
import { classify, type GaugeStatus, type NutrientResult } from '../model/simulate';
import { storeNeedsAttention } from './stores';

/**
 * "What your levels mean" (owner's ask, 2026-10-23): which nutrients are worth a line about what their
 * level can do, on the nutrient page and in the summary on Insights. Same status as Home (the 7-day
 * average, or the store's fill), so the words match what Home shows.
 */

/** What the level is compared with. */
export type EffectBasis =
  /** Below the daily need (rolling average). */
  | 'need'
  /** A body store low and not filling. */
  | 'store'
  /** Over an upper guide that is not a toxicological limit (saturated fat). */
  | 'limit'
  /** Over a tolerable upper intake level (EFSA) or the DGE salt guide. */
  | 'upperLimit'
  /** Over a level EFSA calls safe where data were too thin for an upper limit. */
  | 'safeLevel'
  /** Below the user's own target while the general reference is met. */
  | 'ownTarget'
  /** Over the user's own maximum (a goal, not a health limit). */
  | 'ownMax';

export interface Finding {
  id: string;
  /** The status as Home shows it. */
  status: GaugeStatus;
  direction: 'low' | 'high';
  basis: EffectBasis;
  /** Store low but filling at the current intake: Home shows no warning, so neither does this. */
  filling: boolean;
  /** There is an effect worth mentioning (a text for this direction, and not only an own goal missed). */
  effect: boolean;
}

/** Whether there is an effect worth mentioning for a nutrient and direction (`hasEffectText` in the app). */
export type HasEffect = (id: string, direction: 'low' | 'high') => boolean;

/** The finding for one nutrient, or undefined when there is nothing to say (enough, no data, info only). */
export function findingOf(r: NutrientResult, req: Requirement | undefined, hasEffect: HasEffect): Finding | undefined {
  if (r.kind === 'info' || r.knownDays === 0) return undefined;
  const store = r.store;
  const status = store ? store.status : r.status;
  let direction: Finding['direction'];
  let basis: EffectBasis;
  let filling = false;
  if (status === 'tooHigh') {
    direction = 'high';
    if (r.ulRatio !== undefined && r.ulRatio > 1) basis = req?.upperLimit?.safeLevel ? 'safeLevel' : 'upperLimit';
    else basis = req?.own ? 'ownMax' : 'limit';
  } else if (status === 'low' || status === 'gettingLow') {
    direction = 'low';
    if (store) {
      basis = 'store';
      filling = !storeNeedsAttention(store);
    } else if (r.ownTarget && req?.own?.referenceRecommended) {
      // The share of the general reference: the value scales with the requirement it is compared with.
      const ofReference = (r.value.central * req.recommended) / req.own.referenceRecommended;
      basis = classify('rolling', ofReference, undefined, true) === 'fine' ? 'ownTarget' : 'need';
    } else basis = 'need';
  } else return undefined;
  const effect = !filling && basis !== 'ownTarget' && basis !== 'ownMax' && hasEffect(r.id, direction);
  return { id: r.id, status, direction, basis, filling, effect };
}

export interface EffectSummary {
  /** Low or too much, with an effect worth mentioning: too much first, then low, the furthest out first. */
  effects: Finding[];
  /** A bit low, with an effect if it drops further. */
  aBitLow: Finding[];
  /** Stores low but filling. */
  filling: Finding[];
  /** Only an own target missed or an own maximum passed. */
  ownOnly: Finding[];
  /** Out of range, with no known effect at that level. */
  noEffect: Finding[];
  /** Ids with enough (or under their limit). */
  fine: string[];
  /** Ids with nothing logged in the window. */
  noData: string[];
}

/** Sorts every nutrient shown on Home into the summary's groups. */
export function summarise(results: Iterable<NutrientResult>, requirements: ReadonlyMap<string, Requirement>, hasEffect: HasEffect, hidden: ReadonlySet<string> = new Set()): EffectSummary {
  const out: EffectSummary = { effects: [], aBitLow: [], filling: [], ownOnly: [], noEffect: [], fine: [], noData: [] };
  const far = new Map<string, number>();
  for (const r of results) {
    if (hidden.has(r.id) || r.kind === 'info') continue;
    if (r.knownDays === 0) {
      out.noData.push(r.id);
      continue;
    }
    const f = findingOf(r, requirements.get(r.id), hasEffect);
    if (!f) {
      out.fine.push(r.id);
      continue;
    }
    // How far out: the share over the limit, or the share missing (fill for stores).
    far.set(r.id, f.direction === 'high' ? (r.ulRatio !== undefined && r.ulRatio > 1 ? r.ulRatio : r.value.central) : 1 - (r.store ? r.store.fill.central : r.value.central));
    if (f.filling) out.filling.push(f);
    else if (f.basis === 'ownTarget' || f.basis === 'ownMax') out.ownOnly.push(f);
    else if (!f.effect) out.noEffect.push(f);
    else if (f.status === 'gettingLow') out.aBitLow.push(f);
    else out.effects.push(f);
  }
  const rank = (f: Finding) => (f.direction === 'high' ? 0 : 1);
  out.effects.sort((a, b) => rank(a) - rank(b) || far.get(b.id)! - far.get(a.id)!);
  out.aBitLow.sort((a, b) => far.get(b.id)! - far.get(a.id)!);
  return out;
}
