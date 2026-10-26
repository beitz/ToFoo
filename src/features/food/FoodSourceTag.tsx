import { t, type MessageKey } from '../../i18n';
import { foodSourceKind } from '../../foods/products';
import type { FoodRef, Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';

/**
 * A tiny tag for where a thing's numbers come from, in short: BLS, Open Food Facts paired with a BLS
 * food or label only, USDA, an own food, or no food at all. Shown on things in the kitchen and on
 * the assistant's At home cards; the item sheet says which BLS food it is.
 */
export function FoodSourceTag({ foodRef, product }: { foodRef: FoodRef | undefined; product?: Product | undefined }) {
  const kind = foodSourceKind(foodRef, product);
  return (
    <span className={`source-tag${kind === 'none' ? ' source-tag-none' : ''}`}>
      {foodRef?.source === 'OFF' && <Icon name="barcode" size={12} />}
      {t(`source.short.${kind}` as MessageKey)}
    </span>
  );
}
