import { href } from '../../app/router';
import type { AppData } from '../../app/data';
import { isProductCode } from '../../foods/products';
import { refKey } from '../../lib/refs';
import type { FoodRef } from '../../storage/types';

type Lookup = Pick<AppData, 'foods' | 'productsById'>;

/** The food page for a BLS code or a product id, when there is one to show. */
export function foodHref(d: Lookup, code: string | undefined): string | undefined {
  if (!code) return undefined;
  const known = isProductCode(code) ? d.productsById.has(code) : d.foods.byCode.has(code);
  return known ? href('food', code) : undefined;
}

/** The food page for a stored reference (an ingredient, an item at home, on the list); saved items have none. */
export function refHref(d: Lookup, ref: FoodRef | undefined): string | undefined {
  if (!ref || ref.source === 'custom') return undefined;
  return foodHref(d, ref.source === 'BLS' ? ref.code : refKey(ref));
}
