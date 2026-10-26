import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { search } from '../../foods/search';
import { productLabel } from '../../foods/products';
import { newId } from '../../lib/id';
import { refKey } from '../../lib/refs';
import { guessPlace, leftOf, packGrams, leftText, onShoppingList, usageOf, withStatus, type Left } from '../../logic/pantry';
import { planAdd, sectionOfRef, type NewShoppingItem } from '../../logic/shopping';
import { isOn } from '../../settings/features';
import { repo, type HomeUndo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type FoodRef, type HomePlace, type PantryItem, type ShoppingItem } from '../../storage/types';
import { useShopFoods } from '../shopping/useShopping';

/** Everything at home (used-up things too); undefined while loading. */
export function usePantry(): PantryItem[] | undefined {
  return useLiveQuery(() => repo.db.pantry.toArray(), []);
}

/** What is left of each thing, worked out from the log and the cooked batches. */
export function usePantryLeft(): (item: PantryItem) => Left {
  const d = useData();
  const usage = useMemo(() => usageOf(d.log, d.batches), [d.log, d.batches]);
  return (item) => leftOf(item, usage);
}

export const placeName = (p: HomePlace) => t(`pantry.place.${p}` as MessageKey);

/** How much is left, as shown ("2 left", "350 g"). */
export const leftLabel = (item: PantryItem, left: Left) => leftText(item, left, (n) => t('pantry.piecesLeft', { n }));

/** How the At home list names foods, guesses places and puts things on the shopping list. */
export function usePantryFoods() {
  const d = useData();
  const { typed } = useShopFoods();
  const matchOf = (ref: FoodRef): string | undefined => (ref.source === 'BLS' ? ref.code : ref.source === 'custom' ? undefined : d.productsById.get(refKey(ref))?.match?.code);
  /** Where a new thing is kept: its words, its food, common shopping words, then the food database. */
  const placeOf = (name: string, ref?: FoodRef): HomePlace => guessPlace(name, ref ? matchOf(ref) : undefined, () => search(d.searchIndex, name, { limit: 15, boost: d.searchBoost }));
  /** The current name of a food, for showing which food an item is. */
  const nameOfRef = (ref: FoodRef): string | undefined => {
    if (ref.source === 'BLS') return d.foods.byCode.get(ref.code)?.nameEn;
    if (ref.source === 'custom') return d.customFoodsById.get(ref.id)?.name;
    const product = d.productsById.get(refKey(ref));
    return product ? productLabel(product) : undefined;
  };
  /** The weight of a whole pack as its label gives it ("12.5 g"), for products sold by weight. */
  const packGramsOf = (ref: FoodRef | undefined): number | undefined => {
    return ref && ref.source !== 'BLS' && ref.source !== 'custom' ? packGrams(d.productsById.get(refKey(ref))) : undefined;
  };
  /** A thing at home as a shopping list line, sorted like the list sorts it. */
  const asShopping = (item: Pick<PantryItem, 'name' | 'ref'>, shopping: readonly ShoppingItem[]): NewShoppingItem =>
    item.ref ? { name: item.name, ref: item.ref, section: sectionOfRef(item.ref, matchOf) } : typed(item.name, shopping);
  return { placeOf, nameOfRef, asShopping, packGramsOf };
}

/**
 * Mark something as running low, used up, or had again. Running low and used up put it on the
 * shopping list too (when the list is on and it is not on it yet), in one undoable change.
 */
export function useMarkPantry() {
  const d = useData();
  const { asShopping } = usePantryFoods();
  const shoppingOn = isOn(d.settings.features, 'shoppingList');
  return async (next: PantryItem, status: PantryItem['status'], left: Left): Promise<{ undo: HomeUndo; listed: boolean }> => {
    const now = Date.now();
    const marked = withStatus(next, status, left, now);
    let listed = false;
    const undo = await repo.changeHome((_, shopping) => {
      listed = !!status && shoppingOn && !onShoppingList(next, shopping);
      return { pantry: { put: [marked], remove: [] }, ...(listed ? { shopping: planAdd(shopping, [asShopping(next, shopping)], now, newId, CURRENT_SCHEMA_VERSION) } : {}) };
    });
    return { undo, listed };
  };
}
