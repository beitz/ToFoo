/** Pure glue: blood test results → measured store levels for the model. */
import { labMarkers } from '../../model/parameters';
import type { LabResult } from '../storage/types';

/** Latest result per nutrient, converted to a store amount. Unknown markers are skipped. */
export function measuredStores(results: readonly LabResult[] | undefined): Record<string, { day: string; amount: number; result: LabResult }> {
  const out: Record<string, { day: string; amount: number; result: LabResult }> = {};
  for (const r of results ?? []) {
    const m = labMarkers[r.marker]?.value;
    if (!m) continue;
    const prev = out[m.nutrient];
    if (prev && prev.day >= r.day) continue;
    out[m.nutrient] = { day: r.day, amount: r.value * m.storePerUnit, result: r };
  }
  return out;
}
