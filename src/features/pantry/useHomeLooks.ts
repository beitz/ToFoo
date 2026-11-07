import { useMemo } from 'react';
import { useData } from '../../app/data';
import { refKey } from '../../lib/refs';
import { homeLooks, type HomeLook, type HomeThing } from '../../logic/foodIcons';
import { totalLeft } from '../../logic/stock';
import type { Batch, PantryItem } from '../../storage/types';
import { usePantry } from './usePantry';

/** The key a cooked pot's tile goes by, beside pantry item ids. */
export const potKey = (b: Pick<Batch, 'id'>) => `batch:${b.id}`;

/**
 * Icons and short names for everything at home (src/logic/foodIcons.ts `homeLooks`): every pantry
 * item and every cooked pot with portions left, so a short name is unique across the kitchen and the
 * same in Log meal and the Kitchen tab. Look up an item by its id, a pot by `potKey`.
 */
export function useHomeLooks(): (key: string) => HomeLook | undefined {
  const d = useData();
  const pantry = usePantry();
  const looks = useMemo(() => {
    const things: HomeThing[] = [];
    for (const b of d.batches) {
      if (totalLeft(b) > 0) things.push({ id: potKey(b), name: b.recipe.name, fallback: 'pot-of-food' });
    }
    for (const item of pantry ?? []) things.push(thingOf(item, d));
    return homeLooks(things);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantry, d.batches, d.productsById, d.foods]);
  return (key) => looks.get(key);
}

function thingOf(item: PantryItem, d: ReturnType<typeof useData>): HomeThing {
  const ref = item.ref;
  const code = !ref || ref.source === 'custom' ? undefined : ref.source === 'BLS' ? ref.code : d.productsById.get(refKey(ref))?.match?.code;
  const english = code ? d.foods.byCode.get(code)?.nameEn : undefined;
  return { id: item.id, name: item.name, ...(code ? { code } : {}), ...(english ? { english } : {}), ...(item.icon ? { icon: item.icon } : {}), ...(item.short ? { short: item.short } : {}) };
}
