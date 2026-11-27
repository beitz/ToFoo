import { newId } from '../../lib/id';
import { fromShopping, keptAtHome, planStock } from '../../logic/pantry';
import { planClear, sameThing } from '../../logic/shopping';
import { repo, type HomeUndo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type HomePlace, type ShoppingItem } from '../../storage/types';
import { usePantry, usePantryFoods, usePantryLeft } from './usePantry';

/**
 * Put bought lines away at home in one go, each where it is already kept or else where it is
 * usually kept (owner, 2026-11-27: "one tap move the items into the kitchen"). Things that are not
 * food just leave the list. The sheet with a place per line (PutAwaySheet) stays on Kitchen.
 */
export function usePutAway() {
  const pantry = usePantry();
  const left = usePantryLeft();
  const { placeOf } = usePantryFoods();
  const homeOf = (line: ShoppingItem) => (pantry ?? []).find((p) => sameThing(p, line));
  /** Where a line goes at home, or undefined when it just leaves the list. */
  const placeFor = (line: ShoppingItem): HomePlace | undefined => {
    const home = homeOf(line);
    if (!keptAtHome(line, !!home)) return undefined;
    return home?.place ?? placeOf(line.name, line.ref);
  };
  /** Put these lines away (each at `place`, or where placeFor says); all of them leave the list. */
  const putAway = async (lines: readonly ShoppingItem[], place?: HomePlace): Promise<{ undo: HomeUndo; stored: number; left: number }> => {
    const now = Date.now();
    const adds = lines.flatMap((l) => {
      const at = place ?? placeFor(l);
      return at ? [fromShopping(l, at)] : [];
    });
    const undo = await repo.changeHome((items, list) => ({
      pantry: planStock(items, adds, now, newId, CURRENT_SCHEMA_VERSION, left),
      shopping: planClear(
        list,
        now,
        lines.map((l) => l.id),
      ),
    }));
    return { undo, stored: adds.length, left: lines.length - adds.length };
  };
  return { placeFor, putAway };
}
