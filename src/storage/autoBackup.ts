/**
 * Automatic backups (docs/SPEC.md, "Automatic backups"): full backups the app saves by itself into
 * the `autoBackups` table, in the same format as "Export everything". They are written inside the
 * caller's transaction (a normal one, or Dexie's upgrade transaction while an app update changes how
 * data is stored), so the copy is taken from exactly the data the change starts from.
 */
import type { Table } from 'dexie';
import { buildBackup, snapshotCounts } from '../exchange/build';
import { dayKey } from '../lib/dates';
import { newId } from '../lib/id';
import { isOn } from '../settings/features';
import { TABLES } from './migrations';
import type { Snapshot } from './repo';
import { DEFAULT_AUTO_BACKUP_KEEP, type AutoBackup, type MetaRecord, type PortionSize, type Profile, type Settings } from './types';

/** Looks up a table in the current transaction. */
export type GetTable = (name: string) => Table<any, any>;

/** Saved portion sizes live in meta under this prefix plus the food code. */
export const PORTIONS_PREFIX = 'portions:';

/** Every table a snapshot reads (all personal data). */
export const SNAPSHOT_TABLES: string[] = [...TABLES, 'meta'];

/** All personal data, as stored. The one reader behind "Export everything" and automatic backups. */
export async function readSnapshot(table: GetTable): Promise<Snapshot> {
  const all = (name: string) => table(name).toArray();
  const portions = (await table('meta').where('key').startsWith(PORTIONS_PREFIX).toArray()) as MetaRecord[];
  return {
    profile: ((await table('profile').get('profile')) as Profile | undefined) ?? null,
    settings: ((await table('settings').get('settings')) as Settings | undefined) ?? null,
    recipes: await all('recipes'),
    batches: await all('batches'),
    log: await all('log'),
    customFoods: await all('customFoods'),
    dayStatus: await all('dayStatus'),
    fasts: await all('fasts'),
    sunEntries: await all('sunEntries'),
    products: await all('products'),
    journal: await all('journal'),
    sleep: await all('sleep'),
    activities: await all('activities'),
    water: await all('water'),
    portionSizes: portions.filter((r) => Array.isArray(r.value) && r.value.length).map((r) => ({ food: r.key.slice(PORTIONS_PREFIX.length), sizes: r.value as PortionSize[] })),
  };
}

/** Nothing worth a copy yet: a fresh install that has not been set up. */
function isEmpty(s: Snapshot): boolean {
  return !s.profile?.onboarded && Object.values(snapshotCounts(s)).every((n) => n === 0);
}

/**
 * Save a full backup now and delete the oldest beyond the number to keep. Needs a transaction over
 * SNAPSHOT_TABLES and `autoBackups`. Returns the new backup, or nothing when automatic backups are off
 * or there is no data yet.
 */
export async function writeAutoBackup(table: GetTable, reason: AutoBackup['reason'], now: Date): Promise<AutoBackup | undefined> {
  const snapshot = await readSnapshot(table);
  if (!isOn(snapshot.settings?.features, 'autoBackup') || isEmpty(snapshot)) return undefined;
  const json = JSON.stringify(buildBackup(snapshot, __APP_VERSION__, now));
  const rec: AutoBackup = { id: newId(), at: now.getTime(), reason, json, size: new TextEncoder().encode(json).length, counts: snapshotCounts(snapshot) };
  await table('autoBackups').put(rec);
  await pruneAutoBackups(table, keepCount(snapshot.settings));
  return rec;
}

export function keepCount(settings: Settings | null | undefined): number {
  return Math.max(1, settings?.autoBackupKeep ?? DEFAULT_AUTO_BACKUP_KEEP);
}

/** Delete all but the `keep` newest automatic backups. */
export async function pruneAutoBackups(table: GetTable, keep: number): Promise<void> {
  const old = await table('autoBackups').orderBy('at').reverse().offset(keep).primaryKeys();
  if (old.length) await table('autoBackups').bulkDelete(old);
}

/** A daily backup is due when the newest automatic backup is from an earlier day (or there is none). */
export function dailyBackupDue(newestAt: number | undefined, now: Date): boolean {
  return newestAt === undefined || dayKey(new Date(newestAt)) < dayKey(now);
}
