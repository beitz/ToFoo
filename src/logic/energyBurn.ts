/**
 * Energy burned (docs/SPEC.md, "Energy burned"): the base day (resting energy × PAL × the correction
 * from the weight) plus what each logged activity adds, from its 2024 Adult Compendium row.
 */
import { compendiumActivity, type CompendiumActivity } from '../activities/compendium';
import { activityKcal, defaultRow, extraKcal } from '../model/activityEnergy';
import type { ActivityRecord } from '../storage/types';

type ActivityLike = Pick<ActivityRecord, 'kind' | 'intensity' | 'compendium' | 'minutes'>;

/** The Compendium row an activity counts as: the one picked for it, else the one for its kind and effort ("other" has none). */
export function rowOf(a: Pick<ActivityRecord, 'kind' | 'intensity' | 'compendium'>): { row: CompendiumActivity; picked: boolean } | undefined {
  const picked = compendiumActivity(a.compendium);
  if (picked) return { row: picked, picked: true };
  const row = compendiumActivity(defaultRow(a.kind, a.intensity));
  return row ? { row, picked: false } : undefined;
}

export interface ActivityEnergy {
  row: CompendiumActivity;
  picked: boolean;
  /** What it costs in all (what a fitness watch shows). */
  totalKcal: number;
  /** What it adds to the day: the cost above the base day's rate for its minutes. */
  extraKcal: number;
}

/** An activity's energy at a body weight and base day (kcal/day); undefined without a Compendium row. */
export function activityEnergyOf(a: ActivityLike, weightKg: number, baseKcalPerDay: number): ActivityEnergy | undefined {
  const r = rowOf(a);
  if (!r) return undefined;
  return { ...r, totalKcal: activityKcal(r.row.met, weightKg, a.minutes), extraKcal: extraKcal(r.row.met, weightKg, a.minutes, baseKcalPerDay) };
}

export interface BurnBase {
  /** The base day: resting energy × PAL × correction (kcal/day). */
  kcalPerDay: number;
  weightKg: number;
}

export interface DayBurn {
  baseKcal: number;
  /** Sum of what the day's activities add. */
  activityKcal: number;
  /** Activities without a Compendium row: their energy is unknown, not zero. */
  unknown: number;
  totalKcal: number;
}

/** The burn of each of `days`, from the activities logged on them. */
export function burnByDay(days: readonly string[], activities: readonly ActivityRecord[], base: BurnBase): Map<string, DayBurn> {
  const out = new Map<string, DayBurn>(days.map((d) => [d, { baseKcal: base.kcalPerDay, activityKcal: 0, unknown: 0, totalKcal: base.kcalPerDay }]));
  for (const a of activities) {
    const b = out.get(a.day);
    if (!b) continue;
    const e = activityEnergyOf(a, base.weightKg, base.kcalPerDay);
    if (e) {
      b.activityKcal += e.extraKcal;
      b.totalKcal += e.extraKcal;
    } else b.unknown++;
  }
  return out;
}

/** What activities added per day on average over `days` (days without any count as adding nothing). */
export function averageActivityKcal(days: readonly string[], activities: readonly ActivityRecord[], base: BurnBase): number {
  if (!days.length) return 0;
  let sum = 0;
  for (const b of burnByDay(days, activities, base).values()) sum += b.activityKcal;
  return sum / days.length;
}
