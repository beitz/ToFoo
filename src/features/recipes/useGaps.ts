import { useMemo } from 'react';
import { useData } from '../../app/data';
import { GAP_WEIGHT } from '../../logic/nextToCook';
import type { SwapGap } from '../../logic/recipePage';

export type GapStatus = keyof typeof GAP_WEIGHT;

/**
 * The user's gaps now: nutrients with a recommended intake that are low or a bit low. A stored
 * nutrient counts by its store, as on Home and the food page.
 */
export function useGaps(): ReadonlyMap<string, GapStatus> {
  const d = useData();
  return useMemo(() => {
    const out = new Map<string, GapStatus>();
    for (const [id, r] of d.model.nutrients) {
      const req = d.requirements.byNutrient.get(id);
      if (!req || req.limitOnly || !(req.recommended > 0)) continue;
      const status = r.store?.status ?? r.status;
      if (status === 'low' || status === 'gettingLow') out.set(id, status);
    }
    return out;
  }, [d.model.nutrients, d.requirements]);
}

/** The gaps as the swap list weighs them, with what one portion (`intake`) gives of each now. */
export function useSwapGaps(intake: Readonly<Record<string, number>>): SwapGap[] {
  const d = useData();
  const gaps = useGaps();
  return useMemo(
    () =>
      [...gaps].map(([id, status]) => {
        const recommended = d.requirements.byNutrient.get(id)!.recommended;
        return { id, weight: GAP_WEIGHT[status], recommended, before: (intake[id] ?? 0) / recommended };
      }),
    [gaps, d.requirements, intake],
  );
}
