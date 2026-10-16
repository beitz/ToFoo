/**
 * Find a product by barcode: this phone first (no request), then Open Food Facts. A fetched
 * product is not saved until it is logged, so lookups that lead nowhere leave nothing behind.
 */
import { repo } from '../storage/repo';
import { CURRENT_SCHEMA_VERSION, type Product } from '../storage/types';
import { lookupBarcode, type LookupResult, type ProductData } from './openFoodFacts';
import { productId } from './products';

export type FindResult = { kind: 'found'; product: Product } | Exclude<LookupResult, { kind: 'found' }>;

export function toProduct(data: ProductData, match?: Product['match'], now = Date.now()): Product {
  return { ...data, id: productId(data.code), source: 'OFF', fetchedAt: now, ...(match ? { match } : {}), schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** `refresh`: fetch again even if saved (keeps the chosen BLS match). */
export async function findProduct(code: string, opts: { refresh?: boolean; fetchImpl?: typeof fetch } = {}): Promise<FindResult> {
  const saved = await repo.getProduct(productId(code));
  if (saved && !opts.refresh) return { kind: 'found', product: saved };
  const r = await lookupBarcode(code, opts.fetchImpl);
  if (r.kind !== 'found') return r;
  return { kind: 'found', product: toProduct(r.product, saved?.match) };
}
