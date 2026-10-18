/**
 * Repository: the only API the UI uses to read and write personal data.
 */
import { newId } from '../lib/id';
import { refKey } from '../lib/refs';
import { overlaps, sleepDay } from '../logic/sleep';
import { db as defaultDb, runMigrations, type ToFooDB } from './db';
import { defaultProfile, defaultSettings } from './defaults';
import {
  CURRENT_SCHEMA_VERSION,
  type Batch,
  type CustomFood,
  type DayStatusRecord,
  type FavouriteMeal,
  type FoodRef,
  type Fast,
  type JournalEntry,
  type SleepRecord,
  type ActivityRecord,
  type WaterRecord,
  type LogEntry,
  type NewLogEntry as NewLog,
  type Product,
  type Profile,
  type Recipe,
  type Settings,
  type StoragePlan,
  type SunEntry,
} from './types';
import type { Storage } from '../model/paramTypes';

/** All personal data, as stored. Used for backups. */
export interface Snapshot {
  profile: Profile | null;
  settings: Settings | null;
  recipes: Recipe[];
  batches: Batch[];
  log: LogEntry[];
  customFoods: CustomFood[];
  dayStatus: DayStatusRecord[];
  fasts: Fast[];
  sunEntries: SunEntry[];
  products: Product[];
  journal: JournalEntry[];
  sleep: SleepRecord[];
  activities: ActivityRecord[];
  water: WaterRecord[];
}


export function createRepo(db: ToFooDB) {
  const v = CURRENT_SCHEMA_VERSION;

  const repo = {
    db,

    async init(today: string): Promise<void> {
      await runMigrations(db);
      await db.transaction('rw', db.profile, db.settings, async () => {
        if (!(await db.profile.get('profile'))) await db.profile.put(defaultProfile(today));
        if (!(await db.settings.get('settings'))) await db.settings.put(defaultSettings());
      });
    },

    // ── Profile and settings ──
    async getProfile(): Promise<Profile | undefined> {
      return db.profile.get('profile');
    },
    async updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
      const p = (await db.profile.get('profile')) ?? defaultProfile(patch.modelStartDay ?? '');
      await db.profile.put({ ...p, ...patch, id: 'profile', schemaVersion: v });
    },
    async getSettings(): Promise<Settings | undefined> {
      return db.settings.get('settings');
    },
    async updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
      const s = (await db.settings.get('settings')) ?? defaultSettings();
      await db.settings.put({ ...s, ...patch, id: 'settings', schemaVersion: v });
    },

    /** Pin or unpin a food on the log screen; returns whether it is now a favourite. */
    async toggleFavourite(ref: FoodRef): Promise<boolean> {
      return db.transaction('rw', db.settings, async () => {
        const s = (await db.settings.get('settings')) ?? defaultSettings();
        const key = refKey(ref);
        const list = s.favourites ?? [];
        const on = list.some((r) => refKey(r) === key);
        await db.settings.put({ ...s, favourites: on ? list.filter((r) => refKey(r) !== key) : [...list, ref], id: 'settings', schemaVersion: v });
        return !on;
      });
    },

    /** Pin a meal on the log screen, at `index` (undo puts it back where it was) or at the end. */
    async addFavouriteMeal(meal: FavouriteMeal, index?: number): Promise<void> {
      await db.transaction('rw', db.settings, async () => {
        const s = (await db.settings.get('settings')) ?? defaultSettings();
        const list = (s.favouriteMeals ?? []).filter((m) => m.id !== meal.id);
        list.splice(index ?? list.length, 0, meal);
        await db.settings.put({ ...s, favouriteMeals: list, id: 'settings', schemaVersion: v });
      });
    },
    async removeFavouriteMeal(id: string): Promise<void> {
      await db.transaction('rw', db.settings, async () => {
        const s = (await db.settings.get('settings')) ?? defaultSettings();
        await db.settings.put({ ...s, favouriteMeals: (s.favouriteMeals ?? []).filter((m) => m.id !== id), id: 'settings', schemaVersion: v });
      });
    },

    // ── Log ──
    async addLog(entry: NewLog): Promise<LogEntry> {
      const rec = { ...entry, id: newId(), schemaVersion: v } as LogEntry;
      await db.transaction('rw', db.log, db.batches, async () => {
        if (rec.kind === 'portion') await changeRemaining(rec.batchId, rec.storage, -rec.portions);
        await db.log.put(rec);
      });
      return rec;
    },
    async updateLog(entry: LogEntry): Promise<void> {
      await db.transaction('rw', db.log, db.batches, async () => {
        const old = await db.log.get(entry.id);
        if (old?.kind === 'portion') await changeRemaining(old.batchId, old.storage, old.portions);
        if (entry.kind === 'portion') await changeRemaining(entry.batchId, entry.storage, -entry.portions);
        await db.log.put({ ...entry, schemaVersion: v });
      });
    },
    /** Delete an entry; returns it so the UI can offer undo via restoreLog. */
    async deleteLog(id: string): Promise<LogEntry | undefined> {
      return db.transaction('rw', db.log, db.batches, async () => {
        const old = await db.log.get(id);
        if (!old) return undefined;
        if (old.kind === 'portion') await changeRemaining(old.batchId, old.storage, old.portions);
        await db.log.delete(id);
        return old;
      });
    },
    async restoreLog(entry: LogEntry): Promise<void> {
      await db.transaction('rw', db.log, db.batches, async () => {
        if (entry.kind === 'portion') await changeRemaining(entry.batchId, entry.storage, -entry.portions);
        await db.log.put(entry);
      });
    },

    // ── Recipes and batches ──
    async saveRecipe(recipe: Omit<Recipe, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'id'> & { id?: string; createdAt?: number }): Promise<Recipe> {
      const now = Date.now();
      const rec: Recipe = { ...recipe, id: recipe.id ?? newId(), createdAt: recipe.createdAt ?? now, updatedAt: now, schemaVersion: v };
      await db.recipes.put(rec);
      return rec;
    },
    async deleteRecipe(id: string): Promise<Recipe | undefined> {
      const old = await db.recipes.get(id);
      await db.recipes.delete(id);
      return old;
    },
    async restoreRecipe(recipe: Recipe): Promise<void> {
      await db.recipes.put(recipe);
    },
    async cookBatch(recipe: Recipe, plan: { fresh: number; fridge: number; freezer: number }, day: string, rememberPlan?: StoragePlan): Promise<Batch> {
      const batch: Batch = {
        id: newId(),
        recipeId: recipe.id,
        recipe: { name: recipe.name, portions: recipe.portions, ingredients: recipe.ingredients.map((i) => ({ ...i })), ...(recipe.saltOverride ? { saltOverride: recipe.saltOverride } : {}) },
        cookedDay: day,
        cookedAt: Date.now(),
        plan,
        remaining: { ...plan },
        corrections: [],
        schemaVersion: v,
      };
      await db.transaction('rw', db.batches, db.recipes, async () => {
        await db.batches.put(batch);
        if (rememberPlan) await db.recipes.update(recipe.id, { defaultPlan: rememberPlan });
      });
      return batch;
    },
    async correctBatch(batchId: string, storage: Storage, delta: number, reason: Batch['corrections'][number]['reason']): Promise<void> {
      await db.transaction('rw', db.batches, async () => {
        const b = await db.batches.get(batchId);
        if (!b) return;
        const remaining = { ...b.remaining, [storage]: Math.max(0, b.remaining[storage] + delta) };
        await db.batches.put({ ...b, remaining, corrections: [...b.corrections, { at: Date.now(), storage, delta, reason }] });
      });
    },
    async moveBatchPortion(batchId: string, from: Storage, to: Storage): Promise<void> {
      await db.transaction('rw', db.batches, async () => {
        const b = await db.batches.get(batchId);
        if (!b || b.remaining[from] < 1) return;
        await db.batches.put({ ...b, remaining: { ...b.remaining, [from]: b.remaining[from] - 1, [to]: b.remaining[to] + 1 } });
      });
    },
    async deleteBatch(id: string): Promise<void> {
      await db.batches.delete(id);
    },

    // ── Custom foods and supplements ──
    async saveCustomFood(food: Omit<CustomFood, 'schemaVersion' | 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<CustomFood> {
      const rec: CustomFood = { ...food, id: food.id ?? newId(), createdAt: food.createdAt ?? Date.now(), schemaVersion: v };
      await db.customFoods.put(rec);
      return rec;
    },
    async deleteCustomFood(id: string): Promise<void> {
      await db.customFoods.delete(id);
    },

    // ── Open Food Facts products ──
    async getProduct(id: string): Promise<Product | undefined> {
      return db.products.get(id);
    },
    /** Save (or refresh) a product; a refresh keeps the chosen BLS match unless a new one is given. */
    async saveProduct(product: Omit<Product, 'schemaVersion'>): Promise<Product> {
      return db.transaction('rw', db.products, async () => {
        const old = await db.products.get(product.id);
        const match = product.match ?? old?.match;
        const rec: Product = { ...product, ...(match ? { match } : {}), schemaVersion: v };
        await db.products.put(rec);
        return rec;
      });
    },
    async setProductMatch(id: string, match: Product['match'] | null): Promise<void> {
      await db.transaction('rw', db.products, async () => {
        const p = await db.products.get(id);
        if (!p) return;
        const next: Product = { ...p, schemaVersion: v };
        if (match) next.match = match;
        else delete next.match;
        await db.products.put(next);
      });
    },

    // ── Day status, fasting, sun ──
    async setDayStatus(day: string, status: DayStatusRecord['status'] | null): Promise<void> {
      if (status === null) await db.dayStatus.delete(day);
      else await db.dayStatus.put({ day, status, schemaVersion: v });
    },
    async startFast(startDay: string): Promise<Fast> {
      const fast: Fast = { id: newId(), startDay, schemaVersion: v };
      await db.fasts.put(fast);
      return fast;
    },
    async endFast(id: string, endDay: string): Promise<void> {
      await db.fasts.update(id, { endDay });
    },
    async deleteFast(id: string): Promise<void> {
      await db.fasts.delete(id);
    },
    async addSunEntry(e: Omit<SunEntry, 'id' | 'schemaVersion'>): Promise<void> {
      await db.sunEntries.put({ ...e, id: newId(), schemaVersion: v });
    },
    async deleteSunEntry(id: string): Promise<void> {
      await db.sunEntries.delete(id);
    },

    // ── Journal ──
    async addJournal(e: Omit<JournalEntry, 'id' | 'schemaVersion'>): Promise<JournalEntry> {
      const rec: JournalEntry = { ...e, id: newId(), schemaVersion: v };
      await db.journal.put(rec);
      return rec;
    },
    async updateJournal(e: JournalEntry): Promise<void> {
      await db.journal.put({ ...e, schemaVersion: v });
    },
    /** Delete an entry; returns it so the UI can offer undo via restoreJournal. */
    async deleteJournal(id: string): Promise<JournalEntry | undefined> {
      return db.transaction('rw', db.journal, async () => {
        const old = await db.journal.get(id);
        await db.journal.delete(id);
        return old;
      });
    },
    async restoreJournal(e: JournalEntry): Promise<void> {
      await db.journal.put(e);
    },

    // ── Sleep ──
    /** "Going to sleep": start a sleep now, unless one is already going. */
    async startSleep(start: number): Promise<SleepRecord | undefined> {
      return db.transaction('rw', db.sleep, async () => {
        if ((await db.sleep.toArray()).some((r) => r.end === undefined)) return undefined;
        const rec: SleepRecord = { id: newId(), schemaVersion: v, start, day: sleepDay({ start }) };
        await db.sleep.put(rec);
        return rec;
      });
    },
    /** "I'm up": end the sleep that is going; returns it as it was, for undo. */
    async endSleep(end: number): Promise<SleepRecord | undefined> {
      return db.transaction('rw', db.sleep, async () => {
        const open = (await db.sleep.toArray()).find((r) => r.end === undefined);
        if (!open) return undefined;
        await db.sleep.put({ ...open, end: Math.max(end, open.start), day: sleepDay({ start: open.start, end: Math.max(end, open.start) }) });
        return open;
      });
    },
    /**
     * Save a sleep with both times (from the morning question, the diary or the assistant). Sleeps it
     * overlaps are replaced, so a night told to the assistant after "Going to sleep" is not counted
     * twice. Returns the new record and the replaced ones, for undo.
     */
    async saveSleep(s: { start: number; end: number }, replacing?: string): Promise<{ saved: SleepRecord; replaced: SleepRecord[] }> {
      return db.transaction('rw', db.sleep, async () => {
        const replaced = (await db.sleep.toArray()).filter((r) => r.id === replacing || overlaps(r, s));
        await db.sleep.bulkDelete(replaced.map((r) => r.id));
        const old = replaced.find((r) => r.id === replacing);
        const saved: SleepRecord = { id: old?.id ?? newId(), schemaVersion: v, start: s.start, end: s.end, day: sleepDay(s) };
        await db.sleep.put(saved);
        return { saved, replaced };
      });
    },
    /** Undo a save: remove what was saved and put back what it replaced. */
    async undoSleep(saved: SleepRecord, replaced: SleepRecord[]): Promise<void> {
      await db.transaction('rw', db.sleep, async () => {
        await db.sleep.delete(saved.id);
        await db.sleep.bulkPut(replaced);
      });
    },
    async deleteSleep(id: string): Promise<SleepRecord | undefined> {
      return db.transaction('rw', db.sleep, async () => {
        const old = await db.sleep.get(id);
        await db.sleep.delete(id);
        return old;
      });
    },
    async restoreSleep(r: SleepRecord): Promise<void> {
      await db.sleep.put(r);
    },

    // ── Activities ──
    async addActivity(a: Omit<ActivityRecord, 'id' | 'schemaVersion'>): Promise<ActivityRecord> {
      const rec: ActivityRecord = { ...a, id: newId(), schemaVersion: v };
      await db.activities.put(rec);
      return rec;
    },
    async updateActivity(a: ActivityRecord): Promise<void> {
      await db.activities.put({ ...a, schemaVersion: v });
    },
    /** Delete an activity; returns it so the UI can offer undo via restoreActivity. */
    async deleteActivity(id: string): Promise<ActivityRecord | undefined> {
      return db.transaction('rw', db.activities, async () => {
        const old = await db.activities.get(id);
        await db.activities.delete(id);
        return old;
      });
    },
    async restoreActivity(a: ActivityRecord): Promise<void> {
      await db.activities.put(a);
    },

    // ── Water ──
    async addWater(w: Omit<WaterRecord, 'id' | 'schemaVersion'>): Promise<WaterRecord> {
      const rec: WaterRecord = { ...w, id: newId(), schemaVersion: v };
      await db.water.put(rec);
      return rec;
    },
    async updateWater(w: WaterRecord): Promise<void> {
      await db.water.put({ ...w, schemaVersion: v });
    },
    /** Delete a water entry; returns it so the UI can offer undo via restoreWater. */
    async deleteWater(id: string): Promise<WaterRecord | undefined> {
      return db.transaction('rw', db.water, async () => {
        const old = await db.water.get(id);
        await db.water.delete(id);
        return old;
      });
    },
    async restoreWater(w: WaterRecord): Promise<void> {
      await db.water.put(w);
    },

    // ── Meta ──
    async getMeta<T>(key: string): Promise<T | undefined> {
      return (await db.meta.get(key))?.value as T | undefined;
    },
    async setMeta(key: string, value: unknown): Promise<void> {
      await db.meta.put({ key, value });
    },

    // ── Backup ──
    async snapshot(): Promise<Snapshot> {
      return db.transaction('r', [db.profile, db.settings, db.recipes, db.batches, db.log, db.customFoods, db.dayStatus, db.fasts, db.sunEntries, db.products, db.journal, db.sleep, db.activities, db.water], async () => ({
        profile: (await db.profile.get('profile')) ?? null,
        settings: (await db.settings.get('settings')) ?? null,
        recipes: await db.recipes.toArray(),
        batches: await db.batches.toArray(),
        log: await db.log.toArray(),
        customFoods: await db.customFoods.toArray(),
        dayStatus: await db.dayStatus.toArray(),
        fasts: await db.fasts.toArray(),
        sunEntries: await db.sunEntries.toArray(),
        products: await db.products.toArray(),
        journal: await db.journal.toArray(),
        sleep: await db.sleep.toArray(),
        activities: await db.activities.toArray(),
        water: await db.water.toArray(),
      }));
    },
    /** Replace all personal data with the snapshot (after the user confirmed a preview). */
    async restore(s: Snapshot): Promise<void> {
      const tables = [db.profile, db.settings, db.recipes, db.batches, db.log, db.customFoods, db.dayStatus, db.fasts, db.sunEntries, db.products, db.journal, db.sleep, db.activities, db.water];
      await db.transaction('rw', tables, async () => {
        await Promise.all(tables.map((t) => t.clear()));
        if (s.profile) await db.profile.put(s.profile);
        if (s.settings) await db.settings.put(s.settings);
        await db.recipes.bulkPut(s.recipes);
        await db.batches.bulkPut(s.batches);
        await db.log.bulkPut(s.log);
        await db.customFoods.bulkPut(s.customFoods);
        await db.dayStatus.bulkPut(s.dayStatus);
        await db.fasts.bulkPut(s.fasts);
        await db.sunEntries.bulkPut(s.sunEntries);
        await db.products.bulkPut(s.products);
        await db.journal.bulkPut(s.journal);
        await db.sleep.bulkPut(s.sleep);
        await db.activities.bulkPut(s.activities);
        await db.water.bulkPut(s.water);
      });
      await runMigrations(db);
    },
  };

  async function changeRemaining(batchId: string, storage: Storage, delta: number) {
    const b = await db.batches.get(batchId);
    if (!b) return;
    await db.batches.put({ ...b, remaining: { ...b.remaining, [storage]: Math.max(0, b.remaining[storage] + delta) } });
  }

  return repo;
}

export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo(defaultDb);
