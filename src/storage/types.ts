/**
 * Stored records. Every record carries `schemaVersion`; migrations in ./migrations.ts bring old
 * records up to CURRENT_SCHEMA_VERSION on app start.
 */
import type { ActivityLevel, Menstruation, PhytateIntake, Preparation, Sex, Storage } from '../model/paramTypes';
import type { EntryConfidence } from '../model/types';
import type { SkinExposure } from '../model/sun';
import type { StartingLevelChoice } from '../model/simulate';
import type { ProductData } from '../foods/openFoodFacts';
import type { UsdaDataType } from '../foods/usda';

export const CURRENT_SCHEMA_VERSION = 1;

export interface Versioned {
  schemaVersion: number;
}

/**
 * A reference to a food: never copied nutrient values (docs/SPEC.md). Open Food Facts products
 * have no versions; their fetched label values are kept in the `products` table. USDA foods are
 * referenced by FoodData Central id (a new USDA release gives changed foods new ids), and kept in
 * the same table.
 */
export type FoodRef = { source: 'BLS'; version: string; code: string } | { source: 'custom'; id: string } | { source: ProductSource; code: string };

/** Online databases whose foods are saved in the `products` table. */
export type ProductSource = 'OFF' | 'USDA';

export interface OutdoorSession {
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  startHour: number;
  minutes: number;
  skin: SkinExposure;
}

export interface Profile extends Versioned {
  id: 'profile';
  birthYear?: number;
  sex?: Sex;
  weightHistory: Array<{ day: string; kg: number }>;
  heightCm?: number;
  activity?: ActivityLevel;
  phytate?: PhytateIntake;
  /** Women only, for the iron reference value. */
  menstruation?: Menstruation;
  latitude?: number;
  outdoorRoutine?: OutdoorSession[];
  salt: { iodised: boolean; fluoridated: boolean };
  exclusions: { groups: string[]; foods: string[] };
  startingLevel: StartingLevelChoice;
  customStartLevels?: Record<string, number>;
  /** First day the model simulates (set at first launch). */
  modelStartDay: string;
  onboarded: boolean;
}

export type FeatureKey =
  | 'forecasts'
  | 'notifications'
  | 'uncertaintyRanges'
  | 'absorption'
  | 'retention'
  | 'sunVitaminD'
  | 'bestNextBatch'
  | 'advancedNumbers'
  | 'yesterdayNudge'
  | 'fillUnloggedDays'
  | 'backupReminder'
  | 'aiAssistant'
  | 'openFoodFacts'
  | 'usda'
  | 'productWebSearch';

export interface Settings extends Versioned {
  id: 'settings';
  features: Record<FeatureKey, boolean>;
  /** Hidden nutrient ids (display only). */
  hiddenNutrients: string[];
  mealWindowMinutes: number;
  shortWindowDays: number;
  longWindowDays: number;
  theme: 'system' | 'light' | 'dark';
  backupReminderDays: number;
  /** Default storage plan for new recipes. */
  defaultPlan: StoragePlan;
  /** Home screen nutrient layout; unset = compact. */
  homeView?: 'compact' | 'detailed';
  /** Foods pinned to the top of the log screen, in the order they were added. */
  favourites?: FoodRef[];
}

export interface StoragePlan {
  fresh: number;
  fridge: number;
  /** null = "the rest". */
  freezer: number | null;
}

export interface Ingredient {
  ref: FoodRef;
  /** Display name at the time it was added (for the UI if the food is missing). */
  name: string;
  grams: number;
  preparation: Preparation;
  /** Salt: replaced by the profile's (or recipe's) salt choice. */
  isSalt?: boolean;
}

export interface Recipe extends Versioned {
  id: string;
  name: string;
  portions: number;
  ingredients: Ingredient[];
  notes?: string;
  tags: string[];
  defaultPlan?: StoragePlan;
  saltOverride?: { iodised: boolean; fluoridated: boolean };
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

export interface Batch extends Versioned {
  id: string;
  recipeId: string;
  /** Copy of the recipe at cooking time, so later edits do not change history. */
  recipe: { name: string; portions: number; ingredients: Ingredient[]; saltOverride?: { iodised: boolean; fluoridated: boolean } };
  cookedDay: string;
  cookedAt: number;
  plan: { fresh: number; fridge: number; freezer: number };
  remaining: { fresh: number; fridge: number; freezer: number };
  corrections: Array<{ at: number; storage: Storage; delta: number; reason: 'discarded' | 'givenAway' | 'correction' }>;
}

interface LogBase extends Versioned {
  id: string;
  /** Epoch ms when the meal was finished. */
  time: number;
  /** Local calendar day of `time` (YYYY-MM-DD). */
  day: string;
  confidence: EntryConfidence;
  label: string;
}

export type LogEntry =
  | (LogBase & { kind: 'food'; ref: FoodRef; grams: number; preparation: Preparation })
  | (LogBase & { kind: 'portion'; batchId: string; storage: Storage; portions: number })
  | (LogBase & { kind: 'custom'; customFoodId: string; servings: number })
  | (LogBase & { kind: 'manual'; nutrients: Record<string, number>; isSupplement: boolean })
  | (LogBase & { kind: 'drink'; drink: 'tea' | 'coffee' });

/**
 * A food fetched from an online database (Open Food Facts or USDA FoodData Central), kept so
 * entries stay computable offline and the same after the source edits it. For a packaged product
 * the label values come from the source; everything the label lacks (most vitamins and minerals)
 * is borrowed from `match`, the closest BLS food, when one is chosen. USDA generic foods carry
 * most nutrients themselves; `match` only fills their gaps.
 */
export interface Product extends Versioned, ProductData {
  /** `OFF:<barcode>` or `USDA:<fdcId>`. */
  id: string;
  source: ProductSource;
  /** USDA only: which FoodData Central data type the food comes from. */
  usdaType?: UsdaDataType;
  match?: { version: string; code: string };
  /** When the label values were fetched (epoch ms). */
  fetchedAt: number;
}

/** Saved manual items and supplements. Nutrient amounts per serving. */
export interface CustomFood extends Versioned {
  id: string;
  name: string;
  isSupplement: boolean;
  servingLabel: string;
  /** Grams per serving if known (for manual foods entered per 100 g). */
  servingGrams?: number;
  nutrients: Record<string, number>;
  confidence: EntryConfidence;
  createdAt: number;
}

export interface DayStatusRecord extends Versioned {
  day: string;
  status: 'logged' | 'partial' | 'fasted';
}

export interface Fast extends Versioned {
  id: string;
  startDay: string;
  /** Last fasted day, once the fast is over (set when stopped by hand; otherwise derived). */
  endDay?: string;
}

export interface SunEntry extends Versioned {
  id: string;
  day: string;
  startHour: number;
  minutes: number;
  skin: SkinExposure;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** A log entry before the repository gives it an id and schema version. */
export type NewLogEntry = DistributiveOmit<LogEntry, 'id' | 'schemaVersion'>;
