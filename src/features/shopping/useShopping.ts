import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { search } from '../../foods/search';
import { productLabel } from '../../foods/products';
import { refKey } from '../../lib/refs';
import { commonSection, sameThing, sectionFromFoods, sectionOfRef, type NewShoppingItem } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import type { FoodRef, Ingredient, ShoppingItem, ShopSection } from '../../storage/types';

/** Every shopping list line (cleared ones too, for suggestions); undefined while loading. */
export function useShopping(): ShoppingItem[] | undefined {
  return useLiveQuery(() => repo.db.shopping.toArray(), []);
}

/** How the list names and sorts foods: by their current name, and products by their paired BLS food. */
export function useShopFoods() {
  const d = useData();
  const sectionOf = (ref: FoodRef): ShopSection => sectionOfRef(ref, (r) => d.productsById.get(refKey(r))?.match?.code);
  const nameOf = (ing: Ingredient): string => {
    if (ing.ref.source === 'BLS') return d.foods.byCode.get(ing.ref.code)?.nameEn ?? ing.name;
    const product = d.productsById.get(refKey(ing.ref));
    return product ? productLabel(product) : ing.name;
  };
  /** Common shopping words first, then the food database's best hits. */
  const guessSection = (name: string): ShopSection =>
    commonSection(name) ?? sectionFromFoods(name, search(d.searchIndex, name, { limit: 15, boost: d.searchBoost }));
  /** A typed name: where it was before if it was bought before, else a guess from the food database. */
  const typed = (name: string, items: readonly ShoppingItem[]): NewShoppingItem => {
    const before = items.filter((i) => sameThing(i, { name })).sort((a, b) => b.addedAt - a.addedAt)[0];
    if (before) return { name, section: before.section, ...(before.ref ? { ref: before.ref } : {}) };
    return { name, section: guessSection(name) };
  };
  return { sectionOf, nameOf, typed };
}
