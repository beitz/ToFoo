import type { Preparation, Scenario, Storage } from './paramTypes';

export type { Preparation, Scenario, Storage };

/** Confidence of a log entry: A measured, B standard, C estimate (docs/SPEC.md). */
export type EntryConfidence = 'A' | 'B' | 'C';

/** A BLS-style value per 100 g: number, missing (null) or trace ("t"). */
export type RawValue = number | null | 't';

/** One food inside an entry: a single food, or one ingredient of a recipe portion. */
export interface FoodPart {
  label: string;
  /** Grams eaten (for a recipe portion: this ingredient's grams ÷ portions). */
  grams: number;
  /** Values per 100 g by nutrient id (incl. derived ids and RETOL/FOLAC). */
  per100: Readonly<Record<string, RawValue>>;
  /** BLS provenance code per nutrient id (data/README.md), for data uncertainty. */
  provenance?: Readonly<Record<string, string>>;
  /** BLS main group letter, for iron (heme, meat/fish/poultry, phytate). */
  group?: string;
  /** English name, to detect tea and coffee. */
  nameEn?: string;
  /** German name, for finding foods by name in either language (Insights). */
  nameDe?: string;
  preparation: Preparation;
  storage: Storage;
}

export interface ModelEntry {
  id: string;
  label: string;
  /** Epoch milliseconds. */
  time: number;
  /** Local calendar day (YYYY-MM-DD) of `time`. */
  dayKey: string;
  confidence: EntryConfidence;
  isSupplement: boolean;
  parts: FoodPart[];
  /** Absolute amounts per nutrient (manual entries, supplements). */
  direct?: Readonly<Record<string, number>>;
  /** Drinks with this meal that change iron absorption. */
  modifiers?: { tea?: boolean; coffee?: boolean };
}

/**
 * logged: complete; partial: some meals missing; fasted: nothing eaten; unknown: no entries (follows "Fill in unlogged days").
 * Per-day overrides of that setting: filled (ate as usual, filled in from recent intake) and excluded (left out of
 * averages and reviews; stores still assume recent intake, since the body kept using them that day).
 */
export type DayStatus = 'logged' | 'partial' | 'fasted' | 'unknown' | 'filled' | 'excluded';

export interface ModelSettings {
  absorption: boolean;
  retention: boolean;
  sun: boolean;
  /**
   * Fill in unlogged past days (and the rest of partly logged ones) with recent intake, widening the range.
   * Off: the log is taken as complete, so an unlogged day counts as nothing eaten.
   */
  imputeUnlogged: boolean;
  shortWindowDays: number;
  longWindowDays: number;
  mealWindowMinutes: number;
}

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  absorption: true,
  retention: true,
  sun: true,
  imputeUnlogged: false,
  shortWindowDays: 7,
  longWindowDays: 14,
  mealWindowMinutes: 120,
};

export type ByScenario<T> = Record<Scenario, T>;
