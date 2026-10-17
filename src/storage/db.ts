/**
 * IndexedDB via Dexie. Only this folder talks to the database; the rest of the app uses the
 * repository functions in ./repo.ts, so a sync backend can be added later (v4).
 */
import Dexie, { type Table } from 'dexie';
import { migrateRecord, needsMigration, TABLES, type TableName } from './migrations';
import type { ActivityRecord, Batch, CustomFood, DayStatusRecord, Fast, JournalEntry, LogEntry, MetaRecord, Product, Profile, Recipe, Settings, SleepRecord, SunEntry } from './types';

export class ToFooDB extends Dexie {
  profile!: Table<Profile, string>;
  settings!: Table<Settings, string>;
  recipes!: Table<Recipe, string>;
  batches!: Table<Batch, string>;
  log!: Table<LogEntry, string>;
  customFoods!: Table<CustomFood, string>;
  dayStatus!: Table<DayStatusRecord, string>;
  fasts!: Table<Fast, string>;
  sunEntries!: Table<SunEntry, string>;
  products!: Table<Product, string>;
  journal!: Table<JournalEntry, string>;
  sleep!: Table<SleepRecord, string>;
  activities!: Table<ActivityRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'tofoo') {
    super(name);
    // Dexie schema (indexes only). Record-level schema versions are handled by ./migrations.ts.
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      recipes: 'id, name, updatedAt',
      batches: 'id, recipeId, cookedDay',
      log: 'id, time, day, kind',
      customFoods: 'id, name',
      dayStatus: 'day',
      fasts: 'id, startDay',
      sunEntries: 'id, day',
      meta: 'key',
    });
    // v2: Open Food Facts products.
    this.version(2).stores({ products: 'id, name' });
    // v3: journal entries.
    this.version(3).stores({ journal: 'id, time, day' });
    // v4: sleep.
    this.version(4).stores({ sleep: 'id, start, day' });
    // v5: activities.
    this.version(5).stores({ activities: 'id, time, day' });
  }

  table_(name: TableName): Table<Record<string, unknown>, string> {
    return this.table(name) as unknown as Table<Record<string, unknown>, string>;
  }
}

/** Upgrade any stored records with an old schema version. Returns the number of migrated records. */
export async function runMigrations(db: ToFooDB): Promise<number> {
  let count = 0;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const table = db.table_(t);
      const old = (await table.toArray()).filter((r) => needsMigration(r));
      if (old.length) {
        await table.bulkPut(old.map((r) => migrateRecord(t, r)));
        count += old.length;
      }
    }
  });
  return count;
}

export const db = new ToFooDB();
