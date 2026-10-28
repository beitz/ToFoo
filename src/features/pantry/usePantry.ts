import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { search } from '../../foods/search';
import { productLabel } from '../../foods/products';
import { newId } from '../../lib/id';
import { refKey } from '../../lib/refs';
import { guessPlace, leftOf, packGrams, leftText, onShoppingList, pieceUnitsOf, usageOf, withStatus, type Left, type PieceUnits } from '../../logic/pantry';
import { planAdd, sectionOfRef, type NewShoppingItem } from '../../logic/shopping';
import type { HomeRef } from '../../logic/foodCheck';
import { isOn } from '../../settings/features';
import { repo, type HomeUndo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type FoodRef, type HomePlace, type PantryItem, type ShoppingItem } from '../../storage/types';
import { useShopFoods } from '../shopping/useShopping';

/** Everything at home (used-up things too); undefined while loading. */
export function usePantry(): PantryItem[] | undefined {
  return useLiveQuery(() => repo.db.pantry.toArray(), []);
}

/** Piece and pack weights by food key, so a log in pieces takes that many off at home. */
export function usePieceUnits(): (key: string) => PieceUnits | undefined {
  const d = useData();
  const saved = useLiveQuery(() => repo.pieceWeights(), []);
  return useMemo(() => pieceUnitsOf(d.productsById, saved), [d.productsById, saved]);
}

/** What is left of each thing, worked out from the log and the cooked batches. */
export function usePantryLeft(): (item: PantryItem) => Left {
  const d = useData();
  const units = usePieceUnits();
  const usage = useMemo(() => usageOf(d.log, d.batches, units), [d.log, d.batches, units]);
  return (item) => leftOf(item, usage);
}

export const placeName = (p: HomePlace) => t(`pantry.place.${p}` as MessageKey);

/** The foods at home and not used up, for checking them with what was eaten; none with At home off. */
export function useHomeRefs(): HomeRef[] {
  const d = useData();
  const pantry = usePantry();
  const left = usePantryLeft();
  if (!isOn(d.settings.features, 'atHome')) return [];
  return (pantry ?? []).flatMap((i) => (i.ref && !left(i).out ? [{ ref: i.ref, name: i.name, place: i.place }] : []));
}

/** How much is left, as shown ("2 left", "350 g"). */
export const leftLabel = (item: PantryItem, left: Left) => leftText(item, left, (n) => t('pantry.piecesLeft', { n }));

/** How the At home list names foods, guesses places and puts things on the shopping list. */
export function usePantryFoods() {
  const d = useData();
  const { typed } = useShopFoods();
  const matchOf = (ref: FoodRef): string | undefined => (ref.source === 'BLS' ? ref.code : ref.source === 'custom' ? undefined : d.productsById.get(refKey(ref))?.match?.code);
  /**
   * Where a new thing is kept: its words, its food, common shopping words, then the food database.
   * A product goes by its own name, not its label with the brand last ("Lorbeerblätter · Ostmann").
   */
  const placeOf = (name: string, ref?: FoodRef): HomePlace => {
    const words = (ref && ref.source !== 'BLS' && ref.source !== 'custom' ? d.productsById.get(refKey(ref))?.name : undefined) ?? name;
    return guessPlace(words, ref ? matchOf(ref) : undefined, () => search(d.searchIndex, words, { limit: 15, boost: d.searchBoost }));
  };
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
 * Mark something as running low, used up, or had again. Only the mark: putting it on the shopping
 * list is the user's call (owner, 2026-10-26: "it's his responsibility to add it"), one tap away
 * in the same sheet (useListPantry).
 */
export function useMarkPantry() {
  return async (next: PantryItem, status: PantryItem['status'], left: Left): Promise<HomeUndo> => {
    const marked = withStatus(next, status, left, Date.now());
    return repo.changeHome(() => ({ pantry: { put: [marked], remove: [] } }));
  };
}

/** Put something at home on the shopping list, by hand, unless it is on it already; undefined then. */
export function useListPantry() {
  const { asShopping } = usePantryFoods();
  return async (item: Pick<PantryItem, 'name' | 'ref'>): Promise<HomeUndo | undefined> => {
    let added = false;
    const undo = await repo.changeHome((_, shopping) => {
      if (onShoppingList(item, shopping)) return {};
      added = true;
      return { shopping: planAdd(shopping, [asShopping(item, shopping)], Date.now(), newId, CURRENT_SCHEMA_VERSION) };
    });
    return added ? undo : undefined;
  };
}
