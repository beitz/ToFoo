/**
 * The nutrient model: log entries → meals → absorbed amounts → tanks and rolling averages,
 * run three times (low / central / high). Pure: everything it needs is passed in.
 */
import { nutrientParams, referenceWeightKg, slowStore, startingLevels, statusThresholds, storage, uncertainty } from '../../model/parameters';
import { absorbIronParts, absorbMeal, drinkTimingWeight, ironStatusFactor, type MealComposition } from './absorption';
import { entryIntake, isCoffee, isTea, TRACKED_IDS, type EntryIntake } from './intake';
import { MODEL_NUTRIENT_IDS } from './nutrients';
import type { Range, Scenario, Sex } from './paramTypes';
import { SCENARIOS } from './paramTypes';
import type { ResolvedRequirements } from './requirements';
import type { DayStatus, ModelEntry, ModelSettings } from './types';

export type StartingLevelChoice = 'empty' | 'average' | 'custom';

/** Days of history kept per nutrient (for charts). */
export const HISTORY_DAYS = 180;

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
  /** Store levels measured by a blood test (absorbed units), set on that day; the store follows the log from there. */
  measuredStores?: Readonly<Record<string, { day: string; amount: number }>>;
  weightKg: number;
  sex?: Sex;
}

export type GaugeStatus = 'fine' | 'gettingLow' | 'low' | 'tooHigh' | 'unknown' | 'info';
/** How a nutrient's main number reads. A nutrient with a body store is 'rolling' too; its fill level is in `store`. */
export type GaugeKind = 'rolling' | 'limit' | 'info';

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

/**
 * A body store (iron, B12, vitamin A, folate, iodine, vitamin D): a level in absorbed units, filled by what is
 * absorbed (and sun), drained by the need. Shown as a tank card on Home and on the nutrient page.
 */
export interface StoreResult {
  /** Fill level 0–1. */
  fill: Range;
  /** Status by fill level (tank thresholds; "too high" from the upper-limit check). */
  status: GaugeStatus;
  /** Capacity and level in absolute (absorbed) units. */
  capacity: number;
  level: Range;
  /** How many days a full store covers the need with no intake (sourced capacity range ÷ need). */
  storeDays?: Range;
  /** Average net change per day over the window (absorbed + sun − need, central), before clamping. */
  netPerDay?: number;
  /** Day of the blood test the store was set from, if any. */
  measuredOn?: string;
  /**
   * Slow store (months to years of need: iron, B12, vitamin A, folate, iodine): its fill level barely moves within
   * weeks and mostly reflects the starting level until a blood test is entered.
   */
  slow: boolean;
  /** Slow store: days in a row (up to the window end) the average has been in the "low" zone, with something logged in each window. */
  lowForDays?: number;
  /** Fill level per day. */
  history: HistoryPoint[];
}

export interface NutrientResult {
  id: string;
  kind: GaugeKind;
  status: GaugeStatus;
  /**
   * Rolling: average absorbed (plus sun for vitamin D; at reference iron stores for iron) ÷ requirement.
   * Limit: intake ÷ limit. Info: average intake.
   */
  value: Range;
  /** Nutrients with a body store. */
  store?: StoreResult;
  /** Average per day over the window: absorbed (central) and raw intake (central). */
  averageAbsorbed: number;
  averageIntake: number;
  /** Upper-limit check: average intake of the UL basis ÷ UL (central). */
  ulRatio?: number;
  windowDays: number;
  /** Days in the window with a known status (logged / fasted). */
  knownDays: number;
  /** Days in the window marked "Leave out": they count in no average. */
  leftOutDays: number;
  /** Days in the window on which some eaten food had no data for this nutrient. */
  missingDataDays: number;
  /** The main number per day. */
  history: HistoryPoint[];
  contributors: Contributor[];
  /** The value compares with the user's own target, not the reference value. */
  ownTarget?: boolean;
}

export interface SimulationResult {
  nutrients: Map<string, NutrientResult>;
  /** Effective status per day (explicit or derived). */
  dayStatus: Record<string, DayStatus | 'pending'>;
  meals: MealSummary[];
  /** Per-day totals, aligned with the input `days`, for reviewing any past period (model/period.ts). */
  daily: DailyTotals[];
}

/** One day's logged amounts (no imputation): absorbed per scenario, raw intake (central). */
export interface DailyTotals {
  absorbed: Record<Scenario, Record<string, number>>;
  intake: Record<string, number>;
  supplementIntake: Record<string, number>;
  /** Nutrients some eaten food had no data for. */
  missing: ReadonlySet<string>;
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
  /** Absorbed non-heme iron at reference stores (part of absorbed.FE), for the iron-status adaptation. */
  nonhemeFE: number;
  intake: Record<string, number>;
  supplementIntake: Record<string, number>;
  missing: Set<string>;
}

const emptyTotals = (): DayTotals => ({ absorbed: {}, nonhemeFE: 0, intake: {}, supplementIntake: {}, missing: new Set() });
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

/**
 * Tea, coffee or cocoa logged on its own (a drink entry, or only such drinks): it acts on the iron of
 * meals around it rather than forming a meal. null for anything else.
 */
export function drinkKind(e: ModelEntry): { tea: boolean; coffee: boolean } | null {
  if (e.direct && Object.keys(e.direct).length > 0) return null;
  const parts = e.parts.filter((p) => p.grams > 0);
  if (parts.length === 0) return e.modifiers?.tea || e.modifiers?.coffee ? { tea: !!e.modifiers.tea, coffee: !!e.modifiers.coffee } : null;
  let tea = false;
  let coffee = false;
  for (const p of parts) {
    const t = isTea(p.nameEn, p.group);
    const c = isCoffee(p.nameEn, p.group);
    if (!t && !c) return null;
    tea ||= t;
    coffee ||= c;
  }
  return { tea, coffee };
}

/** Largest timing weight of the drinks around a meal starting at `start` (ms). Drinks are sorted by time. */
function drinkWeights(start: number, drinks: ReadonlyArray<{ time: number; tea: boolean; coffee: boolean }>): { tea: number; coffee: number } {
  let tea = 0;
  let coffee = 0;
  for (const d of drinks) {
    const minutes = (d.time - start) / 60_000;
    if (minutes < -120) continue;
    if (minutes > 180) break;
    if (d.tea) tea = Math.max(tea, drinkTimingWeight('tea', minutes));
    if (d.coffee) coffee = Math.max(coffee, drinkTimingWeight('coffee', minutes));
  }
  return { tea, coffee };
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
  const comp: MealComposition = { intake: {}, hemeIron: 0, mfpGrams: 0, phytateGrams: 0, tea: 0, coffee: 0 };
  for (const ei of intakes) {
    for (const [id, v] of Object.entries(ei.intake)) add(comp.intake, id, v);
    comp.hemeIron += ei.hemeIron;
    comp.mfpGrams += ei.mfpGrams;
    comp.phytateGrams += ei.phytateGrams;
    if (ei.tea) comp.tea = 1;
    if (ei.coffee) comp.coffee = 1;
  }
  return comp;
}

export function tankCapacity(id: string, weightKg: number, sex: Sex | undefined, physiological: number): number | undefined {
  return tankCapacityRange(id, weightKg, sex, physiological)?.central;
}

/** Store capacity with its sourced low / high ends, in absorbed units, scaled to body weight. */
export function tankCapacityRange(id: string, weightKg: number, sex: Sex | undefined, physiological: number): Range | undefined {
  const model = storage[id];
  if (!model) return undefined;
  const refW = referenceWeightKg.value[sex ?? 'unknown'];
  const scale = weightKg / refW;
  const times = (r: Range, k: number): Range => ({ low: r.low * k, central: r.central * k, high: r.high * k });
  if (model.kind === 'tank') {
    const bySex = model.capacity.bySex;
    // Unknown sex: the smaller store is the safer assumption.
    return times(bySex ? (sex ? bySex[sex] : bySex.female) : model.capacity.value, scale);
  }
  if (model.kind === 'tankDays') return times(model.capacityDays.value, physiological * scale);
  return undefined;
}

export function classify(kind: GaugeKind | 'tank', value: number, ulRatio: number | undefined, known: boolean): GaugeStatus {
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
  // Drinks logged on their own don't start meals; they act on meals around them by timing.
  const drinks: Array<{ time: number; tea: boolean; coffee: boolean }> = [];
  const foodEntries: ModelEntry[] = [];
  const drinkMeals: ModelEntry[][] = [];
  for (const e of inRange) {
    const kind = drinkKind(e);
    if (kind) {
      drinks.push({ time: e.time, ...kind });
      drinkMeals.push([e]);
    } else foodEntries.push(e);
  }
  drinks.sort((a, b) => a.time - b.time);
  const meals = [...groupMeals(foodEntries, settings.mealWindowMinutes), ...drinkMeals].sort((a, b) => a[0]!.time - b[0]!.time);
  const drinkMealSet = new Set(drinkMeals);
  const mealDrinks = meals.map((m) => (drinkMealSet.has(m) ? { tea: 0, coffee: 0 } : drinkWeights(m[0]!.time, drinks)));

  // ── 1. Daily totals per scenario ──
  const contribFrom = days.length - Math.max(settings.shortWindowDays, settings.longWindowDays) - 1;
  const totals = {} as Record<Scenario, DayTotals[]>;
  const contrib = days.map(() => new Map<string, Record<string, number>>()); // central: day → label → absorbed
  const mealSummaries: MealSummary[] = [];
  for (const s of SCENARIOS) {
    totals[s] = days.map(emptyTotals);
    meals.forEach((meal, mi) => {
      const di = dayIndex.get(meal[0]!.dayKey)!;
      const day = totals[s][di]!;
      const intakes = meal.map((e) => entryIntake(e, s, { retention: settings.retention }));
      const comp = mealComposition(intakes);
      const around = mealDrinks[mi]!;
      comp.tea = Math.max(comp.tea, around.tea);
      comp.coffee = Math.max(comp.coffee, around.coffee);
      const absorbed = absorbMeal(comp, s, { modelled: settings.absorption, typicalFraction: typical });
      if (settings.absorption) day.nonhemeFE += absorbIronParts(comp, s).nonheme;
      for (const [id, v] of Object.entries(absorbed)) add(day.absorbed, id, v);
      for (const [id, v] of Object.entries(comp.intake)) add(day.intake, id, v);
      meal.forEach((e, i) => {
        const ei = intakes[i]!;
        ei.missing.forEach((m) => day.missing.add(m));
        if (e.isSupplement) for (const [id, v] of Object.entries(ei.intake)) add(day.supplementIntake, id, v);
        if (s === 'central' && di >= contribFrom) {
          // Attribute the meal's absorbed amount to entries by their share of intake (only needed within the window).
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
    });
  }

  // ── 2. Per nutrient ──
  const impute = settings.imputeUnlogged;
  // Without imputation the log is taken as complete: an unlogged past day is a known day with nothing eaten.
  const known = (d: string) => statuses[d] === 'logged' || statuses[d] === 'fasted' || (!impute && statuses[d] === 'unknown');
  // Days filled in from recent intake: unlogged ones when the setting is on, and days marked so one by one.
  const filledIn = (st: DayStatus | 'pending' | undefined) => st === 'filled' || st === 'excluded' || (impute && st === 'unknown');
  // Left-out days count in no average; the stores still run through them (on filled-in intake).
  const included = days.map((d) => statuses[d] !== 'excluded');
  const lookback = uncertainty.imputationLookbackDays.value;

  const results = new Map<string, NutrientResult>();
  for (const id of MODEL_NUTRIENT_IDS) {
    const r = req.byNutrient.get(id);
    const model = storage[id];
    const isInfo = req.infoOnly.has(id) || !r;
    const isTank = !isInfo && (model?.kind === 'tank' || model?.kind === 'tankDays');
    const physiological = r?.physiological ?? 0;
    const fullDays = isTank && physiological > 0 ? (tankCapacity(id, input.weightKg, input.sex, physiological) ?? 0) / physiological : 0;
    const measured = isTank ? input.measuredStores?.[id] : undefined;
    // Index of the day the measurement sets the store (the first model day if it was taken before); -1 if none / in the future.
    const measuredIdx = measured ? days.findIndex((d) => d >= measured.day) : -1;
    const slow = isTank && fullDays >= slowStore.minDays.value;
    const kind: GaugeKind = isInfo ? 'info' : r!.limitOnly ? 'limit' : 'rolling';
    const hasStore = isTank && kind === 'rolling';
    const windowDays =
      model?.kind === 'rolling' && model.window === 'short' ? settings.shortWindowDays : settings.longWindowDays;

    // Daily inflow (absorbed) per scenario, with imputation for unknown / partial days.
    const inflow = {} as Record<Scenario, number[]>;
    // Iron only: non-heme part of each day's inflow, which rises when stores are low.
    const adaptIron = id === 'FE' && settings.absorption;
    const nonhemeInflow = {} as Record<Scenario, number[]>;
    for (const s of SCENARIOS) {
      const series: number[] = [];
      const nhSeries: number[] = [];
      const knownHistory: number[] = [];
      const knownNh: number[] = [];
      days.forEach((d, i) => {
        const logged = totals[s][i]!.absorbed[id] ?? 0;
        const st = statuses[d];
        const n = Math.min(lookback, knownHistory.length);
        let sum = 0;
        for (let k = knownHistory.length - n; k < knownHistory.length; k++) sum += knownHistory[k]!;
        const imputed = n ? sum / n : physiological;
        let v: number;
        if (filledIn(st)) v = s === 'low' ? logged : s === 'central' ? Math.max(logged, imputed) : Math.max(logged, imputed, physiological);
        else if (impute && st === 'partial') v = s === 'low' ? logged : Math.max(logged, imputed);
        else v = logged;
        if (known(d)) knownHistory.push(logged);
        series.push(v);
        if (adaptIron) {
          const nh = totals[s][i]!.nonhemeFE;
          // Imputed amounts get the non-heme share of recent known days (none known: no adaptation).
          let share = 0;
          let nhSum = 0;
          for (let k = knownNh.length - n; k < knownNh.length; k++) nhSum += knownNh[k]!;
          if (sum > 0) share = nhSum / sum;
          nhSeries.push(v === logged ? nh : nh + (v - logged) * share);
          if (known(d)) knownNh.push(nh);
        }
      });
      inflow[s] = series;
      nonhemeInflow[s] = nhSeries;
    }

    // Window: ends yesterday. Today counts once it is over, so a half-logged day doesn't pull averages down.
    const end = days.length - 2;
    const windowIdx = (endIdx: number) => {
      const out: number[] = [];
      for (let i = Math.max(0, endIdx - windowDays + 1); i <= endIdx; i++) out.push(i);
      return out;
    };
    const win = end >= 0 ? windowIdx(end).filter((i) => included[i]) : [];
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
      windowDays: end >= 0 ? windowIdx(end).length : 0,
      knownDays: knownInWindow,
      leftOutDays: end >= 0 ? windowIdx(end).length - win.length : 0,
      missingDataDays,
      contributors,
      ownTarget: !!r?.own,
    };

    const sunAt = (s: Scenario, i: number) => (id === 'VITD' && settings.sun ? (input.sunByDay?.[days[i]!]?.[s] ?? 0) : 0);
    // Prefix sums make every window average O(1).
    const knownMask = days.map((d) => (known(d) ? 1 : 0));
    const includedMask = included.map((x) => (x ? 1 : 0));
    const prefix = (arr: number[]) => {
      const p = new Float64Array(arr.length + 1);
      for (let i = 0; i < arr.length; i++) p[i + 1] = p[i]! + arr[i]!;
      return p;
    };
    const knownPrefix = prefix(knownMask);
    const includedPrefix = prefix(includedMask);
    /**
     * Window averages ÷ denom ending on any day. With a source (absorbed per day): all days count (unknown days
     * are imputed) except left-out ones. Without: raw intake on known days only (limit / info).
     */
    const windowAverages = (source: Record<Scenario, number[]> | null, denom: number) => {
      const sums = {} as Record<Scenario, Float64Array>;
      for (const s of SCENARIOS) {
        sums[s] = source ? prefix(source[s].map((v, i) => v * includedMask[i]!)) : prefix(days.map((_, i) => (knownMask[i] ? (totals[s][i]!.intake[id] ?? 0) : 0)));
      }
      return (s: Scenario, endIdx: number) => {
        const start = Math.max(0, endIdx - windowDays + 1);
        const total = sums[s][endIdx + 1]! - sums[s][start]!;
        const n = source ? includedPrefix[endIdx + 1]! - includedPrefix[start]! : knownPrefix[endIdx + 1]! - knownPrefix[start]!;
        return n > 0 ? total / n / denom : 0;
      };
    };
    const rangeAt = (valueAt: (s: Scenario, i: number) => number, endIdx: number): Range => {
      if (endIdx < 0) return { low: 0, central: 0, high: 0 };
      const v = { low: valueAt('low', endIdx), central: valueAt('central', endIdx), high: valueAt('high', endIdx) };
      return { low: Math.min(v.low, v.central, v.high), central: v.central, high: Math.max(v.low, v.central, v.high) };
    };

    // Stores: absorbed plus sun, at reference iron stores, so the average says what the diet covers whatever the
    // store level. Taken before the store run below adapts iron absorption to the level.
    const source = kind === 'limit' || kind === 'info' ? null : hasStore ? Object.fromEntries(SCENARIOS.map((s) => [s, inflow[s].map((v, i) => v + sunAt(s, i))])) as Record<Scenario, number[]> : inflow;
    const denom = kind === 'limit' ? (r?.recommended ?? 1) : kind === 'info' ? 1 : physiological || 1;
    const valueAt = windowAverages(source, denom);
    const history: HistoryPoint[] = [];
    for (let i = Math.max(0, end - HISTORY_DAYS + 1); i <= end; i++) {
      const vals = SCENARIOS.map((s) => valueAt(s, i));
      history.push({ day: days[i]!, low: Math.min(...vals), central: vals[1]!, high: Math.max(...vals) });
    }
    const value = rangeAt(valueAt, end);

    let store: StoreResult | undefined;
    if (hasStore) {
      let lowForDays: number | undefined;
      if (slow) {
        lowForDays = 0;
        for (let i = end; i >= Math.max(0, end - HISTORY_DAYS + 1); i--) {
          const windowKnown = knownPrefix[i + 1]! - knownPrefix[Math.max(0, i - windowDays + 1)]!;
          if (windowKnown === 0 || valueAt('central', i) >= statusThresholds.rolling.value.low) break;
          lowForDays++;
        }
      }
      const capacity = tankCapacity(id, input.weightKg, input.sex, physiological) ?? 1;
      const capRange = tankCapacityRange(id, input.weightKg, input.sex, physiological);
      const coverDays = capRange && physiological > 0 ? { low: capRange.low / physiological, central: capRange.central / physiological, high: capRange.high / physiological } : undefined;
      const refWeight = referenceWeightKg.value[input.sex ?? 'unknown'];
      const startFraction =
        input.startingLevel === 'empty'
          ? 0
          : input.startingLevel === 'custom'
            ? (input.customStartLevels?.[id] ?? startingLevels.averageFraction.value)
            : startingLevels.averageFraction.value;
      const level = { low: 0, central: 0, high: 0 } as Range;
      const levels = {} as Record<Scenario, number[]>;
      const lastIdx = Math.max(end, measuredIdx);
      for (const s of SCENARIOS) {
        let l = startFraction * capacity;
        const series: number[] = [];
        days.forEach((_, i) => {
          if (i === measuredIdx) l = Math.min(capacity, measured!.amount);
          if (adaptIron) {
            // Stores scale with body weight; the ferritin relation is for a reference-sized adult.
            const factor = ironStatusFactor((l / capacity) * (tankCapacity(id, refWeight, input.sex, physiological) ?? capacity), s);
            inflow[s][i] = inflow[s][i]! + nonhemeInflow[s][i]! * (factor - 1);
          }
          l = Math.min(capacity, Math.max(0, l + inflow[s][i]! + sunAt(s, i) - physiological));
          series.push(l);
        });
        levels[s] = series;
        // Like the averages, the level is as of the last finished day (or a blood test taken today).
        level[s] = lastIdx >= 0 ? series[lastIdx]! : startFraction * capacity;
      }
      const storeHistory: HistoryPoint[] = [];
      for (let i = Math.max(0, lastIdx - HISTORY_DAYS + 1); i <= lastIdx; i++) {
        const vals = SCENARIOS.map((s) => levels[s][i]! / capacity);
        storeHistory.push({ day: days[i]!, low: Math.min(...vals), central: levels.central[i]! / capacity, high: Math.max(...vals) });
      }
      // Net change per day (central) over the window, for "filling / going down" and time to the fine zone.
      const netPerDay = win.length ? win.reduce((a, i) => a + inflow.central[i]! + sunAt('central', i) - physiological, 0) / win.length : undefined;
      const f = { low: level.low / capacity, central: level.central / capacity, high: level.high / capacity };
      const fill = { low: Math.min(f.low, f.central, f.high), central: f.central, high: Math.max(f.low, f.central, f.high) };
      store = {
        fill,
        status: classify('tank', fill.central, ulRatio, true),
        capacity,
        level,
        storeDays: coverDays,
        netPerDay,
        measuredOn: measuredIdx >= 0 ? measured!.day : undefined,
        slow,
        lowForDays,
        history: storeHistory,
      };
    }

    results.set(id, {
      ...base,
      status: classify(kind, value.central, ulRatio, knownInWindow > 0),
      value,
      history,
      ...(store ? { store } : {}),
    });
  }

  const daily: DailyTotals[] = days.map((_, i) => ({
    absorbed: { low: totals.low[i]!.absorbed, central: totals.central[i]!.absorbed, high: totals.high[i]!.absorbed },
    intake: totals.central[i]!.intake,
    supplementIntake: totals.central[i]!.supplementIntake,
    missing: totals.central[i]!.missing,
  }));

  return { nutrients: results, dayStatus: statuses, meals: mealSummaries, daily };
}

export type TankTrend = { direction: 'filling'; daysToFine?: number } | { direction: 'draining' } | { direction: 'steady' };

/**
 * Where a store is heading at the recent net rate. `daysToFine` is how long until it leaves the
 * "getting low" zone, when it is below that and filling.
 */
export function tankTrend(st: Pick<StoreResult, 'capacity' | 'level' | 'netPerDay'>): TankTrend | null {
  if (!st.capacity || st.netPerDay === undefined) return null;
  if (st.netPerDay < 0) return { direction: 'draining' };
  if (st.netPerDay === 0) return { direction: 'steady' };
  const gap = statusThresholds.tank.value.gettingLow * st.capacity - st.level.central;
  return gap > 0 ? { direction: 'filling', daysToFine: gap / st.netPerDay } : { direction: 'filling' };
}

/** Ids whose intake the model tracks (for tests and food profiles). */
export const SIMULATED_IDS = TRACKED_IDS;
