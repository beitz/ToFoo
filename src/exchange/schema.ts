/**
 * ToFoo exchange format: one versioned JSON format for backups, recipes (QR, v2) and pasted log
 * entries (Claude helper, v2). One parser, one validator. Human-readable docs: docs/exchange-format.md.
 * JSON Schema (generated from this file): docs/exchange-format.schema.json (`npm run schema`).
 *
 * Unknown fields are ignored (stripped), so the format can grow.
 */
import { z } from 'zod';
import { FORMAT_VERSION } from './build';

export { FORMAT_VERSION };

const confidence = z.enum(['A', 'B', 'C']);
const preparation = z.enum(['asListed', 'raw', 'boiled', 'steamed', 'baked', 'fried']);
const storageKind = z.enum(['fresh', 'fridge', 'freezer']);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date like 2026-10-15');
const nutrients = z.record(z.string(), z.number().finite().nonnegative()).describe('Amounts by BLS component code, in BLS units (e.g. {"VITC": 12.5} mg)');
const skin = z.enum(['faceHands', 'faceHandsForearms', 'faceHandsArms', 'armsLegs', 'mostOfBody']);

const blsRef = z.object({ source: z.literal('BLS'), version: z.string(), code: z.string().regex(/^[A-Z][0-9A-Z]{6}$/, 'expected a 7-character BLS code') });
const customRef = z.object({ source: z.literal('custom'), id: z.string() });
const barcode = z.string().regex(/^\d{4,14}$/, 'expected a barcode (4 to 14 digits)');
const offRef = z.object({ source: z.literal('OFF'), code: barcode });
const fdcId = z.string().regex(/^\d{1,10}$/, 'expected a FoodData Central id (digits)');
const usdaRef = z.object({ source: z.literal('USDA'), code: fdcId });
const foodRef = z.discriminatedUnion('source', [blsRef, customRef, offRef, usdaRef]);

const plan = z.object({ fresh: z.number().int().nonnegative(), fridge: z.number().int().nonnegative(), freezer: z.number().int().nonnegative().nullable() });
const planResolved = z.object({ fresh: z.number().int().nonnegative(), fridge: z.number().int().nonnegative(), freezer: z.number().int().nonnegative() });

const ingredient = z.object({
  ref: foodRef,
  name: z.string(),
  grams: z.number().positive(),
  preparation,
  isSalt: z.boolean().optional(),
});

const versioned = { schemaVersion: z.number().int().nonnegative() };

// A recipe portion eaten from a batch: by portions, or by grams of a weighed pot (then portions is
// what it took from stock, possibly 0), with the serving's own ingredients when it differed from the pot.
const portionFields = {
  batchId: z.string(),
  storage: storageKind,
  portions: z.number().nonnegative(),
  grams: z.number().positive().optional().describe('Grams eaten of the batch\'s cooked weight; sets the nutrients instead of portions'),
  ingredients: z.array(ingredient).optional().describe('This serving\'s ingredients when it differed from the pot, in grams for the whole pot'),
};

// A pinned meal's items: log entries without id, time and day; offsetMinutes = minutes before the meal's last item.
const mealItemBase = { confidence, label: z.string(), offsetMinutes: z.number().int().nonnegative() };
const favouriteMeal = z.object({
  id: z.string(),
  items: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ ...mealItemBase, kind: z.literal('food'), ref: foodRef, grams: z.number().positive(), preparation }),
        z.object({ ...mealItemBase, kind: z.literal('portion'), ...portionFields }),
        z.object({ ...mealItemBase, kind: z.literal('custom'), customFoodId: z.string(), servings: z.number().positive() }),
        z.object({ ...mealItemBase, kind: z.literal('manual'), nutrients, isSupplement: z.boolean() }),
        z.object({ ...mealItemBase, kind: z.literal('drink'), drink: z.enum(['tea', 'coffee']) }),
      ]),
    )
    .min(1),
});

// ── Stored records (backup) ──

export const profileSchema = z.object({
  id: z.literal('profile'),
  ...versioned,
  birthYear: z.number().int().min(1900).max(2100).optional(),
  sex: z.enum(['male', 'female']).optional(),
  weightHistory: z.array(z.object({ day, kg: z.number().positive() })),
  heightCm: z.number().positive().optional(),
  activity: z.enum(['low', 'medium', 'high']).optional(),
  energyTargetKcal: z.number().positive().optional(),
  phytate: z.enum(['low', 'medium', 'high']).optional(),
  menstruation: z.enum(['menstruating', 'postmenopausal', 'none']).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  outdoorRoutine: z
    .array(z.object({ weekdays: z.array(z.number().int().min(0).max(6)), startHour: z.number().min(0).max(24), minutes: z.number().nonnegative(), skin }))
    .optional(),
  salt: z.object({ iodised: z.boolean(), fluoridated: z.boolean() }),
  exclusions: z.object({ groups: z.array(z.string()), foods: z.array(z.string()) }),
  startingLevel: z.enum(['empty', 'average', 'custom']),
  customStartLevels: z.record(z.string(), z.number().min(0).max(1)).optional(),
  labResults: z.array(z.object({ id: z.string(), marker: z.string(), value: z.number().nonnegative(), day })).optional(),
  modelStartDay: day,
  onboarded: z.boolean(),
});

export const settingsSchema = z.object({
  id: z.literal('settings'),
  ...versioned,
  features: z.record(z.string(), z.boolean()),
  hiddenNutrients: z.array(z.string()),
  mealWindowMinutes: z.number().int().positive(),
  shortWindowDays: z.number().int().positive(),
  longWindowDays: z.number().int().positive(),
  theme: z.enum(['system', 'light', 'dark']),
  backupReminderDays: z.number().int().positive(),
  autoBackupKeep: z.number().int().positive().optional(),
  defaultPlan: plan,
  homeView: z.enum(['compact', 'detailed']).optional(),
  homeGrouping: z.enum(['status', 'type', 'none']).optional(),
  homeCollapsed: z.record(z.string(), z.boolean()).optional(),
  favourites: z.array(foodRef).optional(),
  favouriteMeals: z.array(favouriteMeal).optional(),
  logCollapsed: z.record(z.string(), z.boolean()).optional(),
  cookingPreferences: z.string().optional(),
  potGrams: z.number().positive().optional(),
});

export const recipeRecordSchema = z.object({
  id: z.string(),
  ...versioned,
  name: z.string().min(1),
  portions: z.number().int().positive(),
  ingredients: z.array(ingredient),
  instructions: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()),
  defaultPlan: plan.optional(),
  saltOverride: z.object({ iodised: z.boolean(), fluoridated: z.boolean() }).optional(),
  potGrams: z.number().positive().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  archived: z.boolean().optional(),
});

export const batchSchema = z.object({
  id: z.string(),
  ...versioned,
  recipeId: z.string(),
  recipe: z.object({ name: z.string(), portions: z.number().int().positive(), ingredients: z.array(ingredient), saltOverride: z.object({ iodised: z.boolean(), fluoridated: z.boolean() }).optional() }),
  recipeIngredients: z.array(ingredient).optional().describe("The recipe's ingredients when this pot was made differently (recipe.ingredients is what went in)"),
  cookedGrams: z.number().positive().optional().describe('Weight of the cooked food without the pot, in grams'),
  cookedDay: day,
  cookedAt: z.number(),
  plan: planResolved,
  remaining: planResolved,
  corrections: z.array(z.object({ at: z.number(), storage: storageKind, delta: z.number(), reason: z.enum(['discarded', 'givenAway', 'correction']) })),
});

const logBase = { id: z.string(), ...versioned, time: z.number(), day, confidence, label: z.string() };
export const logEntrySchema = z.discriminatedUnion('kind', [
  z.object({ ...logBase, kind: z.literal('food'), ref: foodRef, grams: z.number().positive(), preparation }),
  z.object({ ...logBase, kind: z.literal('portion'), ...portionFields }),
  z.object({ ...logBase, kind: z.literal('custom'), customFoodId: z.string(), servings: z.number().positive() }),
  z.object({ ...logBase, kind: z.literal('manual'), nutrients, isSupplement: z.boolean() }),
  z.object({ ...logBase, kind: z.literal('drink'), drink: z.enum(['tea', 'coffee']) }),
]);

export const customFoodSchema = z.object({
  id: z.string(),
  ...versioned,
  name: z.string().min(1),
  isSupplement: z.boolean(),
  servingLabel: z.string(),
  servingGrams: z.number().positive().optional(),
  nutrients,
  confidence,
  createdAt: z.number(),
});

export const productSchema = z
  .object({
    id: z.string(),
    ...versioned,
    source: z.enum(['OFF', 'USDA']),
    code: z.string().regex(/^\d{1,14}$/, 'expected a barcode (Open Food Facts) or a FoodData Central id (USDA)'),
    usdaType: z.enum(['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']).optional().describe('USDA only: the FoodData Central data type'),
    name: z.string().min(1),
    brand: z.string().optional(),
    quantity: z.string().optional(),
    serving: z.object({ label: z.string(), grams: z.number().positive() }).optional(),
    per100: nutrients.describe('Values per 100 g (per 100 ml if perMl) by BLS component code, in BLS units: label values, or USDA database values for USDA generic foods. A nutrient without a value is absent.'),
    perMl: z.boolean().optional(),
    categories: z.array(z.string()),
    lastModified: z.number().optional(),
    match: z.object({ version: z.string(), code: blsRef.shape.code }).optional().describe('BLS food that supplies the nutrients the source lacks'),
    fetchedAt: z.number(),
  })
  .describe('A food from an online database, as fetched: a packaged product from Open Food Facts (ODbL) or a food from USDA FoodData Central (public domain)');

export const dayStatusSchema = z.object({ day, ...versioned, status: z.enum(['logged', 'partial', 'fasted', 'filled', 'excluded']) });
export const fastSchema = z.object({ id: z.string(), ...versioned, startDay: day, endDay: day.optional() });
export const sunEntrySchema = z.object({ id: z.string(), ...versioned, day, startHour: z.number().min(0).max(24), minutes: z.number().nonnegative(), skin });
export const journalEntrySchema = z.object({ id: z.string(), ...versioned, time: z.number(), day, text: z.string() }).describe('A free-text journal entry');
export const sleepRecordSchema = z
  .object({ id: z.string(), ...versioned, start: z.number(), end: z.number().optional(), day })
  .describe('One sleep: fell asleep (start) and woke up (end, missing while asleep), epoch ms; day is the local day it ended');

export const activitySchema = z
  .object({
    id: z.string(),
    ...versioned,
    kind: z.enum(['walk', 'run', 'cycling', 'strength', 'other']),
    name: z.string().optional(),
    time: z.number(),
    day,
    minutes: z.number().nonnegative(),
    intensity: z.enum(['easy', 'moderate', 'hard']).optional(),
    outside: z.boolean(),
    sunSkin: skin.optional(),
  })
  .describe('One activity: what, when (epoch ms), how long, roughly how hard, outside or not; sunSkin when it counts toward the vitamin D sun estimate');

export const waterSchema = z
  .object({ id: z.string(), ...versioned, time: z.number(), day, ml: z.number().nonnegative() })
  .describe('Plain water drunk: when (epoch ms) and how much (ml); drinks with nutrients are food log entries');

const shopSection = z.enum(['produce', 'bakery', 'dairy', 'meat', 'dry', 'pantry', 'drinks', 'ready', 'other']);
export const shoppingItemSchema = z
  .object({
    id: z.string(),
    ...versioned,
    name: z.string().min(1),
    ref: foodRef.optional(),
    section: shopSection,
    grams: z.number().positive().optional(),
    amount: z.string().optional(),
    recipes: z.array(z.string()).optional(),
    addedAt: z.number(),
    checkedAt: z.number().optional(),
    clearedAt: z.number().optional(),
  })
  .describe('One line on the shopping list: what, how much (grams and/or a typed amount), the shop section, the recipes it is for; ticked off (checkedAt) or cleared after shopping (clearedAt, kept as suggestions), epoch ms');

export const portionSizesSchema = z
  .object({ food: z.string().min(1), sizes: z.array(z.object({ label: z.string(), grams: z.number().positive() })) })
  .describe('Portion sizes the user saved for one food ("My bowl", 60 g), by the food code they were saved under');

const header = {
  format: z.literal('tofoo', { error: 'not a ToFoo file (expected "format": "tofoo")' }),
  formatVersion: z.number().int().positive(),
};

export const backupSchema = z.object({
  ...header,
  type: z.literal('backup'),
  exportedAt: z.string(),
  app: z.object({ version: z.string() }).optional(),
  data: z.object({
    profile: profileSchema.nullable(),
    settings: settingsSchema.nullable(),
    recipes: z.array(recipeRecordSchema),
    batches: z.array(batchSchema),
    log: z.array(logEntrySchema),
    customFoods: z.array(customFoodSchema),
    dayStatus: z.array(dayStatusSchema),
    fasts: z.array(fastSchema),
    sunEntries: z.array(sunEntrySchema),
    products: z.array(productSchema).default([]),
    journal: z.array(journalEntrySchema).default([]),
    sleep: z.array(sleepRecordSchema).default([]),
    activities: z.array(activitySchema).default([]),
    water: z.array(waterSchema).default([]),
    shopping: z.array(shoppingItemSchema).default([]),
    // Optional, not defaulted: restoring a backup from before portion sizes were in backups keeps the
    // sizes on the phone instead of clearing them.
    portionSizes: z.array(portionSizesSchema).optional(),
  }),
});

// ── Shareable recipe and log entries (v2: QR codes, Claude helper) ──

const exchangeIngredient = z.union([
  blsRef.extend({ grams: z.number().positive(), preparation: preparation.default('asListed'), name: z.string().optional(), isSalt: z.boolean().optional() }),
  z.object({ source: z.literal('manual'), name: z.string().min(1), grams: z.number().positive(), per100g: nutrients, confidence }),
]);

export const recipeExchangeSchema = z.object({
  ...header,
  type: z.literal('recipe'),
  recipe: z.object({
    name: z.string().min(1),
    portions: z.number().int().positive(),
    ingredients: z.array(exchangeIngredient).min(1),
    storagePlan: plan.optional(),
    shelfLifeDays: z.object({ fridge: z.number().positive().optional(), freezer: z.number().positive().optional() }).optional(),
    instructions: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const logEntryExchangeSchema = z.object({
  ...header,
  type: z.literal('logEntry'),
  entries: z
    .array(
      z.object({
        name: z.string().min(1),
        time: z.string().optional().describe('ISO 8601 date-time; defaults to now'),
        confidence: confidence.default('C'),
        isSupplement: z.boolean().optional(),
        items: z.array(exchangeIngredient).min(1),
        drinks: z.array(z.enum(['tea', 'coffee'])).optional(),
      }),
    )
    .min(1),
});

export const exchangeSchema = z.discriminatedUnion('type', [backupSchema, recipeExchangeSchema, logEntryExchangeSchema]);

export type BackupFile = z.infer<typeof backupSchema>;
export type RecipeExchange = z.infer<typeof recipeExchangeSchema>;
export type LogEntryExchange = z.infer<typeof logEntryExchangeSchema>;
export type ExchangeFile = z.infer<typeof exchangeSchema>;
