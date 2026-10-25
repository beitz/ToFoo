import { href } from '../../app/router';
import type { AppData } from '../../app/data';
import { isProductCode, productRef } from '../../foods/products';
import { refKey } from '../../lib/refs';
import type { FoodRef } from '../../storage/types';

type Lookup = Pick<AppData, 'foods' | 'productsById'>;

/** The food page for a BLS code or a product id, when there is one to show. */
export function foodHref(d: Lookup, code: string | undefined): string | undefined {
  if (!code) return undefined;
  const known = isProductCode(code) ? d.productsById.has(code) : d.foods.byCode.has(code);
  return known ? href('food', code) : undefined;
}

/** The stored reference for a BLS code or a product id (favourites, the kitchen), when the food is known. */
export function refOfCode(d: Lookup, code: string | undefined): FoodRef | undefined {
  if (!code) return undefined;
  if (isProductCode(code)) {
    const product = d.productsById.get(code);
    return product ? productRef(product) : undefined;
  }
  return d.foods.byCode.has(code) ? { source: 'BLS', version: d.foods.version, code } : undefined;
}

/** The food page for a stored reference (an ingredient, an item at home, on the list); saved items have none. */
export function refHref(d: Lookup, ref: FoodRef | undefined): string | undefined {
  if (!ref || ref.source === 'custom') return undefined;
  return foodHref(d, ref.source === 'BLS' ? ref.code : refKey(ref));
}
