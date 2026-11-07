import { useMemo } from 'react';
import { useData } from '../../app/data';
import { refKey } from '../../lib/refs';
import { homeLooks, type HomeLook, type HomeThing } from '../../logic/foodIcons';
import { homeKindOf, isHomeKind, type HomeKind } from '../../logic/homeKind';
import { totalLeft } from '../../logic/stock';
import type { Batch, PantryItem } from '../../storage/types';
import { usePantry } from './usePantry';

/** The key a cooked pot's tile goes by, beside pantry item ids. */
export const potKey = (b: Pick<Batch, 'id'>) => `batch:${b.id}`;

/** How a thing at home shows on its tile: icon, short name and kind (the ring's colour). */
export interface HomeTileLook extends HomeLook {
  kind: HomeKind;
  /** The kind the app would pick by itself, shown when the user changes it. */
  autoKind: HomeKind;
}

/**
 * Icons, short names and kinds for everything at home (src/logic/foodIcons.ts `homeLooks`,
 * src/logic/homeKind.ts): every pantry item and every cooked pot with portions left, so a short name
 * is unique across the kitchen and the same in Log meal and the Kitchen tab. Look up an item by its
 * id, a pot by `potKey`.
 */
export function useHomeLooks(): (key: string) => HomeTileLook | undefined {
  const d = useData();
  const pantry = usePantry();
  const looks = useMemo(() => {
    const things: HomeThing[] = [];
    const kinds = new Map<string, { kind: HomeKind; autoKind: HomeKind }>();
    for (const b of d.batches) {
      if (totalLeft(b) <= 0) continue;
      things.push({ id: potKey(b), name: b.recipe.name, fallback: 'pot-of-food' });
      kinds.set(potKey(b), { kind: 'cooked', autoKind: 'cooked' });
    }
    for (const item of pantry ?? []) {
      things.push(thingOf(item, d));
      const autoKind = autoKindOf(item, d);
      kinds.set(item.id, { kind: isHomeKind(item.kind) ? item.kind : autoKind, autoKind });
    }
    const looks = homeLooks(things);
    return new Map([...looks].map(([id, look]) => [id, { ...look, ...kinds.get(id)! }]));
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

function autoKindOf(item: PantryItem, d: ReturnType<typeof useData>): HomeKind {
  const ref = item.ref;
  const product = ref && ref.source !== 'BLS' && ref.source !== 'custom' ? d.productsById.get(refKey(ref)) : undefined;
  const code = ref?.source === 'BLS' ? ref.code : product?.match?.code;
  const food = code ? d.foods.byCode.get(code) : undefined;
  return homeKindOf({ place: item.place, ...(food ? { food } : {}), ...(product ? { product } : {}) });
}
