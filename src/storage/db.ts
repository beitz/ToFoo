/**
 * IndexedDB via Dexie. Only this folder talks to the database; the rest of the app uses the
 * repository functions in ./repo.ts, so a sync backend can be added later (v4).
 */
import Dexie, { type Table, type Transaction } from 'dexie';
import { SNAPSHOT_TABLES, writeAutoBackup } from './autoBackup';
import { migrateRecord, needsMigration, TABLES, type TableName } from './migrations';
import type { ChatPhoto, ChatRecord } from '../ai/chatRecord';
import type { ActivityRecord, AutoBackup, Batch, CustomFood, DayStatusRecord, Fast, JournalEntry, LogEntry, MetaRecord, Product, Profile, Recipe, Settings, SleepRecord, SunEntry, WaterRecord } from './types';

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
  water!: Table<WaterRecord, string>;
  meta!: Table<MetaRecord, string>;
  /** Saved assistant chats (not in backups: they are logs for debugging, see src/ai/chatRecord.ts). */
  chats!: Table<ChatRecord, string>;
  chatPhotos!: Table<ChatPhoto, string>;
  /** Backups the app saved by itself (not in backups, see ./autoBackup.ts). */
  autoBackups!: Table<AutoBackup, string>;
  /** Set once a backup was saved before an upgrade while opening, so one update saves one copy. */
  upgradeBackupTaken = false;

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
    // v6: plain water.
    this.version(6).stores({ water: 'id, time, day' });
    // v7: saved assistant chats and their photos.
    this.version(7).stores({ chats: 'id, updatedAt', chatPhotos: 'id, chatId' });
    // v8: automatic backups. From here on every version starts its upgrade with backupBeforeUpgrade
    // (before any change of its own to the data), so an app update that changes how data is stored
    // first saves a copy of it. Dexie runs no upgrade functions for a new, empty database.
    this.version(8)
      .stores({ autoBackups: 'id, at' })
      .upgrade((tx) => this.backupBeforeUpgrade(tx));
  }

  /** Save a full backup inside the upgrade transaction, once per opening. */
  async backupBeforeUpgrade(tx: Transaction): Promise<void> {
    if (this.upgradeBackupTaken) return;
    this.upgradeBackupTaken = true;
    await writeAutoBackup((name) => tx.table(name), 'upgrade', new Date());
  }

  table_(name: TableName): Table<Record<string, unknown>, string> {
    return this.table(name) as unknown as Table<Record<string, unknown>, string>;
  }
}

/**
 * Upgrade any stored records with an old schema version. Returns the number of migrated records.
 * When there are any, a backup of the data as it was is saved first (unless one was already saved
 * while opening, or `backup` is false: right after a restore, which saved its own).
 */
export async function runMigrations(db: ToFooDB, { backup = true } = {}): Promise<number> {
  let count = 0;
  await db.transaction('rw', [...SNAPSHOT_TABLES, 'autoBackups'], async () => {
    const old = new Map<TableName, Array<Record<string, unknown>>>();
    for (const t of TABLES) {
      const records = (await db.table_(t).toArray()).filter((r) => needsMigration(r));
      if (records.length) old.set(t, records);
    }
    if (!old.size) return;
    if (backup && !db.upgradeBackupTaken) {
      db.upgradeBackupTaken = true;
      await writeAutoBackup((name) => db.table(name), 'upgrade', new Date());
    }
    for (const [t, records] of old) {
      await db.table_(t).bulkPut(records.map((r) => migrateRecord(t, r)));
      count += records.length;
    }
  });
  return count;
}

export const db = new ToFooDB();
