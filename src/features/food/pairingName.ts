import type { FoodDb } from '../../foods/foodDb';
import { t } from '../../i18n';
import type { Product } from '../../storage/types';

/** What a product's vitamins and minerals come from, in words: the similar food, or "its ingredients (n BLS foods)". */
export function pairingName(match: Pick<NonNullable<Product['match']>, 'code' | 'parts'>, foods: Pick<FoodDb, 'byCode'>): string {
  if (match.parts) return t('match.mixName', { n: match.parts.length });
  return foods.byCode.get(match.code)?.nameEn ?? match.code;
}
