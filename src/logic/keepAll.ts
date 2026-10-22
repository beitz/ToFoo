/**
 * "If you keep all" under the assistant's proposals (design 2026-10-22): what the open meal cards
 * would do to the nutrients that need attention, as Home shows them (the window average in % of the
 * need, before → after), and the energy they add. Pure (tested in keepAll.test.ts).
 */
import type { NutrientResult } from '../model/simulate';
import type { ResolvedRequirements } from '../model/requirements';
import { liftPoints } from './nextToCook';

type Status = Pick<NutrientResult, 'status' | 'kind' | 'value' | 'store'>;

export interface KeepAllMove {
  id: string;
  /** Window average now and after, in percent of the need. */
  before: number;
  after: number;
}

/** A change smaller than this many points is not worth naming. */
const MIN_POINTS = 1;

export function keepAllPreview(
  intakes: ReadonlyArray<Readonly<Record<string, number>>>,
  nutrients: ReadonlyMap<string, Status>,
  req: Pick<ResolvedRequirements, 'byNutrient'>,
  windowDays: number,
  max = 4,
): { moves: KeepAllMove[]; kcal: number } {
  const total: Record<string, number> = {};
  for (const intake of intakes) for (const [id, v] of Object.entries(intake)) total[id] = (total[id] ?? 0) + v;
  const moves: KeepAllMove[] = [];
  for (const [id, r] of nutrients) {
    // Stores show % full on Home, not an average, so a before → after would mean something else.
    if (r.store || r.kind !== 'rolling' || (r.status !== 'low' && r.status !== 'gettingLow')) continue;
    const need = req.byNutrient.get(id)?.recommended;
    const amount = total[id];
    if (!need || !amount) continue;
    const points = liftPoints(amount / need, windowDays);
    if (points < MIN_POINTS) continue;
    const before = Math.round(r.value.central * 100);
    moves.push({ id, before, after: before + Math.round(points) });
  }
  moves.sort((a, b) => b.after - b.before - (a.after - a.before));
  return { moves: moves.slice(0, max), kcal: total.ENERCC ?? 0 };
}
