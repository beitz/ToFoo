/**
 * Find foods in the online databases: a product by barcode (this phone first, then Open Food
 * Facts) or USDA foods by name. A fetched food is not saved until it is logged, so lookups that
 * lead nowhere leave nothing behind.
 */
import { createRateLimiter } from '../lib/rateLimit';
import { repo } from '../storage/repo';
import { CURRENT_SCHEMA_VERSION, type Product } from '../storage/types';
import { lookupBarcode, type LookupResult, type ProductData } from './openFoodFacts';
import { productId } from './products';
import { searchUsda, type UsdaFood, type UsdaKind, type UsdaSearchResult } from './usda';

export type FindResult = { kind: 'found'; product: Product } | Exclude<LookupResult, { kind: 'found' }>;

export function toProduct(data: ProductData, match?: Product['match'], now = Date.now()): Product {
  return { ...data, id: productId(data.code), source: 'OFF', fetchedAt: now, ...(match ? { match } : {}), schemaVersion: CURRENT_SCHEMA_VERSION };
}

export function toUsdaProduct(food: UsdaFood, match?: Product['match'], now = Date.now()): Product {
  return { ...food, id: productId(food.code, 'USDA'), source: 'USDA', fetchedAt: now, ...(match ? { match } : {}), schemaVersion: CURRENT_SCHEMA_VERSION };
}

/**
 * Open Food Facts allows 15 product reads per minute per IP address and may block an address that
 * goes over (https://openfoodfacts.github.io/openfoodfacts-server/api/, checked 2026-10-17). A batch
 * of photos can bring more barcodes than that, so lookups beyond it wait instead.
 */
const offLimiter = createRateLimiter(15, 60_000);

/** `refresh`: fetch again even if saved (keeps the chosen BLS match). */
export async function findProduct(code: string, opts: { refresh?: boolean; fetchImpl?: typeof fetch } = {}): Promise<FindResult> {
  const saved = await repo.getProduct(productId(code));
  if (saved && !opts.refresh) return { kind: 'found', product: saved };
  await offLimiter.take();
  const r = await lookupBarcode(code, opts.fetchImpl);
  if (r.kind !== 'found') return r;
  return { kind: 'found', product: toProduct(r.product, saved?.match) };
}

/** The user's own api.data.gov key, kept on this device only (not in backups, like the Anthropic key). */
const USDA_KEY_META = 'usda:apiKey';

export async function getUsdaKey(): Promise<string> {
  return (await repo.getMeta<string>(USDA_KEY_META)) ?? '';
}

export async function setUsdaKey(key: string): Promise<void> {
  await repo.setMeta(USDA_KEY_META, key.trim());
}

export type UsdaFindResult = { kind: 'ok'; products: Product[] } | Extract<UsdaSearchResult, { kind: 'error' }>;

/** Search USDA by name. A food saved on this phone is returned as saved (with its chosen BLS match). */
export async function findUsda(query: string, kind: UsdaKind = 'all', pageSize?: number): Promise<UsdaFindResult> {
  const r = await searchUsda(query, { apiKey: await getUsdaKey(), kind, ...(pageSize ? { pageSize } : {}) });
  if (r.kind !== 'ok') return r;
  const products = await Promise.all(r.foods.map(async (f) => (await repo.getProduct(productId(f.code, 'USDA'))) ?? toUsdaProduct(f)));
  return { kind: 'ok', products };
}
