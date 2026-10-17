/**
 * Changing the food of a logged entry (docs/SPEC.md, "Editing an entry"): pure helpers. The entry
 * keeps its id, time, day and confidence; only what was eaten changes.
 */
import type { CustomFood, FoodRef, LogEntry } from '../storage/types';

type FoodEntry = Extract<LogEntry, { kind: 'food' }>;
/** A food entry while it is edited: after a manual entry is replaced by a food, the grams are still to be entered. */
export type FoodDraft = Omit<FoodEntry, 'grams'> & { grams: number | undefined };
export type EntryDraft = Exclude<LogEntry, { kind: 'food' }> | FoodDraft;

/** Entry kinds whose food can be replaced. Recipe portions come from batch stock, drinks are just tea or coffee. */
export function canReplaceFood(e: EntryDraft): boolean {
  return e.kind === 'food' || e.kind === 'custom' || e.kind === 'manual';
}

/**
 * The grams to start from when the food is replaced: the same amount for a food entry, servings ×
 * serving weight for a saved item that has one. A manual entry has no amount, so the user enters it.
 */
export function gramsBefore(e: EntryDraft, customFoods: ReadonlyMap<string, CustomFood>): number | undefined {
  if (e.kind === 'food') return e.grams;
  if (e.kind === 'custom') {
    const g = customFoods.get(e.customFoodId)?.servingGrams;
    return g ? g * e.servings : undefined;
  }
  return undefined;
}

/** The entry with another food in place of the old one; the amount carries over where there is one. */
export function replaceFood(e: EntryDraft, ref: FoodRef, label: string, customFoods: ReadonlyMap<string, CustomFood>): FoodDraft {
  const { id, schemaVersion, time, day, confidence } = e;
  return { id, schemaVersion, time, day, confidence, kind: 'food', ref, label, grams: gramsBefore(e, customFoods), preparation: e.kind === 'food' ? e.preparation : 'asListed' };
}

/** The finished entry, or null while the amount is missing. */
export function completeDraft(e: EntryDraft): LogEntry | null {
  if (e.kind !== 'food') return e;
  return e.grams && e.grams > 0 ? { ...e, grams: e.grams } : null;
}
