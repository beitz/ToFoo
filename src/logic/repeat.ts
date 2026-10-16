/**
 * Repeating a past meal (docs/SPEC.md, "Faster repeat logging"): pure helpers that turn a logged
 * meal into new entries, and find recent meals worth offering again.
 */
import { groupMeals } from '../model/simulate';
import { refKey } from '../lib/refs';
import type { Batch, LogEntry, NewLogEntry } from '../storage/types';
import { bookingSlot, nextStorage } from './stock';

export interface RepeatResult {
  entries: NewLogEntry[];
  /** Labels of items that could not be repeated (a batch with no portions left). */
  skipped: string[];
}

/**
 * Copy a meal so that its last item lands at `time`. Items keep their spacing (a tea 30 minutes
 * after the meal stays 30 minutes after it), because drink timing matters for iron absorption.
 * Portions come from the batch's current stock; a batch that has run out is skipped.
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
    const batch = taken.get(rest.batchId) ?? batches.get(rest.batchId);
    const storage = batch ? nextStorage(batch, day) : null;
    if (!batch || !storage) {
      skipped.push(rest.label);
      continue;
    }
    const slot = bookingSlot(batch, storage);
    if (batch.remaining[slot] < rest.portions) {
      skipped.push(rest.label);
      continue;
    }
    taken.set(batch.id, { ...batch, remaining: { ...batch.remaining, [slot]: batch.remaining[slot] - rest.portions } });
    entries.push({ ...rest, storage: slot, time: at, day });
  }
  return { entries, skipped };
}

/** What makes two meals "the same" for the Recent list: the same items in the same amounts. */
function mealSignature(meal: readonly LogEntry[], batches: ReadonlyMap<string, Batch>): string {
  return meal
    .map((e) => {
      switch (e.kind) {
        case 'food':
          return `${refKey(e.ref)}×${e.grams}`;
        case 'portion':
          return `portion:${batches.get(e.batchId)?.recipeId ?? e.label}×${e.portions}`;
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
