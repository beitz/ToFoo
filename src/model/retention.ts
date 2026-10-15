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

const tableCache: Record<string, Float64Array> = {};

/**
 * Retention factors for all `ids` at once, cached per preparation/storage/scenario
 * (the hot path of the model: called for every food part).
 */
export function retentionTable(ids: readonly string[], preparation: Preparation, storage: Storage, scenario: Scenario): Float64Array {
  const key = preparation + storage + scenario;
  return (tableCache[key] ??= Float64Array.from(ids, (id) => retentionFactor(id, preparation, storage, scenario)));
}
