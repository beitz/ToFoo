/**
 * Energy burned by activities (docs/SPEC.md, "Energy burned"): pure functions over the parameters in
 * model/parameters.ts `activityEnergy`.
 */
import { activityEnergy } from '../../model/parameters';

export type Effort = 'easy' | 'moderate' | 'hard';

/** kcal an activity costs in all: MET × kg × minutes × the Compendium's conversion. */
export function activityKcal(met: number, weightKg: number, minutes: number): number {
  return met * weightKg * minutes * activityEnergy.kcalPerMetKgMinute.value;
}

/**
 * What an activity adds to the day: its cost minus what the base day (kcal/day) already counts for
 * its minutes, never below zero.
 */
export function extraKcal(met: number, weightKg: number, minutes: number, baseKcalPerDay: number): number {
  return Math.max(0, activityKcal(met, weightKg, minutes) - (baseKcalPerDay / (24 * 60)) * minutes);
}

/** The effort a MET value stands for (absolute intensity bands). */
export function effortOfMet(met: number): Effort {
  const b = activityEnergy.effortFromMet.value;
  return met >= b.hard ? 'hard' : met >= b.moderate ? 'moderate' : 'easy';
}

/** The Compendium row used for a kind and effort when none was picked; none for "other". */
export function defaultRow(kind: string, effort: Effort | undefined): string | undefined {
  const rows = activityEnergy.defaultRows.value as Record<string, Record<Effort, string>>;
  return rows[kind]?.[effort ?? 'moderate'];
}
