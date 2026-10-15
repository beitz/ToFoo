import { preparationRetention, retentionClassOf, storageRetention } from '../../model/parameters';
import type { Preparation, Scenario, Storage } from './paramTypes';

/** Share of a nutrient left after preparation and storage (1 = no loss). */
export function retentionFactor(nutrient: string, preparation: Preparation, storage: Storage, scenario: Scenario): number {
  const cls = retentionClassOf[nutrient];
  if (!cls) return 1;
  const prep = preparationRetention.value[preparation][cls]?.[scenario] ?? 1;
  const store = storageRetention.value[storage][cls]?.[scenario] ?? 1;
  return prep * store;
}
