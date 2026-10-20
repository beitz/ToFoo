/** Pure: which body stores need a look, for the ⚠ on Home and the order on the Stores screen. */
import type { NutrientResult, StoreResult } from '../model/simulate';
import { storeTrendOf } from '../model/trend';

/**
 * A store needs attention when it is low or getting low and not filling at the recent rate. A low store that is
 * filling (an empty start on a diet that covers the need) is on its way and gets no warning; neither does a store
 * whose recent average covers nothing because nothing was logged.
 */
export function storeNeedsAttention(st: StoreResult): boolean {
  if (st.status !== 'low' && st.status !== 'gettingLow') return false;
  const tr = storeTrendOf(st);
  return !tr || tr.direction !== 'up';
}

/** Nutrients with a body store, in the order given. */
export function withStores(results: Iterable<NutrientResult>): Array<NutrientResult & { store: StoreResult }> {
  return [...results].filter((r): r is NutrientResult & { store: StoreResult } => !!r.store);
}
