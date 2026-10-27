/**
 * "Filling up" on the nutrient page (owner's question, 2026-10-27: how fast could I fill up my omega-3?):
 * for a store below fine, how long it takes at the recent rate and with a few portions a week of one
 * food; for omega-3, what each daily amount in the dose study reached and what it means in portions of
 * a food. Pure glue on the model's output and model data; no physiological numbers here.
 */
import { omega3Index } from '../../model/nutrientFacts';
import { statusThresholds } from '../../model/parameters';
import { absorbMeal, type MealComposition } from '../model/absorption';
import { entryIntake } from '../model/intake';
import type { StoreResult } from '../model/simulate';
import type { FoodPart } from '../model/types';

/**
 * Days until a store is back to fine with `extraPerDay` (absorbed) on top of its recent net rate.
 * undefined: it is fine already; null: it does not fill at that rate.
 */
export function daysToFine(store: Pick<StoreResult, 'capacity' | 'level' | 'netPerDay'>, extraPerDay = 0): number | null | undefined {
  if (!store.capacity) return null;
  const gap = statusThresholds.tank.value.gettingLow * store.capacity - store.level.central;
  if (gap <= 0) return undefined;
  const net = (store.netPerDay ?? 0) + extraPerDay;
  return net > 0 ? gap / net : null;
}

/** What the body takes up of one nutrient from one portion of a food eaten as a meal of its own. */
export function portionAbsorbed(
  part: FoodPart,
  id: string,
  opts: { retention: boolean; absorption: boolean; typicalFraction: (id: string) => number },
): number {
  const ei = entryIntake({ id: 'portion', label: part.label, time: 0, dayKey: '', confidence: 'A', isSupplement: false, parts: [part] }, 'central', { retention: opts.retention });
  const meal: MealComposition = { intake: ei.intake, hemeIron: ei.hemeIron, mfpGrams: ei.mfpGrams, phytateGrams: ei.phytateGrams, tea: 0, coffee: 0 };
  return absorbMeal(meal, 'central', { modelled: opts.absorption, typicalFraction: opts.typicalFraction })[id] ?? 0;
}

export interface IndexRow {
  /** EPA + DHA eaten per day (g). */
  dose: number;
  /** Omega-3 index after the study's months (%). */
  index: number;
  /** Portions a week of the example food that give this dose; undefined without a food. */
  perWeek?: number;
}

/** The dose study's rows (taking something, so not the placebo row), with portions a week of a food giving `perPortion` g. */
export function omega3Rows(perPortion?: number): IndexRow[] {
  return omega3Index.value.doses
    .filter(([dose]) => dose > 0)
    .map(([dose, index]) => ({ dose, index, ...(perPortion && perPortion > 0 ? { perWeek: (dose * 7) / perPortion } : {}) }));
}
