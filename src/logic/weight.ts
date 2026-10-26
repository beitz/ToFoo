/**
 * Weight (docs/SPEC.md, "Weight"): a smoothed trend under the day-to-day swings, and a check of the
 * food log against it. Not a weight goal: the check only asks whether the log can be complete.
 */
import { weightCheck } from '../../model/parameters';
import { addDays, daysBetween } from '../lib/dates';
import type { ActivityLevel, Range, Sex } from '../model/paramTypes';
import { estimateEnergyNeed } from '../model/requirements';
import type { DailyTotals } from '../model/simulate';
import type { DayStatus } from '../model/types';
import type { ActivityRecord } from '../storage/types';
import { averageActivityKcal } from './energyBurn';

/** A typed weight outside this range is a typo (or the wrong unit), not a weigh-in. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

export interface WeighIn {
  day: string;
  kg: number;
}

export interface TrendPoint extends WeighIn {
  /** The smoothed weight on that day. */
  trend: number;
}

/** Weigh-ins oldest first, one per day (the last one of a day wins, as when saving). */
export function sortedWeighIns(history: readonly WeighIn[]): WeighIn[] {
  const byDay = new Map(history.filter((w) => w.kg > 0).map((w) => [w.day, w]));
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The trend line: an exponentially smoothed average that moves a share of the way toward each new
 * weigh-in, more after a gap (a week without weighing moves it as seven days would).
 */
export function weightTrend(history: readonly WeighIn[], smoothing = weightCheck.trendSmoothing.value): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const w of sortedWeighIns(history)) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...w, trend: w.kg });
      continue;
    }
    const share = 1 - (1 - smoothing) ** Math.max(1, daysBetween(prev.day, w.day));
    out.push({ ...w, trend: prev.trend + share * (w.kg - prev.trend) });
  }
  return out;
}

/** Least-squares slope in kg per day, with its standard error (undefined with fewer than three points). */
export function weightSlope(points: readonly WeighIn[]): { perDay: number; se?: number } | undefined {
  if (points.length < 2) return undefined;
  const x = points.map((p) => daysBetween(points[0]!.day, p.day));
  const n = points.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.kg, 0) / n;
  const sxx = x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
  if (sxx === 0) return undefined;
  const perDay = x.reduce((a, xi, i) => a + (xi - mx) * (points[i]!.kg - my), 0) / sxx;
  if (n < 3) return { perDay };
  const residual = x.reduce((a, xi, i) => a + (points[i]!.kg - (my + perDay * (xi - mx))) ** 2, 0);
  return { perDay, se: Math.sqrt(residual / (n - 2) / sxx) };
}

export interface LogCheckInput {
  history: readonly WeighIn[];
  /** The model's days and their totals, aligned (AppData.modelDays and model.daily). */
  days: readonly string[];
  daily: readonly DailyTotals[];
  dayStatus: Readonly<Record<string, DayStatus | 'pending'>>;
  today: string;
  sex: Sex | undefined;
  /** Age this year; undefined when the birth year is not set. */
  ageYears: number | undefined;
  activity: ActivityLevel;
  /** The correction of the estimate accepted from the weight before (Profile.energyCorrection). */
  energyFactor?: number;
  /** Logged activities, when they count toward energy burned (feature "activityEnergy"). */
  activities?: readonly ActivityRecord[];
}

interface Window {
  from: string;
  to: string;
  weighIns: number;
  loggedDays: number;
}

export type LogCheck =
  | ({ state: 'needWeighIns' } & Window)
  | ({ state: 'needLog' } & Window)
  | ({ state: 'needAge' } & Window)
  | ({
      /** low: the log is below what the weight says was eaten; high: above it; fits: within the range. */
      state: 'low' | 'fits' | 'high';
      /** Average logged energy per logged day (kcal). */
      loggedKcal: number;
      /** Estimated energy burned at the average weight (kcal/day): base day plus activities. */
      burnKcal: number;
      /** The base day in it: resting energy × PAL × correction (kcal/day). */
      baseKcal: number;
      /** What logged activities added per day on average (kcal/day; 0 when they don't count). */
      activityKcal: number;
      /**
       * When the log is outside the range, the other reading: if the log is complete, what the weight
       * says was burned, and the correction of the base day that would give it (Profile.energyCorrection).
       */
      measured?: { kcal: Range; factor: number };
      /** Weight change over the window along the fitted line (kg). */
      changeKg: number;
      /** What the weight says was eaten (kcal/day): burn plus the energy stored or lost. */
      eatenKcal: Range;
      /** How much of the eaten energy the log lacks (0.2 = 20 %), when low. */
      missingShare: number;
    } & Window);

/**
 * Is the food log about complete? If the weight holds, about as much was eaten as burned; a weight
 * change adds or takes away its energy (Sanghvi et al. 2015). The burn is the energy estimate the
 * app uses (resting energy × PAL × the correction accepted before, plus logged activities when they
 * count); its range is the resting-energy spread × PAL plus one standard error of the weight slope,
 * so few or noisy weigh-ins widen it instead of giving a verdict. Outside the range the same numbers
 * read the other way give what was burned if the log is complete (`measured`): the log and the burn
 * can't both be checked at once, so the user says which to trust.
 */
export function logCheck(input: LogCheckInput): LogCheck {
  const w = weightCheck.window.value;
  const to = addDays(input.today, -1);
  const from = addDays(to, -(w.days - 1));
  const weighIns = sortedWeighIns(input.history).filter((p) => p.day >= from && p.day <= input.today);
  let kcal = 0;
  let loggedDays = 0;
  input.days.forEach((day, i) => {
    if (day < from || day > to) return;
    const st = input.dayStatus[day];
    if (st !== 'logged' && st !== 'fasted') return;
    loggedDays++;
    kcal += input.daily[i]?.intake.ENERCC ?? 0;
  });
  const base: Window = { from, to, weighIns: weighIns.length, loggedDays };
  const span = weighIns.length ? daysBetween(weighIns[0]!.day, weighIns[weighIns.length - 1]!.day) : 0;
  if (weighIns.length < w.minWeighIns || span < w.minSpanDays) return { state: 'needWeighIns', ...base };
  if (loggedDays < w.minLoggedDays) return { state: 'needLog', ...base };
  if (input.ageYears === undefined) return { state: 'needAge', ...base };
  const slope = weightSlope(weighIns)!;
  const meanKg = weighIns.reduce((a, p) => a + p.kg, 0) / weighIns.length;
  const need = estimateEnergyNeed(input.sex, input.ageYears, meanKg, input.activity);
  const factor = input.energyFactor && input.energyFactor > 0 ? input.energyFactor : 1;
  const plainBase = need.reeKcal * need.pal;
  const baseKcal = plainBase * factor;
  const windowDays: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) windowDays.push(d);
  const activityKcal = input.activities ? averageActivityKcal(windowDays, input.activities, { kcalPerDay: baseKcal, weightKg: meanKg }) : 0;
  const burnKcal = baseKcal + activityKcal;
  const spread = weightCheck.reeSpreadKcal.value * need.pal * factor;
  const rho = weightCheck.energyPerKg.value;
  const se = slope.se ?? 0;
  // Energy stored per day: the lower end takes the lower slope with whichever ρ gives less, and so on.
  const stored = (s: number, pick: 'min' | 'max') => Math[pick](rho.low * s, rho.high * s);
  const eatenKcal: Range = {
    low: burnKcal - spread + stored(slope.perDay - se, 'min'),
    central: burnKcal + rho.central * slope.perDay,
    high: burnKcal + spread + stored(slope.perDay + se, 'max'),
  };
  const loggedKcal = kcal / loggedDays;
  const state = loggedKcal < eatenKcal.low ? 'low' : loggedKcal > eatenKcal.high ? 'high' : 'fits';
  // Read the other way round: a complete log minus the energy stored is what was burned.
  const methodError = weightCheck.methodErrorKcal.value;
  const burned: Range = {
    low: loggedKcal - stored(slope.perDay + se, 'max') - methodError,
    central: loggedKcal - rho.central * slope.perDay,
    high: loggedKcal - stored(slope.perDay - se, 'min') + methodError,
  };
  // An activity adds less on a higher ordinary day, so the factor that gives the measured burn is found
  // by a few rounds of putting the activities' share at the new ordinary day back in.
  let measuredFactor = (burned.central - activityKcal) / plainBase;
  for (let i = 0; i < 5 && input.activities && measuredFactor > 0; i++) {
    const act = averageActivityKcal(windowDays, input.activities, { kcalPerDay: plainBase * measuredFactor, weightKg: meanKg });
    measuredFactor = (burned.central - act) / plainBase;
  }
  const measured = state !== 'fits' && measuredFactor > 0 ? { kcal: burned, factor: measuredFactor } : undefined;
  return {
    state,
    ...base,
    loggedKcal,
    burnKcal,
    baseKcal,
    activityKcal,
    ...(measured ? { measured } : {}),
    changeKg: slope.perDay * (w.days - 1),
    eatenKcal,
    missingShare: state === 'low' ? 1 - loggedKcal / eatenKcal.central : 0,
  };
}
