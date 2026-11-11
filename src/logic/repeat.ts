/**
 * Repeating a past meal (docs/SPEC.md, "Faster repeat logging"): pure helpers that turn a logged
 * meal into new entries, and find recent meals worth offering again.
 */
import { groupMeals } from '../model/simulate';
import { refKey } from '../lib/refs';
import type { Batch, FavouriteMeal, FavouriteMealItem, LogEntry, NewLogEntry } from '../storage/types';
import { stockPortionsFor } from './batch';
import { bookingSlot, nextStorage } from './stock';

export interface RepeatResult {
  entries: NewLogEntry[];
  /** Labels of items that could not be repeated (a batch with no portions left). */
  skipped: string[];
}

/**
 * Copy a meal so that its last item lands at `time`. Items keep their spacing (a tea 30 minutes
 * after the meal stays 30 minutes after it), because drink timing matters for iron absorption.
 * Portions come from the batch's current stock. When that batch has run out, the newest batch of
 * the same recipe with portions left stands in (a pinned "chili and bread" outlives one pot); when
 * no batch of the recipe has any left, the item is skipped.
 */
export function repeatMeal(meal: readonly LogEntry[], time: number, dayOf: (time: number) => string, batches: ReadonlyMap<string, Batch>): RepeatResult {
  const entries: NewLogEntry[] = [];
  const skipped: string[] = [];
  if (meal.length === 0) return { entries, skipped };
  const last = Math.max(...meal.map((e) => e.time));
  // Portions taken in this copy, per batch and slot, so two portions of one batch do not overdraw it.
  const taken = new Map<string, Batch>();
  for (const e of [...meal].sort((a, b) => a.time - b.time)) {
    const at = time - (last - e.time);
    const day = dayOf(at);
    const { id: _id, schemaVersion: _v, ...rest } = e;
    if (rest.kind !== 'portion') {
      entries.push({ ...rest, time: at, day });
      continue;
    }
    const current = (id: string) => taken.get(id) ?? batches.get(id);
    const original = current(rest.batchId);
    const canServe = (b: Batch): boolean => {
      const storage = nextStorage(b, day);
      return !!storage && b.remaining[bookingSlot(b, storage)] >= rest.portions;
    };
    const batch = original && canServe(original)
      ? original
      : original
        ? [...batches.values()]
            .map((b) => current(b.id)!)
            .filter((b) => b.recipeId === original.recipeId && canServe(b))
            .sort((a, b) => b.cookedAt - a.cookedAt)[0]
        : undefined;
    if (!batch) {
      skipped.push(rest.label);
      continue;
    }
    const slot = bookingSlot(batch, nextStorage(batch, day)!);
    taken.set(batch.id, { ...batch, remaining: { ...batch.remaining, [slot]: batch.remaining[slot] - rest.portions } });
    entries.push({ ...rest, batchId: batch.id, storage: slot, time: at, day });
  }
  return { entries, skipped };
}

/** The unit an item's amount is changed in when it is logged again: as it was logged (pieces stay pieces). */
export type RepeatUnit = 'g' | 'pieces' | 'portions' | 'servings';

/** How much of an item was logged, in its own unit; undefined for things without an amount (tea, a manual entry). */
export function repeatAmount(e: LogEntry): { value: number; unit: RepeatUnit } | undefined {
  switch (e.kind) {
    case 'food':
      return e.pieces ? { value: e.pieces, unit: 'pieces' } : { value: e.grams, unit: 'g' };
    case 'portion':
      return e.grams !== undefined ? { value: e.grams, unit: 'g' } : { value: e.portions, unit: 'portions' };
    case 'custom':
      return { value: e.servings, unit: 'servings' };
    default:
      return undefined;
  }
}

/**
 * An item with another amount in the unit of `repeatAmount`; what hangs on it follows: the grams of
 * pieces, and the portions a serving by weight takes from its pot's stock (none when it took none).
 */
export function withAmount(e: LogEntry, value: number, batches: ReadonlyMap<string, Batch>): LogEntry {
  if (!(value > 0)) return e;
  switch (e.kind) {
    case 'food':
      return e.pieces ? { ...e, pieces: value, grams: Math.round(((e.grams / e.pieces) * value) * 10) / 10 } : { ...e, grams: value };
    case 'portion': {
      if (e.grams === undefined) return { ...e, portions: value };
      const batch = batches.get(e.batchId);
      return { ...e, grams: value, portions: e.portions === 0 || !batch ? e.portions : stockPortionsFor(value, batch) };
    }
    case 'custom':
      return { ...e, servings: value };
    default:
      return e;
  }
}

/**
 * The items of a meal picked to log again (owner's ask, 2026-11-11: just the soup of Sunday's big
 * meal, as leftovers), each with its new amount where one was given. Unpicked items are left out;
 * the meal's order is kept so `repeatMeal` keeps their spacing.
 */
export function pickFromMeal(meal: readonly LogEntry[], picks: ReadonlyMap<string, number | undefined>, batches: ReadonlyMap<string, Batch>): LogEntry[] {
  return meal.filter((e) => picks.has(e.id)).map((e) => {
    const value = picks.get(e.id);
    return value === undefined ? e : withAmount(e, value, batches);
  });
}

/** What makes two meals "the same" (Recent list, favourites): the same items in the same amounts. */
export function mealSignature(meal: readonly LogEntry[], batches: ReadonlyMap<string, Batch>): string {
  return meal
    .map((e) => {
      switch (e.kind) {
        case 'food':
          return `${refKey(e.ref)}×${e.grams}`;
        case 'portion':
          return `portion:${batches.get(e.batchId)?.recipeId ?? e.label}×${e.grams ? `${e.grams}g` : e.portions}${e.ingredients ? '*' : ''}`;
        case 'custom':
          return `custom:${e.customFoodId}×${e.servings}`;
        case 'manual':
          return `manual:${e.label}`;
        case 'drink':
          return `drink:${e.drink}`;
      }
    })
    .sort()
    .join('|');
}

/**
 * The most recent distinct meals with at least `minItems` items, newest first. Single items are
 * already one tap away under Recent foods or the stock chips, so they are left out by default.
 */
export function recentMeals(log: readonly LogEntry[], windowMinutes: number, batches: ReadonlyMap<string, Batch>, opts: { limit?: number; minItems?: number; before?: number } = {}): LogEntry[][] {
  const { limit = 3, minItems = 2, before = Infinity } = opts;
  const meals = groupMeals(
    log.filter((e) => e.time < before),
    windowMinutes,
  );
  const seen = new Set<string>();
  const out: LogEntry[][] = [];
  for (let i = meals.length - 1; i >= 0 && out.length < limit; i--) {
    const meal = meals[i]!;
    if (meal.length < minItems) continue;
    const sig = mealSignature(meal, batches);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(meal);
  }
  return out;
}

const MINUTE = 60_000;

/** Pin a logged meal: keep its items and their spacing, drop time, day and ids. */
export function favouriteFromMeal(meal: readonly LogEntry[], id: string): FavouriteMeal {
  const last = Math.max(...meal.map((e) => e.time));
  const items = [...meal]
    .sort((a, b) => a.time - b.time)
    .map((e): FavouriteMealItem => {
      const { id: _id, schemaVersion: _v, time, day: _day, ...rest } = e;
      return { ...rest, offsetMinutes: Math.round((last - time) / MINUTE) };
    });
  return { id, items };
}

/**
 * A pinned meal as log entries that ended at time 0, so the same helpers serve it as a past meal:
 * `repeatMeal` re-times it, `mealSignature` matches it against Recent meals.
 */
export function favouriteAsMeal(fav: FavouriteMeal): LogEntry[] {
  return fav.items.map(({ offsetMinutes, ...rest }, i) => ({ ...rest, id: `${fav.id}:${i}`, schemaVersion: 0, time: -offsetMinutes * MINUTE, day: '' }) as LogEntry);
}
