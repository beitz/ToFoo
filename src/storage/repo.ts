/**
 * Repository: the only API the UI uses to read and write personal data.
 */
import { newId } from '../lib/id';
import { refKey } from '../lib/refs';
import { overlaps, sleepDay } from '../logic/sleep';
import { withPot, type PotDetails } from '../logic/batch';
import { dailyBackupDue, keepCount, PORTIONS_PREFIX, pruneAutoBackups, readSnapshot, SNAPSHOT_TABLES, writeAutoBackup } from './autoBackup';
import type { Table } from 'dexie';
import { db as defaultDb, runMigrations, type ToFooDB } from './db';
import { defaultProfile, defaultSettings } from './defaults';
import {
  CURRENT_SCHEMA_VERSION,
  type AutoBackup,
  type Batch,
  type CustomFood,
  type DayStatusRecord,
  type FoodPortionSizes,
  type FavouriteMeal,
  type FoodRef,
  type Fast,
  type JournalEntry,
  type SleepRecord,
  type ActivityRecord,
  type WaterRecord,
  type ShoppingItem,
  type PantryItem,
  type KetoneReading,
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
import type { ChatPhoto, ChatRecord } from '../ai/chatRecord';

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
  shopping: ShoppingItem[];
  pantry: PantryItem[];
  ketones: KetoneReading[];
  /** Missing in backups from before portion sizes were included; restoring one keeps the sizes on the phone. */
  portionSizes?: FoodPortionSizes[];
}


/** What a shopping list change replaced and created, to put it back. */
export interface ShoppingUndo {
  before: ShoppingItem[];
  created: string[];
}

/** What a change to the At home list (and the shopping list with it) replaced and created. */
export interface HomeUndo {
  pantry: { before: PantryItem[]; created: string[] };
  shopping: ShoppingUndo;
}

/** Records to write and ids to delete in one list. */
interface ListChange<T> {
  put: T[];
  remove: string[];
}

/** Apply a list change inside a transaction; returns what it replaced and created. */
async function applyChange<T extends { id: string; schemaVersion: number }>(table: Table<T, string>, change: ListChange<T> | undefined, v: number): Promise<{ before: T[]; created: string[] }> {
  if (!change) return { before: [], created: [] };
  const { put, remove } = change;
  const before = (await table.bulkGet([...put.map((i) => i.id), ...remove])).filter((i): i is T => !!i);
  const existed = new Set(before.map((i) => i.id));
  await table.bulkDelete(remove);
  await table.bulkPut(put.map((i) => ({ ...i, schemaVersion: v })));
  return { before, created: put.filter((i) => !existed.has(i.id)).map((i) => i.id) };
}

async function undoChange<T>(table: Table<T, string>, u: { before: T[]; created: string[] }): Promise<void> {
  await table.bulkDelete(u.created);
  await table.bulkPut(u.before);
}

/** A product's BLS pairing on its own: the match, else "label only", else nothing. */
function pairOf(p: Pick<Product, 'match' | 'labelOnly'> | undefined): Pick<Product, 'match' | 'labelOnly'> {
  if (p?.match) return { match: p.match };
  return p?.labelOnly ? { labelOnly: true } : {};
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
    /**
     * Cook a batch of a recipe: a copy of the recipe, and optionally what this pot had instead of
     * the recipe's ingredients, its cooked weight, the portions it made (the plan is for those) and
     * the empty pot's weight (remembered for next time).
     */
    async cookBatch(recipe: Recipe, plan: { fresh: number; fridge: number; freezer: number }, day: string, rememberPlan?: StoragePlan, pot?: Partial<PotDetails> & { emptyPotGrams?: number }): Promise<Batch> {
      const cooked: Batch = {
        id: newId(),
        recipeId: recipe.id,
        recipe: { name: recipe.name, portions: pot?.portions ?? recipe.portions, ingredients: recipe.ingredients.map((i) => ({ ...i })), ...(recipe.saltOverride ? { saltOverride: recipe.saltOverride } : {}) },
        cookedDay: day,
        cookedAt: Date.now(),
        plan,
        remaining: { ...plan },
        corrections: [],
        schemaVersion: v,
      };
      const batch = pot ? withPot(cooked, { ingredients: pot.ingredients ?? cooked.recipe.ingredients, cookedGrams: pot.cookedGrams }) : cooked;
      await db.transaction('rw', db.batches, db.recipes, db.settings, async () => {
        await db.batches.put(batch);
        if (rememberPlan) await db.recipes.update(recipe.id, { defaultPlan: rememberPlan });
        await rememberPot(recipe.id, pot?.emptyPotGrams);
      });
      return batch;
    },
    /** Change what a cooked pot had, its weight or its portions; returns the batch as it was, for undo via restoreBatch. */
    async updateBatchPot(batchId: string, pot: PotDetails & { emptyPotGrams?: number }): Promise<Batch | undefined> {
      return db.transaction('rw', db.batches, db.recipes, db.settings, async () => {
        const old = await db.batches.get(batchId);
        if (!old) return undefined;
        await db.batches.put(withPot(old, pot));
        await rememberPot(old.recipeId, pot.emptyPotGrams);
        return old;
      });
    },
    async restoreBatch(batch: Batch): Promise<void> {
      await db.batches.put(batch);
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
    /** Save (or refresh) a product; a refresh keeps the BLS match (or "label only") unless a new choice is given. */
    async saveProduct(product: Omit<Product, 'schemaVersion'>): Promise<Product> {
      return db.transaction('rw', db.products, async () => {
        const old = await db.products.get(product.id);
        const { match: _m, labelOnly: _l, ...rest } = product;
        const pair = product.match || product.labelOnly ? product : old;
        const rec: Product = { ...rest, ...pairOf(pair), schemaVersion: v };
        await db.products.put(rec);
        return rec;
      });
    },
    /** Set a product's similar BLS food, or none (`labelOnly` when the user chose none). */
    async setProductMatch(id: string, pair: Pick<Product, 'match' | 'labelOnly'>): Promise<void> {
      await db.transaction('rw', db.products, async () => {
        const p = await db.products.get(id);
        if (!p) return;
        const { match: _m, labelOnly: _l, ...rest } = p;
        await db.products.put({ ...rest, ...pairOf(pair), schemaVersion: v });
      });
    },
    /** Store the app's own picks, for products that still have no similar food and no "label only". */
    async setAutoMatches(picks: ReadonlyArray<{ id: string; match: NonNullable<Product['match']> }>): Promise<number> {
      return db.transaction('rw', db.products, async () => {
        let n = 0;
        for (const { id, match } of picks) {
          const p = await db.products.get(id);
          if (!p || p.match || p.labelOnly) continue;
          await db.products.put({ ...p, match: { ...match, auto: true }, schemaVersion: v });
          n++;
        }
        return n;
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

    // ── Ketone measurements ──
    async addKetone(k: Omit<KetoneReading, 'id' | 'schemaVersion'>): Promise<KetoneReading> {
      const rec: KetoneReading = { ...k, id: newId(), schemaVersion: v };
      await db.ketones.put(rec);
      return rec;
    },
    /** Delete a measurement; returns it so the UI can offer undo via restoreKetone. */
    async deleteKetone(id: string): Promise<KetoneReading | undefined> {
      return db.transaction('rw', db.ketones, async () => {
        const old = await db.ketones.get(id);
        await db.ketones.delete(id);
        return old;
      });
    },
    async restoreKetone(k: KetoneReading): Promise<void> {
      await db.ketones.put(k);
    },

    // ── Shopping list ──
    /**
     * Change the shopping list: `plan` gets every line (cleared ones too) inside the transaction and
     * says what to write and delete. Returns what it changed, for undo via undoShopping.
     */
    async changeShopping(plan: (items: ShoppingItem[]) => { put: ShoppingItem[]; remove: string[] }): Promise<ShoppingUndo> {
      return db.transaction('rw', db.shopping, async () => applyChange(db.shopping, plan(await db.shopping.toArray()), v));
    },
    async undoShopping(u: ShoppingUndo): Promise<void> {
      await db.transaction('rw', db.shopping, () => undoChange(db.shopping, u));
    },

    // ── At home ──
    /**
     * Change what is at home, and the shopping list with it in one go (put away what was bought,
     * put what runs low on the list): `plan` gets both lists inside the transaction. Returns what it
     * changed, for undo via undoHome.
     */
    async changeHome(plan: (pantry: PantryItem[], shopping: ShoppingItem[]) => { pantry?: ListChange<PantryItem>; shopping?: ListChange<ShoppingItem> }): Promise<HomeUndo> {
      return db.transaction('rw', db.pantry, db.shopping, async () => {
        const change = plan(await db.pantry.toArray(), await db.shopping.toArray());
        return { pantry: await applyChange(db.pantry, change.pantry, v), shopping: await applyChange(db.shopping, change.shopping, v) };
      });
    },
    async undoHome(u: HomeUndo): Promise<void> {
      await db.transaction('rw', db.pantry, db.shopping, async () => {
        await undoChange(db.pantry, u.pantry);
        await undoChange(db.shopping, u.shopping);
      });
    },

    // ── Meta ──
    async getMeta<T>(key: string): Promise<T | undefined> {
      return (await db.meta.get(key))?.value as T | undefined;
    },
    async setMeta(key: string, value: unknown): Promise<void> {
      await db.meta.put({ key, value });
    },

    // ── Saved assistant chats ──
    /** Save a chat and the photos it does not have yet. */
    async saveChat(chat: ChatRecord, photos: ChatPhoto[] = []): Promise<void> {
      await db.transaction('rw', db.chats, db.chatPhotos, async () => {
        await db.chats.put(chat);
        if (photos.length) await db.chatPhotos.bulkPut(photos);
      });
    },
    async chatPhotos(chatId: string): Promise<ChatPhoto[]> {
      return (await db.chatPhotos.where('chatId').equals(chatId).toArray()).sort((a, b) => a.n - b.n);
    },
    /** Characters of photo data per chat, for the sizes in the list. */
    async chatPhotoSizes(): Promise<Map<string, number>> {
      const sizes = new Map<string, number>();
      await db.chatPhotos.each((p) => void sizes.set(p.chatId, (sizes.get(p.chatId) ?? 0) + p.data.length));
      return sizes;
    },
    /** Delete chats with their photos; returns them so the UI can offer undo via restoreChats. */
    async deleteChats(ids: string[]): Promise<{ chats: ChatRecord[]; photos: ChatPhoto[] }> {
      return db.transaction('rw', db.chats, db.chatPhotos, async () => {
        const chats = (await db.chats.bulkGet(ids)).filter((c): c is ChatRecord => !!c);
        const photos = await db.chatPhotos.where('chatId').anyOf(ids).toArray();
        await db.chats.bulkDelete(ids);
        await db.chatPhotos.bulkDelete(photos.map((p) => p.id));
        return { chats, photos };
      });
    },
    async restoreChats(old: { chats: ChatRecord[]; photos: ChatPhoto[] }): Promise<void> {
      await db.transaction('rw', db.chats, db.chatPhotos, async () => {
        await db.chats.bulkPut(old.chats);
        await db.chatPhotos.bulkPut(old.photos);
      });
    },

    // ── Backup ──
    async snapshot(): Promise<Snapshot> {
      return db.transaction('r', SNAPSHOT_TABLES, () => readSnapshot((name) => db.table(name)));
    },
    /**
     * Replace all personal data with the snapshot (after the user confirmed a preview). With
     * `backupFirst`, an automatic backup of the data it replaces is saved in the same transaction.
     */
    async restore(s: Snapshot, { backupFirst = false } = {}): Promise<void> {
      const tables = [db.profile, db.settings, db.recipes, db.batches, db.log, db.customFoods, db.dayStatus, db.fasts, db.sunEntries, db.products, db.journal, db.sleep, db.activities, db.water, db.shopping, db.pantry, db.ketones];
      await db.transaction('rw', [...SNAPSHOT_TABLES, 'autoBackups'], async () => {
        if (backupFirst) await writeAutoBackup((name) => db.table(name), 'restore', new Date());
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
        await db.shopping.bulkPut(s.shopping);
        await db.pantry.bulkPut(s.pantry);
        await db.ketones.bulkPut(s.ketones);
        if (s.portionSizes) {
          await db.meta.where('key').startsWith(PORTIONS_PREFIX).delete();
          await db.meta.bulkPut(s.portionSizes.map((p) => ({ key: PORTIONS_PREFIX + p.food, value: p.sizes })));
        }
      });
      await runMigrations(db, { backup: false });
    },

    // ── Automatic backups ──
    /** Save the day's automatic backup unless there already is one from today. */
    async dailyAutoBackup(now: Date): Promise<AutoBackup | undefined> {
      return db.transaction('rw', [...SNAPSHOT_TABLES, 'autoBackups'], async () => {
        const newest = await db.autoBackups.orderBy('at').last();
        if (!dailyBackupDue(newest?.at, now)) return undefined;
        return writeAutoBackup((name) => db.table(name), 'daily', now);
      });
    },
    /** Newest first. */
    async listAutoBackups(): Promise<AutoBackup[]> {
      return db.autoBackups.orderBy('at').reverse().toArray();
    },
    async setAutoBackupProblem(id: string, problem: string): Promise<void> {
      await db.autoBackups.update(id, { problem });
    },
    /** Change how many automatic backups are kept; the oldest beyond that are deleted now. */
    async setAutoBackupKeep(keep: number): Promise<void> {
      await db.transaction('rw', db.settings, db.autoBackups, async () => {
        const s = (await db.settings.get('settings')) ?? defaultSettings();
        const next = { ...s, autoBackupKeep: keep, id: 'settings' as const, schemaVersion: v };
        await db.settings.put(next);
        await pruneAutoBackups((name) => db.table(name), keepCount(next));
      });
    },
  };

  /** Remember the empty pot's weight for the recipe and as the general default. */
  async function rememberPot(recipeId: string, emptyPotGrams: number | undefined) {
    if (!emptyPotGrams || !(emptyPotGrams > 0)) return;
    await db.recipes.update(recipeId, { potGrams: emptyPotGrams });
    const s = (await db.settings.get('settings')) ?? defaultSettings();
    await db.settings.put({ ...s, potGrams: emptyPotGrams, id: 'settings', schemaVersion: v });
  }

  async function changeRemaining(batchId: string, storage: Storage, delta: number) {
    const b = await db.batches.get(batchId);
    if (!b) return;
    await db.batches.put({ ...b, remaining: { ...b.remaining, [storage]: Math.max(0, b.remaining[storage] + delta) } });
  }

  return repo;
}

export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo(defaultDb);
