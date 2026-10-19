/**
 * Building backup files. Kept apart from the validator (./parse.ts, ./schema.ts) so the storage layer
 * can write automatic backups, even inside a database upgrade, without loading zod at start-up.
 */
import type { Snapshot } from '../storage/repo';
import type { BackupFile } from './schema';

export const FORMAT_VERSION = 1;

export function buildBackup(snapshot: Snapshot, appVersion: string, now: Date): BackupFile {
  return {
    format: 'tofoo',
    formatVersion: FORMAT_VERSION,
    type: 'backup',
    exportedAt: now.toISOString(),
    app: { version: appVersion },
    data: snapshot,
  };
}

/** Keys of the record lists in a backup, in the order the app shows their counts. */
export const COUNTED = ['log', 'recipes', 'batches', 'journal', 'sleep', 'activities', 'water', 'shopping', 'customFoods', 'products', 'fasts', 'dayStatus', 'sunEntries', 'portionSizes'] as const;
export type CountedKey = (typeof COUNTED)[number];

/** Number of records per list, e.g. { log: 320, recipes: 12, … }. */
export function snapshotCounts(s: Snapshot | BackupFile['data']): Record<CountedKey, number> {
  return Object.fromEntries(COUNTED.map((k) => [k, s[k]?.length ?? 0])) as Record<CountedKey, number>;
}

export function backupFileName(now: Date): string {
  return `tofoo-backup-${now.toISOString().slice(0, 10)}.json`;
}
