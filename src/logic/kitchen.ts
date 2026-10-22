/**
 * The Kitchen tab's sections (design 2026-10-22, "Kitchen · one flow"): what is at home by place,
 * with cooked portions where they are kept. Pure; the page adds the basket in front.
 */
import type { Batch, HomePlace, PantryItem } from '../storage/types';
import { HOME_PLACES } from '../storage/types';

export interface PortionsHere {
  batch: Batch;
  /** Portions of this pot kept in this place. */
  portions: number;
}

export interface KitchenPlace {
  place: HomePlace;
  portions: PortionsHere[];
  items: PantryItem[];
}

/**
 * Every place in order, with the pots that have portions there (oldest first) and the things kept
 * there (by name). A portion kept "fresh" counts as fridge: it waits in the fridge until eaten.
 */
export function kitchenPlaces(items: readonly PantryItem[], batches: readonly Batch[]): KitchenPlace[] {
  const pots = [...batches].sort((a, b) => a.cookedAt - b.cookedAt);
  return HOME_PLACES.map((place) => {
    const portions: PortionsHere[] = [];
    for (const batch of pots) {
      const n = place === 'fridge' ? batch.remaining.fresh + batch.remaining.fridge : place === 'freezer' ? batch.remaining.freezer : 0;
      if (n > 0) portions.push({ batch, portions: n });
    }
    return { place, portions, items: items.filter((i) => i.place === place).sort((a, b) => a.name.localeCompare(b.name)) };
  });
}

/** How many things a place holds: one per pot with portions there, one per thing. */
export function placeCount(p: KitchenPlace): number {
  return p.portions.length + p.items.length;
}

/**
 * The section in view: the last one whose top has scrolled up to the line under the sticky
 * overview. `tops` are the sections' distances from the top of the screen, in page order.
 */
export function sectionInView(tops: readonly number[], line: number): number {
  let current = 0;
  tops.forEach((top, i) => {
    if (top <= line) current = i;
  });
  return current;
}
