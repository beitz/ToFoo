import { howOften } from '../../model/howOften';
import { storage } from '../../model/parameters';
import type { Cited } from '../model/paramTypes';
import type { Food } from '../foods/foodDb';

export interface CoverExample {
  food: Food;
  /** Days of the reference intake that 100 g holds. */
  days: number;
}

/**
 * The "How often" examples for a nutrient: how many days of the reference intake 100 g of each
 * example food covers, from its BLS value. Foods missing from the table or without a value are left out.
 */
export function coverExamples(id: string, byCode: ReadonlyMap<string, Food>, recommended: number): CoverExample[] {
  if (!(recommended > 0)) return [];
  const out: CoverExample[] = [];
  for (const code of howOften[id]?.examples ?? []) {
    const food = byCode.get(code);
    const v = food?.per100[id];
    if (food && typeof v === 'number') out.push({ food, days: v / recommended });
  }
  return out;
}

/** The research behind a nutrient's slow window, if it has one. */
export function slowBasis(id: string): Cited | undefined {
  const m = storage[id];
  return m?.kind === 'rolling' && m.window === 'slow' ? m.basis : undefined;
}
