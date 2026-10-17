/** Water (docs/SPEC.md, "Water"): pure helpers. */
import { waterGuide } from '../../model/reference-values';
import { AGE_GROUPS, type AgeGroup } from '../model/paramTypes';
import type { ModelEntry } from '../model/types';
import type { WaterRecord } from '../storage/types';

export interface DayWater {
  /** Plain water logged as water (ml). */
  plainMl: number;
  /** Water in logged foods and other drinks, from the BLS water content (g ≈ ml). */
  foodMl: number;
  totalMl: number;
  /** Logged items whose water is unknown (no water value, or tea/coffee without an amount): the total is a minimum. */
  unknown: number;
}

/** Water from drinks and food on one day. Missing water values are counted, not taken as zero. */
export function dayWater(day: string, entries: readonly ModelEntry[], water: readonly WaterRecord[]): DayWater {
  const plainMl = water.filter((w) => w.day === day).reduce((sum, w) => sum + w.ml, 0);
  let foodMl = 0;
  let unknown = 0;
  for (const e of entries) {
    if (e.dayKey !== day) continue;
    if (e.parts.length === 0) {
      // Manual entries and saved items list nutrients only; a tea/coffee mark has no amount. Supplements hold no water worth counting.
      if (!e.isSupplement || e.modifiers) unknown++;
      continue;
    }
    for (const p of e.parts) {
      const w = p.per100.WATER;
      if (w === null || w === undefined) unknown++;
      else if (w !== 't') foodMl += (p.grams * w) / 100;
    }
  }
  return { plainMl, foodMl, totalMl: plainMl + foodMl, unknown };
}

/** The DGE guide value to compare with: water from drinks and from food (oxidation water is not logged). */
export function waterTarget(group: AgeGroup): number {
  const i = AGE_GROUPS.indexOf(group);
  return (waterGuide.drinks[i] ?? waterGuide.drinks[1]) + (waterGuide.food[i] ?? waterGuide.food[1]);
}

/** Most plain water in one entry (a large bottle is 1.5 l); more is a typo. */
export const MAX_WATER_ML = 3000;
