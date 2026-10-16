/**
 * Reviewing a past period (docs/SPEC.md, "Reviewing the past"): the average per day over one day,
 * a week or any date range, as the same kind of result the Home gauges show. Pure.
 *
 * Only logged amounts count; nothing is imputed, because the point is to see what was eaten.
 * Which days count follows the model: logged and fasted days, and unlogged past days unless
 * "Fill in unlogged days" is on (then they are unknown and left out). Partly logged days are left
 * out too, since their totals are known to be incomplete; the result says how many there were.
 *
 * Percentages compare like with like (docs/SPEC.md, units): absorbed ÷ physiological need for
 * stores and rolling nutrients, as on Home; intake ÷ limit for limits; plain intake for info.
 * Stores are shown as a daily average here, not as a fill level.
 */
import { MODEL_NUTRIENT_IDS } from './nutrients';
import { SCENARIOS, type Range } from './paramTypes';
import type { ResolvedRequirements } from './requirements';
import { classify, type GaugeKind, type NutrientResult, type SimulationResult } from './simulate';
import type { DayStatus } from './types';

export interface PeriodInput {
  /** The model's days (same order as `sim.daily`). */
  days: readonly string[];
  sim: Pick<SimulationResult, 'daily' | 'dayStatus'>;
  requirements: ResolvedRequirements;
  imputeUnlogged: boolean;
  from: string;
  to: string;
}

export interface PeriodResult {
  from: string;
  to: string;
  /** Days of the range the model covers (before the first log or after today are left out). */
  days: number;
  /** Days the averages are taken over. */
  countedDays: number;
  statusCounts: Record<DayStatus | 'pending', number>;
  nutrients: Map<string, NutrientResult>;
}

export function periodBreakdown(input: PeriodInput): PeriodResult {
  const { days, sim, requirements: req, imputeUnlogged, from, to } = input;
  const statusCounts: PeriodResult['statusCounts'] = { logged: 0, partial: 0, fasted: 0, unknown: 0, pending: 0 };
  const idx: number[] = [];
  days.forEach((d, i) => {
    if (d < from || d > to) return;
    const st = sim.dayStatus[d] ?? 'unknown';
    statusCounts[st]++;
    if (st === 'logged' || st === 'fasted' || (!imputeUnlogged && st === 'unknown')) idx.push(i);
  });
  const inRange = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const n = idx.length;
  const mean = (get: (i: number) => number) => (n ? idx.reduce((a, i) => a + get(i), 0) / n : 0);

  const nutrients = new Map<string, NutrientResult>();
  for (const id of MODEL_NUTRIENT_IDS) {
    const r = req.byNutrient.get(id);
    const isInfo = req.infoOnly.has(id) || !r;
    const kind: GaugeKind = isInfo ? 'info' : r!.limitOnly ? 'limit' : 'rolling';
    const averageIntake = mean((i) => sim.daily[i]!.intake[id] ?? 0);
    const absorbed = {} as Range;
    for (const s of SCENARIOS) absorbed[s] = mean((i) => sim.daily[i]!.absorbed[s][id] ?? 0);
    let value: Range;
    if (kind === 'info') value = { low: averageIntake, central: averageIntake, high: averageIntake };
    else if (kind === 'limit') {
      const v = averageIntake / (r!.recommended || 1);
      value = { low: v, central: v, high: v };
    } else {
      const need = r!.physiological || 1;
      value = { low: Math.min(absorbed.low, absorbed.high) / need, central: absorbed.central / need, high: Math.max(absorbed.low, absorbed.high) / need };
    }
    let ulRatio: number | undefined;
    const ul = r?.upperLimit;
    if (ul && n) ulRatio = mean((i) => (ul.scope === 'supplements' ? sim.daily[i]!.supplementIntake[ul.basis] : sim.daily[i]!.intake[ul.basis]) ?? 0) / ul.value;
    nutrients.set(id, {
      id,
      kind,
      status: classify(kind, value.central, ulRatio, n > 0),
      value,
      averageAbsorbed: absorbed.central,
      averageIntake,
      ulRatio,
      windowDays: inRange,
      knownDays: n,
      missingDataDays: idx.filter((i) => sim.daily[i]!.missing.has(id)).length,
      history: [],
      contributors: [],
    });
  }
  return { from, to, days: inRange, countedDays: n, statusCounts, nutrients };
}
