/**
 * Glue from stored data to the ketosis estimate during a running fast (docs/SPEC.md, "Ketosis
 * estimate during fasts"): when the fast really started (the last meal before it), what that meal
 * was made of, and how much the user moved since.
 */
import { ketosis } from '../../model/parameters';
import { entryIntake } from '../model/intake';
import type { KetosisInput } from '../model/ketosis';
import type { ModelEntry } from '../model/types';
import { addDays, parseDay } from '../lib/dates';
import type { ActivityRecord, CustomFood, Fast, LogEntry, Profile } from '../storage/types';
import { breaksFast } from './resolve';

export interface FastClock {
  /** Epoch ms the fast is counted from. */
  since: number;
  /** True when `since` is the last logged meal; false when it is the start of the fast's first day. */
  fromMeal: boolean;
  /** Ids of the entries of that last meal. */
  mealIds: string[];
}

/**
 * The last meal before the fast: the latest food (not a drink or supplement) logged before the fast's
 * first day, with everything eaten within the meal window before it. A meal more than a day before
 * the fast's first day is too far back to trust (days without a log), so the fast then counts from
 * the start of its first day.
 */
export function fastClock(fast: Fast, log: readonly LogEntry[], customFoods: ReadonlyMap<string, CustomFood>, mealWindowMinutes: number): FastClock {
  const earliest = addDays(fast.startDay, -1);
  const before = log.filter((e) => e.day < fast.startDay && e.day >= earliest && breaksFast(e, customFoods));
  const last = before.reduce<LogEntry | null>((a, e) => (a === null || e.time > a.time ? e : a), null);
  if (!last) {
    const start = parseDay(fast.startDay);
    start.setHours(0, 0, 0, 0);
    return { since: start.getTime(), fromMeal: false, mealIds: [] };
  }
  const from = last.time - mealWindowMinutes * 60_000;
  return { since: last.time, fromMeal: true, mealIds: before.filter((e) => e.time >= from).map((e) => e.id) };
}

/** Share of the meal's energy from carbohydrate; null when energy or carbohydrate is unknown. */
export function carbShare(meal: readonly ModelEntry[]): number | null {
  let kcal = 0;
  let carbs = 0;
  for (const e of meal) {
    const { intake, missing } = entryIntake(e, 'central', { retention: false });
    if (missing.includes('CHO') || missing.includes('ENERCC')) return null;
    kcal += intake.ENERCC ?? 0;
    carbs += intake.CHO ?? 0;
  }
  if (!(kcal > 0)) return null;
  return Math.min(1, (carbs * ketosis.carbKcalPerGram.value) / kcal);
}

/** Minutes of moderate or hard activity that started after `since` and before `now`. */
export function exerciseMinutesSince(activities: readonly ActivityRecord[], since: number, now: number): number {
  return activities.filter((a) => a.time >= since && a.time <= now && (a.intensity === 'moderate' || a.intensity === 'hard')).reduce((s, a) => s + a.minutes, 0);
}

export function bodyMassIndex(weightKg: number | undefined, heightCm: number | undefined): number | undefined {
  if (!weightKg || !heightCm) return undefined;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function ketosisInput(args: {
  clock: FastClock;
  now: number;
  entries: ReadonlyMap<string, ModelEntry>;
  activities: readonly ActivityRecord[];
  profile: Pick<Profile, 'sex' | 'heightCm'>;
  /** Only the profile's own weight, not the default used when none is set. */
  weightKg: number | undefined;
}): KetosisInput {
  const { clock, now } = args;
  const meal = clock.mealIds.map((id) => args.entries.get(id)).filter((e): e is ModelEntry => !!e);
  return {
    hours: Math.max(0, (now - clock.since) / 3_600_000),
    carbShare: meal.length ? carbShare(meal) : null,
    exerciseMinutes: exerciseMinutesSince(args.activities, clock.since, now),
    sex: args.profile.sex,
    bmi: bodyMassIndex(args.weightKg, args.profile.heightCm),
  };
}
