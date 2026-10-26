import { ladder, type LadderStep } from '../../model/ladder';
import type { Requirement } from '../model/requirements';
import { isUnsure, type GaugeStatus, type NutrientResult } from '../model/simulate';

/**
 * "From too little to too much" (owner's ask, 2026-10-26): which steps a nutrient's ladder has, and
 * which one the user is on. The "you" step uses the same status as Home and the top of the nutrient
 * page, so the words match.
 */

/** A step on the ladder, from the top. `plenty` is the top step of a nutrient with no upper limit. */
export type RungKind = 'farOver' | 'over' | 'plenty' | 'enough' | 'bitLow' | 'low' | 'none';

export interface Rung {
  kind: RungKind;
  /** The sourced step behind it (model/ladder.ts), if any; else the general texts apply. */
  step?: LadderStep;
  /** The status this step stands for, for its status mark. */
  status: GaugeStatus;
}

export interface LadderShape {
  /** No need, only a guide or limit (saturated fat): no steps below "under the limit". */
  limitOnly: boolean;
  /** An upper limit, safe level or guide exists. */
  hasUpper: boolean;
  /** Info-only nutrients (fat, carbohydrates, sugars) get no ladder. */
  info: boolean;
}

/** The steps for one nutrient, from the top. Empty for info-only nutrients. */
export function ladderRungs(key: string, shape: LadderShape): Rung[] {
  if (shape.info) return [];
  const steps = ladder[key] ?? {};
  const rungs: Rung[] = [];
  const add = (kind: RungKind, status: GaugeStatus, step?: LadderStep) => rungs.push({ kind, status, ...(step ? { step } : {}) });
  if (steps.farOver) add('farOver', 'tooHigh', steps.farOver);
  // Energy has no upper limit, but more than you use is "too much" on Home too (the today ring).
  const over = shape.hasUpper || shape.limitOnly || key === 'ENERCC';
  add(over ? 'over' : 'plenty', over ? 'tooHigh' : 'fine', steps.over);
  add('enough', 'fine');
  if (shape.limitOnly) return rungs;
  add('bitLow', 'gettingLow');
  add('low', 'low', steps.low);
  // The bottom step: the deficiency where one is described; where nothing is (no low text either), the
  // general text says what is known about too little ("no known deficiency").
  if (steps.none || !steps.low) add('none', 'low', steps.none);
  return rungs;
}

export interface YouAt {
  kind: RungKind;
  /** The likely range crosses a status line ("unclear" on Home). */
  unsure: boolean;
}

/** Which step the user is on, or undefined (no data, info only, or a level the ladder has no step for). */
export function youAt(key: string, r: NutrientResult, req: Requirement | undefined, rungs: readonly Rung[]): YouAt | undefined {
  if (r.kind === 'info' || r.knownDays === 0 || !rungs.length) return undefined;
  const store = r.store;
  const status = store ? store.status : r.status;
  const unsure = isUnsure(store ? store.statusSpan : r.statusSpan);
  const has = (kind: RungKind) => rungs.some((x) => x.kind === kind);
  const steps = ladder[key] ?? {};
  let kind: RungKind | undefined;
  switch (status) {
    case 'tooHigh': {
      // Far too much only where the source's amount is on the same basis as the upper limit.
      const far = steps.farOver?.amount;
      const ul = req?.upperLimit?.value;
      const basisIntake = r.ulRatio !== undefined && ul ? r.ulRatio * ul : undefined;
      kind = far !== undefined && basisIntake !== undefined && basisIntake >= far && has('farOver') ? 'farOver' : 'over';
      break;
    }
    case 'fine':
      // Energy over its need is "too much", as Home's today ring shows it.
      kind = key === 'ENERCC' && r.value.central > 1 ? 'over' : 'enough';
      break;
    case 'gettingLow':
      kind = 'bitLow';
      break;
    case 'low': {
      const under = steps.none?.amount;
      kind = under !== undefined && !store && r.averageIntake < under && has('none') ? 'none' : 'low';
      break;
    }
    default:
      return undefined;
  }
  return has(kind) ? { kind, unsure } : undefined;
}
