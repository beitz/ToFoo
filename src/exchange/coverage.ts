/**
 * Compile-time guard: every field of a stored record must be in the backup schema. The schema
 * strips unknown fields, so a field added to src/storage/types.ts but not to ./schema.ts would be
 * silently lost on backup and restore. `npm run typecheck` fails here instead. Types only.
 */
import type { z } from 'zod';
import type { ActivityRecord, Batch, CustomFood, DayStatusRecord, Fast, FavouriteMealItem, FoodPortionSizes, Ingredient, JournalEntry, LabResult, LogEntry, OutdoorSession, PantryItem, Product, Profile, Recipe, Settings, ShoppingItem, SleepRecord, SunEntry, WaterRecord } from '../storage/types';
import type { Snapshot } from '../storage/repo';
import type * as S from './schema';

// Distributive, so unions (log entries, meal items) are checked member by member.
type Keys<T> = T extends unknown ? keyof T : never;
type Missing<Stored, Schema> = Exclude<Keys<Stored>, Keys<Schema>>;
type Covered<T extends never> = T;
type Data = z.infer<typeof S.backupSchema>['data'];
type Item<T> = T extends Array<infer U> ? U : never;

export type BackupCoversStoredFields = [
  Covered<Missing<Snapshot, Data>>,
  Covered<Missing<Profile, z.infer<typeof S.profileSchema>>>,
  Covered<Missing<OutdoorSession, Item<NonNullable<Data['profile']>['outdoorRoutine']>>>,
  Covered<Missing<LabResult, Item<NonNullable<Data['profile']>['labResults']>>>,
  Covered<Missing<Settings, z.infer<typeof S.settingsSchema>>>,
  Covered<Missing<FavouriteMealItem, Item<Item<NonNullable<Data['settings']>['favouriteMeals']>['items']>>>,
  Covered<Missing<Recipe, z.infer<typeof S.recipeRecordSchema>>>,
  Covered<Missing<Ingredient, Item<Data['recipes'][number]['ingredients']>>>,
  Covered<Missing<Batch, z.infer<typeof S.batchSchema>>>,
  Covered<Missing<Batch['recipe'], Data['batches'][number]['recipe']>>,
  Covered<Missing<LogEntry, z.infer<typeof S.logEntrySchema>>>,
  Covered<Missing<CustomFood, z.infer<typeof S.customFoodSchema>>>,
  Covered<Missing<Product, z.infer<typeof S.productSchema>>>,
  Covered<Missing<DayStatusRecord, z.infer<typeof S.dayStatusSchema>>>,
  Covered<Missing<Fast, z.infer<typeof S.fastSchema>>>,
  Covered<Missing<SunEntry, z.infer<typeof S.sunEntrySchema>>>,
  Covered<Missing<JournalEntry, z.infer<typeof S.journalEntrySchema>>>,
  Covered<Missing<SleepRecord, z.infer<typeof S.sleepRecordSchema>>>,
  Covered<Missing<ActivityRecord, z.infer<typeof S.activitySchema>>>,
  Covered<Missing<WaterRecord, z.infer<typeof S.waterSchema>>>,
  Covered<Missing<ShoppingItem, z.infer<typeof S.shoppingItemSchema>>>,
  Covered<Missing<PantryItem, z.infer<typeof S.pantryItemSchema>>>,
  Covered<Missing<FoodPortionSizes, z.infer<typeof S.portionSizesSchema>>>,
];
