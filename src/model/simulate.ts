/**
 * The nutrient model: log entries → meals → absorbed amounts → tanks and rolling averages,
 * run three times (low / central / high). Pure: everything it needs is passed in.
 */
import { nutrientParams, referenceWeightKg, startingLevels, statusThresholds, storage, uncertainty } from '../../model/parameters';
import { absorbMeal, type MealComposition } from './absorption';
import { entryIntake, TRACKED_IDS, type EntryIntake } from './intake';
import { MODEL_NUTRIENT_IDS } from './nutrients';
import type { Range, Scenario, Sex } from './paramTypes';
import { SCENARIOS } from './paramTypes';
import type { ResolvedRequirements } from './requirements';
import type { DayStatus, ModelEntry, ModelSettings } from './types';

export type StartingLevelChoice = 'empty' | 'average' | 'custom';

export interface SimulationInput {
  /** Every calendar day from the model start to today, ascending (YYYY-MM-DD). */
  days: string[];
  /** Explicit day statuses (fasting, partly logged, …). Days not listed are derived from entries. */
  dayStatus: Readonly<Record<string, DayStatus>>;
  entries: readonly ModelEntry[];
  requirements: ResolvedRequirements;
  settings: ModelSettings;
  /** Vitamin D made in the skin per day (µg). */
  sunByDay?: Readonly<Record<string, Range>>;
  startingLevel: StartingLevelChoice;
  /** Custom start fractions (0–1) per tank nutrient. */
  customStartLevels?: Readonly<Record<string, number>>;
  weightKg: number;
  sex?: Sex;
}

export type GaugeStatus = 'fine' | 'gettingLow' | 'low' | 'tooHigh' | 'unknown' | 'info';
export type GaugeKind = 'tank' | 'rolling' | 'limit' | 'info';

export interface HistoryPoint {
  day: string;
  low: number;
  central: number;
  high: number;
}

export interface Contributor {
  label: string;
  /** Absorbed amount over the window (central run). */
  amount: number;
  share: number;
}

export interface NutrientResult {
  id: string;
  kind: GaugeKind;
  status: GaugeStatus;
  /** Tank: fill level 0–1. Rolling: average absorbed ÷ requirement. Limit: intake ÷ limit. Info: average intake. */
  value: Range;
  /** Tank capacity and level in absolute (absorbed) units. */
  capacity?: number;
  level?: Range;
  /** Average per day over the window: absorbed (central) and raw intake (central). */
  averageAbsorbed: number;
  averageIntake: number;
  /** Upper-limit check: average intake of the UL basis ÷ UL (central). */
  ulRatio?: number;
  windowDays: number;
  /** Days in the window with a known status (logged / fasted). */
  knownDays: number;
  /** Days in the window on which some eaten food had no data for this nutrient. */
  missingDataDays: number;
  history: HistoryPoint[];
  contributors: Contributor[];
}

export interface SimulationResult {
  nutrients: Map<string, NutrientResult>;
  /** Effective status per day (explicit or derived). */
  dayStatus: Record<string, DayStatus | 'pending'>;
  meals: MealSummary[];
}

export interface MealSummary {
  day: string;
  start: number;
  entryIds: string[];
  /** Central intake after losses. */
  intake: Record<string, number>;
  /** Central absorbed. */
  absorbed: Record<string, number>;
}

interface DayTotals {
  absorbed: Record<string, number>;
  intake: Record<string, number>;
  supplementIntake: Record<string, number>;
  missing: Set<string>;
}

const emptyTotals = (): DayTotals => ({ absorbed: {}, intake: {}, supplementIntake: {}, missing: new Set() });
const add = (rec: Record<string, number>, id: string, v: number) => {
  rec[id] = (rec[id] ?? 0) + v;
};

/** Group entries into meals: all entries within `windowMinutes` of the meal's first entry. */
export function groupMeals<T extends { time: number }>(entries: readonly T[], windowMinutes: number): T[][] {
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  const meals: T[][] = [];
  let current: T[] = [];
  let start = -Infinity;
  for (const e of sorted) {
    if (e.time - start > windowMinutes * 60_000) {
      if (current.length) meals.push(current);
      current = [];
      start = e.time;
    }
    current.push(e);
  }
  if (current.length) meals.push(current);
  return meals;
}

/** Effective day status: explicit, else "logged" if the day has entries, else unknown. Today without anything is "pending". */
export function effectiveDayStatus(days: readonly string[], explicit: Readonly<Record<string, DayStatus>>, entries: readonly ModelEntry[]): Record<string, DayStatus | 'pending'> {
  const withEntries = new Set(entries.map((e) => e.dayKey));
  const today = days[days.length - 1];
  const out: Record<string, DayStatus | 'pending'> = {};
  for (const d of days) {
    const ex = explicit[d];
    if (ex && ex !== 'unknown') out[d] = ex;
    else if (withEntries.has(d)) out[d] = 'logged';
    else out[d] = d === today ? 'pending' : 'unknown';
  }
  return out;
}

function typicalFractionFor(req: ResolvedRequirements) {
  return (id: string): number => {
    const r = req.byNutrient.get(id);
    if (id === 'FE' && r && r.recommended > 0) return r.physiological / r.recommended;
    return nutrientParams[id]?.typicalAbsorption.value ?? 1;
  };
}

function mealComposition(intakes: EntryIntake[]): MealComposition {
  const comp: MealComposition = { intake: {}, hemeIron: 0, mfpGrams: 0, phytateGrams: 0, tea: false, coffee: false };
  for (const ei of intakes) {
    for (const [id, v] of Object.entries(ei.intake)) add(comp.intake, id, v);
    comp.hemeIron += ei.hemeIron;
    comp.mfpGrams += ei.mfpGrams;
    comp.phytateGrams += ei.phytateGrams;
    comp.tea ||= ei.tea;
    comp.coffee ||= ei.coffee;
  }
  return comp;
}

export function tankCapacity(id: string, weightKg: number, sex: Sex | undefined, physiological: number): number | undefined {
  const model = storage[id];
  if (!model) return undefined;
  const refW = referenceWeightKg.value[sex ?? 'unknown'];
  const scale = weightKg / refW;
  if (model.kind === 'tank') {
    const bySex = model.capacity.bySex;
    // Unknown sex: the smaller store is the safer assumption.
    const range = bySex ? (sex ? bySex[sex] : bySex.female) : model.capacity.value;
    return range.central * scale;
  }
  if (model.kind === 'tankDays') return model.capacityDays.value.central * physiological * scale;
  return undefined;
}

function classify(kind: GaugeKind, value: number, ulRatio: number | undefined, known: boolean): GaugeStatus {
  if (kind === 'info') return 'info';
  if (ulRatio !== undefined && ulRatio > 1) return 'tooHigh';
  if (kind === 'limit') return value > 1 ? 'tooHigh' : known ? 'fine' : 'unknown';
  if (!known && kind === 'rolling') return 'unknown';
  const t = kind === 'tank' ? statusThresholds.tank.value : statusThresholds.rolling.value;
  if (value < t.low) return 'low';
  if (value < t.gettingLow) return 'gettingLow';
  return 'fine';
}

export function simulate(input: SimulationInput): SimulationResult {
  const { days, requirements: req, settings } = input;
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const statuses = effectiveDayStatus(days, input.dayStatus, input.entries);
  const typical = typicalFractionFor(req);
  const inRange = input.entries.filter((e) => dayIndex.has(e.dayKey));
  const meals = groupMeals(inRange, settings.mealWindowMinutes);

  // ── 1. Daily totals per scenario ──
  const totals = {} as Record<Scenario, DayTotals[]>;
  const contrib = days.map(() => new Map<string, Record<string, number>>()); // central: day → label → absorbed
  const mealSummaries: MealSummary[] = [];
  for (const s of SCENARIOS) {
    totals[s] = days.map(emptyTotals);
    for (const meal of meals) {
      const di = dayIndex.get(meal[0]!.dayKey)!;
      const day = totals[s][di]!;
      const intakes = meal.map((e) => entryIntake(e, s, { retention: settings.retention }));
      const comp = mealComposition(intakes);
      const absorbed = absorbMeal(comp, s, { modelled: settings.absorption, typicalFraction: typical });
      for (const [id, v] of Object.entries(absorbed)) add(day.absorbed, id, v);
      for (const [id, v] of Object.entries(comp.intake)) add(day.intake, id, v);
      meal.forEach((e, i) => {
        const ei = intakes[i]!;
        ei.missing.forEach((m) => day.missing.add(m));
        if (e.isSupplement) for (const [id, v] of Object.entries(ei.intake)) add(day.supplementIntake, id, v);
        if (s === 'central') {
          // Attribute the meal's absorbed amount to entries by their share of intake.
          const byLabel = contrib[di]!;
          for (const [id, v] of Object.entries(ei.intake)) {
            const total = comp.intake[id] ?? 0;
            if (total <= 0) continue;
            const rec = byLabel.get(e.label) ?? {};
            add(rec, id, (absorbed[id] ?? 0) * (v / total));
            byLabel.set(e.label, rec);
          }
        }
      });
      if (s === 'central') {
        mealSummaries.push({ day: meal[0]!.dayKey, start: meal[0]!.time, entryIds: meal.map((e) => e.id), intake: comp.intake, absorbed });
      }
    }
  }

  // ── 2. Per nutrient ──
  const known = (d: string) => statuses[d] === 'logged' || statuses[d] === 'fasted';
  const today = days[days.length - 1];
  const todayCounts = today !== undefined && statuses[today] !== 'pending';
  const lookback = uncertainty.imputationLookbackDays.value;

  const results = new Map<string, NutrientResult>();
  for (const id of MODEL_NUTRIENT_IDS) {
    const r = req.byNutrient.get(id);
    const model = storage[id];
    const isInfo = req.infoOnly.has(id) || !r;
    const isTank = !isInfo && (model?.kind === 'tank' || model?.kind === 'tankDays');
    const kind: GaugeKind = isInfo ? 'info' : r!.limitOnly ? 'limit' : isTank ? 'tank' : 'rolling';
    const physiological = r?.physiological ?? 0;
    const windowDays =
      model?.kind === 'rolling' && model.window === 'short' ? settings.shortWindowDays : settings.longWindowDays;

    // Daily inflow (absorbed) per scenario, with imputation for unknown / partial days.
    const inflow = {} as Record<Scenario, number[]>;
    for (const s of SCENARIOS) {
      const series: number[] = [];
      const knownHistory: number[] = [];
      days.forEach((d, i) => {
        const logged = totals[s][i]!.absorbed[id] ?? 0;
        const st = statuses[d];
        const recent = knownHistory.slice(-lookback);
        const imputed = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : physiological;
        let v: number;
        if (st === 'logged' || st === 'fasted' || st === 'pending') v = logged;
        else if (st === 'partial') v = s === 'low' ? logged : Math.max(logged, imputed);
        else v = s === 'low' ? 0 : s === 'central' ? imputed : Math.max(imputed, physiological);
        if (st === 'logged' || st === 'fasted') knownHistory.push(logged);
        series.push(v);
      });
      inflow[s] = series;
    }

    // Window: ends today if today counts, else yesterday.
    const end = todayCounts ? days.length - 1 : days.length - 2;
    const windowIdx = (endIdx: number) => {
      const out: number[] = [];
      for (let i = Math.max(0, endIdx - windowDays + 1); i <= endIdx; i++) out.push(i);
      return out;
    };
    const win = end >= 0 ? windowIdx(end) : [];
    const knownInWindow = win.filter((i) => known(days[i]!)).length;
    const missingDataDays = win.filter((i) => totals.central[i]!.missing.has(id)).length;
    const mean = (arr: number[], idx: number[]) => (idx.length ? idx.reduce((a, i) => a + (arr[i] ?? 0), 0) / idx.length : 0);

    const centralIntakeSeries = days.map((_, i) => totals.central[i]!.intake[id] ?? 0);
    const knownIdx = win.filter((i) => known(days[i]!));
    const averageIntake = mean(centralIntakeSeries, knownIdx);

    // Upper limit: average raw intake of the basis nutrient on known days in the window (central).
    let ulRatio: number | undefined;
    const ul = r?.upperLimit;
    if (ul && knownIdx.length) {
      const basisSeries = days.map((_, i) => {
        const t = totals.central[i]!;
        return (ul.scope === 'supplements' ? t.supplementIntake[ul.basis] : t.intake[ul.basis]) ?? 0;
      });
      ulRatio = mean(basisSeries, knownIdx) / ul.value;
    }

    // Contributors over the window (central).
    const byLabel = new Map<string, number>();
    for (const i of win) for (const [label, rec] of contrib[i]!) byLabel.set(label, (byLabel.get(label) ?? 0) + (rec[id] ?? 0));
    const totalContrib = [...byLabel.values()].reduce((a, b) => a + b, 0);
    const contributors = [...byLabel.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, amount]) => ({ label, amount: amount / Math.max(win.length, 1), share: totalContrib > 0 ? amount / totalContrib : 0 }));

    const base = {
      id,
      kind,
      averageAbsorbed: mean(inflow.central, win),
      averageIntake,
      ulRatio,
      windowDays: win.length,
      knownDays: knownInWindow,
      missingDataDays,
      contributors,
    };

    if (kind === 'tank') {
      const capacity = tankCapacity(id, input.weightKg, input.sex, physiological) ?? 1;
      const startFraction =
        input.startingLevel === 'empty'
          ? 0
          : input.startingLevel === 'custom'
            ? (input.customStartLevels?.[id] ?? startingLevels.averageFraction.value)
            : startingLevels.averageFraction.value;
      const level = { low: 0, central: 0, high: 0 } as Range;
      const history: HistoryPoint[] = [];
      const levels = {} as Record<Scenario, number[]>;
      for (const s of SCENARIOS) {
        let l = startFraction * capacity;
        const series: number[] = [];
        days.forEach((d, i) => {
          const sunUg = id === 'VITD' && settings.sun ? (input.sunByDay?.[d]?.[s] ?? 0) : 0;
          l = Math.min(capacity, Math.max(0, l + inflow[s][i]! + sunUg - physiological));
          series.push(l);
        });
        levels[s] = series;
        level[s] = series[series.length - 1] ?? l;
      }
      days.forEach((d, i) => {
        const vals = SCENARIOS.map((s) => levels[s][i]! / capacity);
        history.push({ day: d, low: Math.min(...vals), central: levels.central[i]! / capacity, high: Math.max(...vals) });
      });
      const value = { low: level.low / capacity, central: level.central / capacity, high: level.high / capacity };
      const lo = Math.min(value.low, value.central, value.high);
      const hi = Math.max(value.low, value.central, value.high);
      results.set(id, {
        ...base,
        status: classify('tank', value.central, ulRatio, true),
        value: { low: lo, central: value.central, high: hi },
        capacity,
        level,
        history,
      });
      continue;
    }

    // Rolling, limit and info.
    const denom = kind === 'limit' ? (r?.recommended ?? 1) : kind === 'info' ? 1 : physiological || 1;
    const source = kind === 'limit' || kind === 'info' ? null : inflow;
    const valueAt = (s: Scenario, endIdx: number) => {
      const idx = windowIdx(endIdx);
      if (source) return mean(source[s], idx) / denom;
      // Limit / info: raw intake on known days.
      const k = idx.filter((i) => known(days[i]!));
      const series = days.map((_, i) => totals[s][i]!.intake[id] ?? 0);
      return mean(series, k) / denom;
    };
    const history: HistoryPoint[] = [];
    for (let i = 0; i < days.length; i++) {
      if (i > end) break;
      const vals = SCENARIOS.map((s) => valueAt(s, i));
      history.push({ day: days[i]!, low: Math.min(...vals), central: valueAt('central', i), high: Math.max(...vals) });
    }
    const v = end >= 0 ? { low: valueAt('low', end), central: valueAt('central', end), high: valueAt('high', end) } : { low: 0, central: 0, high: 0 };
    const value = { low: Math.min(v.low, v.central, v.high), central: v.central, high: Math.max(v.low, v.central, v.high) };
    results.set(id, {
      ...base,
      status: classify(kind, value.central, ulRatio, knownInWindow > 0),
      value,
      history,
    });
  }

  return { nutrients: results, dayStatus: statuses, meals: mealSummaries };
}

/** Ids whose intake the model tracks (for tests and food profiles). */
export const SIMULATED_IDS = TRACKED_IDS;
