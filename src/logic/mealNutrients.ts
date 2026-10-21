/**
 * What one meal, one entry or one ingredient of a recipe portion gave (docs/SPEC.md, "Nutrients of
 * one meal"): the amount of each nutrient and its share of the day's need, so a single snack can be
 * looked at the way the nutrient page looks at a single nutrient. Pure (tested in mealNutrients.test.ts).
 *
 * Shares mean the same as on Home and in the day review, so a day's meals add up to the day:
 * absorbed ÷ absorbed need for nutrients to get enough of, intake ÷ limit for limits, plain amounts
 * for nutrients without a reference value. Absorption depends on the whole meal (vitamin C helps
 * iron, B12 saturates per meal), so the model's absorbed amount for the meal is split over its
 * entries by their share of the intake, as the nutrient page's "Where it came from" does.
 */
import { entryIntake } from '../model/intake';
import type { ResolvedRequirements } from '../model/requirements';
import type { MealSummary } from '../model/simulate';
import type { FoodPart, ModelEntry } from '../model/types';
import type { Batch, CustomFood, LogEntry } from '../storage/types';
import { potShare } from './batch';

/** One entry, or one ingredient (`part`, an index into the entry's parts) of a recipe portion. */
export interface Piece {
  entryId: string;
  part?: number;
}

export interface Breakdown {
  /** Intake after cooking and storage losses (central), per nutrient. */
  intake: Record<string, number>;
  /** Absorbed (central), per nutrient; for pieces the model has no meal for (older than it looks back), nothing. */
  absorbed: Record<string, number>;
  /** Nutrients some piece has no data for: the real amount may be higher. */
  missing: Set<string>;
  /** Pieces the model could not read (a food or batch no longer there). */
  unresolved: number;
  /** Every piece belongs to a meal the model ran, so `absorbed` is complete. */
  absorbedKnown: boolean;
}

const add = (rec: Record<string, number>, id: string, v: number) => {
  rec[id] = (rec[id] ?? 0) + v;
};

/** Amounts and absorbed amounts of some pieces of the log, summed. */
export function breakdown(pieces: readonly Piece[], entries: ReadonlyMap<string, ModelEntry>, meals: readonly MealSummary[], opts: { retention: boolean }): Breakdown {
  const mealOf = new Map<string, MealSummary>();
  for (const m of meals) for (const id of m.entryIds) mealOf.set(id, m);
  const out: Breakdown = { intake: {}, absorbed: {}, missing: new Set(), unresolved: 0, absorbedKnown: true };
  for (const p of pieces) {
    const entry = entries.get(p.entryId);
    if (!entry) {
      out.unresolved++;
      continue;
    }
    const part = p.part === undefined ? undefined : entry.parts[p.part];
    if (p.part !== undefined && !part) {
      out.unresolved++;
      continue;
    }
    // One ingredient of a portion: the same entry with only that ingredient (and none of the entry's direct amounts).
    const piece: ModelEntry = part ? { ...entry, parts: [part], direct: undefined } : entry;
    const ei = entryIntake(piece, 'central', opts);
    for (const [id, v] of Object.entries(ei.intake)) add(out.intake, id, v);
    for (const id of ei.missing) out.missing.add(id);
    const meal = mealOf.get(entry.id);
    if (!meal) {
      out.absorbedKnown = false;
      continue;
    }
    for (const [id, v] of Object.entries(ei.intake)) {
      const total = meal.intake[id] ?? 0;
      if (total > 0 && v > 0) add(out.absorbed, id, (meal.absorbed[id] ?? 0) * (v / total));
    }
  }
  return out;
}

export type ShareKind = 'need' | 'limit' | 'info';

/**
 * What the rows compare against. 'per100': the item's own make-up per 100 g eaten, with its share of
 * the daily reference intake per 100 g, as on the food page. 'day': what was eaten, with its share
 * of the day's absorbed need, as on Home.
 */
export type Basis = 'per100' | 'day';

export interface ShareRow {
  id: string;
  kind: ShareKind;
  /** Intake after losses: what was eaten ('day') or per 100 g of it ('per100'). */
  amount: number;
  /**
   * 'day': absorbed ÷ absorbed need ('need'), intake ÷ limit ('limit'). 'per100': per-100 g amount ÷
   * reference intake or limit. None for 'info' or when unknown.
   */
  share?: number;
  /** Some piece has no data for it: the real amount may be higher ("≥"). */
  partial: boolean;
  /** Nothing known at all: no piece has data for it ("–"). */
  noData: boolean;
}

/** One row per nutrient id, in the order given. 'per100' needs the eaten weight in grams. */
export function shareRows(b: Breakdown, ids: readonly string[], req: Pick<ResolvedRequirements, 'byNutrient' | 'infoOnly'>, basis: Basis = 'day', grams?: number): ShareRow[] {
  const factor = basis === 'per100' && grams && grams > 0 ? 100 / grams : 1;
  return ids.map((id) => {
    const r = req.byNutrient.get(id);
    const kind: ShareKind = !r || req.infoOnly.has(id) ? 'info' : r.limitOnly ? 'limit' : 'need';
    const amount = (b.intake[id] ?? 0) * factor;
    const missing = b.missing.has(id);
    const noData = missing && amount === 0;
    let share: number | undefined;
    if (!noData && r) {
      if ((kind === 'limit' || basis === 'per100') && kind !== 'info' && r.recommended > 0) share = amount / r.recommended;
      else if (kind === 'need' && r.physiological > 0 && b.absorbedKnown) share = (b.absorbed[id] ?? 0) / r.physiological;
    }
    return { id, kind, amount, share, partial: missing && !noData, noData };
  });
}

/** The nutrients one meal covers most of the day for (or 100 g of it does), biggest first; limits and amounts left out. */
export function biggestShares(rows: readonly ShareRow[], n = 3): ShareRow[] {
  return rows
    .filter((r) => r.kind === 'need' && r.id !== 'ENERCC' && r.share !== undefined && r.share >= 0.005)
    .sort((a, b) => b.share! - a.share!)
    .slice(0, n);
}

/** What 100 g of it is made of, as fractions of its weight. */
export interface Composition {
  parts: Array<{ id: 'CHO' | 'PROT625' | 'FAT' | 'FIBT'; share: number; partial: boolean; noData: boolean }>;
  /** Sugars, part of the carbohydrates. */
  sugar?: number;
  /** Water, minerals and anything not listed above (what the weight leaves); undefined when a part is unknown. */
  rest?: number;
}

const COMPOSITION = ['CHO', 'PROT625', 'FAT', 'FIBT'] as const;

/** Carbs, protein, fat, fibre and the rest as shares of the eaten weight (BLS carbohydrates exclude fibre). */
export function composition(b: Breakdown, grams: number): Composition | undefined {
  if (!(grams > 0)) return undefined;
  const parts = COMPOSITION.map((id) => {
    const missing = b.missing.has(id);
    const amount = b.intake[id] ?? 0;
    return { id, share: Math.min(1, amount / grams), partial: missing && amount > 0, noData: missing && amount === 0 };
  });
  const known = parts.reduce((a, p) => a + p.share, 0);
  const sugar = b.missing.has('SUGAR') && !b.intake.SUGAR ? undefined : (b.intake.SUGAR ?? 0) / grams;
  return { parts, sugar, rest: parts.some((p) => p.noData || p.partial) ? undefined : Math.max(0, 1 - known) };
}

/**
 * What an entry weighed, for "per 100 g": the grams logged; for a portion, its share of the weighed
 * pot, else the raw ingredients (`raw`, before cooking took up or lost water); for a saved item, its
 * serving weight if known. Undefined when unknown (manual entries, drinks).
 */
export function entryWeight(
  e: LogEntry,
  ctx: { batch?: Pick<Batch, 'cookedGrams' | 'recipe'>; custom?: Pick<CustomFood, 'servingGrams'>; parts?: readonly Pick<FoodPart, 'grams'>[] },
): { grams: number; raw: boolean } | undefined {
  switch (e.kind) {
    case 'food':
      return e.grams > 0 ? { grams: e.grams, raw: false } : undefined;
    case 'portion': {
      if (ctx.batch?.cookedGrams) {
        const grams = potShare(e, ctx.batch) * ctx.batch.cookedGrams;
        if (grams > 0) return { grams, raw: false };
      }
      const grams = (ctx.parts ?? []).reduce((a, p) => a + p.grams, 0);
      return grams > 0 ? { grams, raw: true } : undefined;
    }
    case 'custom':
      return ctx.custom?.servingGrams ? { grams: ctx.custom.servingGrams * e.servings, raw: false } : undefined;
    default:
      return undefined;
  }
}
