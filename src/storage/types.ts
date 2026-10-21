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

export interface LabResult {
  id: string;
  /** Key of `labMarkers` in model/parameters.ts, e.g. 'ferritin'. */
  marker: string;
  /** In the marker's unit. */
  value: number;
  day: string;
}

export interface Profile extends Versioned {
  id: 'profile';
  birthYear?: number;
  sex?: Sex;
  weightHistory: Array<{ day: string; kg: number }>;
  heightCm?: number;
  activity?: ActivityLevel;
  /** Own energy target in kcal/day; not set: estimated from age, sex, weight and activity. */
  energyTargetKcal?: number;
  phytate?: PhytateIntake;
  /** Women only, for the iron reference value. */
  menstruation?: Menstruation;
  latitude?: number;
  outdoorRoutine?: OutdoorSession[];
  salt: { iodised: boolean; fluoridated: boolean };
  exclusions: { groups: string[]; foods: string[] };
  startingLevel: StartingLevelChoice;
  customStartLevels?: Record<string, number>;
  /** Blood test values that set a store's level on the day of the test (model/parameters.ts `labMarkers`). */
  labResults?: LabResult[];
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
  | 'autoBackup'
  | 'aiAssistant'
  | 'openFoodFacts'
  | 'usda'
  | 'productWebSearch'
  | 'voiceInput'
  | 'journal'
  | 'sleep'
  | 'activity'
  | 'water'
  | 'insights'
  | 'recipeIdeas'
  | 'saveChats'
  | 'shoppingList'
  | 'atHome';

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
  /** How many automatic backups to keep on the phone; unset = DEFAULT_AUTO_BACKUP_KEEP. */
  autoBackupKeep?: number;
  /** Default storage plan for new recipes. */
  defaultPlan: StoragePlan;
  /** Home screen nutrient layout; unset = compact. */
  homeView?: 'compact' | 'detailed';
  /** Home nutrient list grouping; unset = by status. */
  homeGrouping?: 'status' | 'type' | 'none';
  /** Home groups the user opened (false) or closed (true), by group key; unset keys use the default. */
  homeCollapsed?: Record<string, boolean>;
  /** Foods pinned to the top of the log screen, in the order they were added. */
  favourites?: FoodRef[];
  /** Whole meals pinned to the top of the log screen; one tap logs them again. */
  favouriteMeals?: FavouriteMeal[];
  /** Log screen sections the user closed (true) or opened (false), by section key; unset = open. */
  logCollapsed?: Record<string, boolean>;
  /** Recipe ideas: diet, likes, kitchen, time, batch size, in the user's words (guidance for the assistant, not a filter). */
  cookingPreferences?: string;
  /** Weight of the empty pot last weighed (g), offered when the next pot is weighed. */
  potGrams?: number;
}

/**
 * A pinned meal: its items as they were logged, without time and day. `offsetMinutes` keeps each
 * item's spacing before the meal's last item (a tea 30 minutes after the food stays 30 minutes after it).
 */
export interface FavouriteMeal {
  id: string;
  items: FavouriteMealItem[];
}

export type FavouriteMealItem = DistributiveOmit<LogEntry, 'id' | 'schemaVersion' | 'time' | 'day'> & { offsetMinutes: number };

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
  /** Preparation steps, as the user wrote or told them. */
  instructions?: string;
  notes?: string;
  tags: string[];
  defaultPlan?: StoragePlan;
  saltOverride?: { iodised: boolean; fluoridated: boolean };
  /** Weight of the empty pot this recipe was last cooked in (g), offered when its next pot is weighed. */
  potGrams?: number;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

export interface Batch extends Versioned {
  id: string;
  recipeId: string;
  /**
   * Copy of the recipe at cooking time, so later edits do not change history. Its ingredients are
   * what went into this pot, which may differ from the recipe ("this pot had tofu").
   */
  recipe: { name: string; portions: number; ingredients: Ingredient[]; saltOverride?: { iodised: boolean; fluoridated: boolean } };
  /** The recipe's own ingredients, kept only when this pot was made differently (to show what changed). */
  recipeIngredients?: Ingredient[];
  /** Weight of the cooked food in the pot (g, without the pot), so portions can be logged by grams. */
  cookedGrams?: number;
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
  | (LogBase & {
      kind: 'portion';
      batchId: string;
      storage: Storage;
      /** Portions taken from stock (may be 0 when some was eaten straight from the pot by weight). */
      portions: number;
      /** Amount eaten by weight (g of the batch's cooked weight); then it, not `portions`, sets the nutrients. */
      grams?: number;
      /**
       * This serving's ingredients when it differed from the pot ("150 g tofu instead of 200 g beef"),
       * in grams for the whole pot like the batch's, so they scale with the amount eaten.
       */
      ingredients?: Ingredient[];
    })
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
  /** filled / excluded override "Fill in unlogged days" for this one day. */
  status: 'logged' | 'partial' | 'fasted' | 'filled' | 'excluded';
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

/** A free-text journal entry: anything the user wants to write down, at any time (docs/SPEC.md, "Journal"). */
export interface JournalEntry extends Versioned {
  id: string;
  /** Epoch ms the entry is about (defaults to when it was written). */
  time: number;
  /** Local calendar day of `time` (YYYY-MM-DD). */
  day: string;
  text: string;
}

/**
 * One sleep: when the user fell asleep and woke up (docs/SPEC.md, "Sleep"). No quality rating, by
 * the owner's decision. `end` is missing while the user is asleep (after "Going to sleep").
 */
export interface SleepRecord extends Versioned {
  id: string;
  /** Epoch ms the user fell asleep. */
  start: number;
  /** Epoch ms the user woke up; missing while asleep. */
  end?: number;
  /** Local calendar day the sleep ended (YYYY-MM-DD): a night belongs to the morning after it. */
  day: string;
}

export const ACTIVITY_KINDS = ['walk', 'run', 'cycling', 'strength', 'other'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const INTENSITIES = ['easy', 'moderate', 'hard'] as const;
export type Intensity = (typeof INTENSITIES)[number];

/**
 * One activity (docs/SPEC.md, "Activity"): what, when, how long, roughly how hard, and whether it
 * was outside. No energy burned (that needs a sourced table of activity energy costs).
 */
/**
 * Plain water drunk (docs/SPEC.md, "Water"): tap, mineral or sparkling water without anything in it.
 * Kept apart from the food log, so it never ends a fast or makes a day count as eaten; drinks with
 * nutrients (juice, milk, coffee) are logged as foods, and their water is counted from the BLS.
 */
export interface WaterRecord extends Versioned {
  id: string;
  /** Epoch ms it was drunk. */
  time: number;
  /** Local calendar day of `time` (YYYY-MM-DD). */
  day: string;
  ml: number;
}

export interface ActivityRecord extends Versioned {
  id: string;
  kind: ActivityKind;
  /** The user's own name for it ("football", "yoga"), if any. */
  name?: string;
  /** Epoch ms it started. */
  time: number;
  /** Local calendar day of `time` (YYYY-MM-DD). */
  day: string;
  minutes: number;
  intensity?: Intensity;
  outside: boolean;
  /**
   * When outside: counts toward the vitamin D sun estimate, with this much skin showing. Missing when
   * it is already part of the outdoor routine (so it is not counted twice) or was inside.
   */
  sunSkin?: SkinExposure;
}

/** A portion size the user saved for a food ("My bowl", 60 g); stored in meta under `portions:<food code>`. */
export interface PortionSize {
  label: string;
  grams: number;
}

/** Saved portion sizes of one food, as they go into backups. */
export interface FoodPortionSizes {
  /** The food code the sizes were saved under (BLS code, or the product's code). */
  food: string;
  sizes: PortionSize[];
}

/** Where an item sits in the shop, for sorting the shopping list (src/logic/shopping.ts). */
export const SHOP_SECTIONS = ['produce', 'bakery', 'dairy', 'meat', 'dry', 'pantry', 'drinks', 'ready', 'other'] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];

/**
 * One line on the shopping list (docs/SPEC.md, "Shopping list"). Lines cleared after shopping are
 * kept, with `clearedAt`, as the list's memory of what was bought before: they come back as
 * suggestions when typing. Only the newest line per name is kept for that.
 */
export interface ShoppingItem extends Versioned {
  id: string;
  /** What to buy, as shown. */
  name: string;
  /** The food it is, when picked from the food database or added from a recipe: the same food stays one line. */
  ref?: FoodRef;
  section: ShopSection;
  /** How much in grams, when known (recipe ingredients, or typed in g or kg). */
  grams?: number;
  /** Any other amount, as typed ("2 l", "1 pack", "6"). */
  amount?: string;
  /** Names of the recipes it is for. */
  recipes?: string[];
  /** Epoch ms it was put on the list. */
  addedAt: number;
  /** Epoch ms it was ticked off; missing while still to buy. */
  checkedAt?: number;
  /** Epoch ms "Clear" took it off the list; missing while it is on the list. */
  clearedAt?: number;
}

/** Where something is kept at home, for grouping the At home list (src/logic/pantry.ts). */
export const HOME_PLACES = ['fridge', 'freezer', 'cupboard', 'spices'] as const;
export type HomePlace = (typeof HOME_PLACES)[number];

/**
 * Something bought that is at home (docs/SPEC.md, "At home"). Only what the user said is stored:
 * how much there was when it was bought or counted (`since`). What is left now is worked out from
 * the log and the cooked batches from then on, so logging, editing or deleting a meal moves it.
 */
export interface PantryItem extends Versioned {
  id: string;
  /** As shown. */
  name: string;
  /** The food it is, so it can be logged with one tap and its amount goes down when it is eaten. */
  ref?: FoodRef;
  place: HomePlace;
  /** Pieces (packs, jars, ready meals) there were at `since`; one fewer each time it is logged or cooked with. */
  pieces?: number;
  /** Grams there were at `since`; what is logged or cooked with is taken off. */
  grams?: number;
  /** Any other amount, as typed ("1 l"); shown, not counted down. */
  amount?: string;
  /** Epoch ms the amount was set (bought, or counted again); meals and pots from then on count. */
  since: number;
  /** Set by the user: running low, or used up. Missing: they have it (or as much as is left). */
  status?: 'low' | 'out';
  /** Epoch ms it was first added. */
  addedAt: number;
}

export const DEFAULT_AUTO_BACKUP_KEEP = 5;

/**
 * A backup the app saved by itself (docs/SPEC.md, "Automatic backups"), kept in the app's own storage.
 * `json` is the whole backup file, exactly as "Save as file" writes it. Not part of backups.
 */
export interface AutoBackup {
  id: string;
  /** Epoch ms it was taken. */
  at: number;
  reason: 'daily' | 'restore' | 'upgrade';
  json: string;
  /** Bytes of `json`. */
  size: number;
  /** Records per backup list (log, recipes, journal…), for the list in Settings → Backup. */
  counts: Record<string, number>;
  /**
   * Result of reading the file back the way a restore would: missing = not checked yet, '' = fine,
   * otherwise the validator's message. Checked after start-up, so the check's code loads only then.
   */
  problem?: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** A log entry before the repository gives it an id and schema version. */
export type NewLogEntry = DistributiveOmit<LogEntry, 'id' | 'schemaVersion'>;
