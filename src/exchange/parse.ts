import type { z } from 'zod';
import type { Snapshot } from '../storage/repo';
import { exchangeSchema, FORMAT_VERSION, type BackupFile, type ExchangeFile } from './schema';

export type ParseResult = { ok: true; value: ExchangeFile } | { ok: false; error: string };

function describeIssues(error: z.ZodError): string {
  const lines = error.issues.slice(0, 5).map((i) => {
    const path = i.path.length ? i.path.join('.') : '(top level)';
    return `${path}: ${i.message}`;
  });
  if (error.issues.length > 5) lines.push(`… and ${error.issues.length - 5} more problems`);
  return lines.join('\n');
}

/** Parse and validate any ToFoo exchange file. Never partially accepts invalid input. */
export function parseExchange(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not valid JSON.' };
  }
  if (typeof json === 'object' && json !== null && 'formatVersion' in json) {
    const v = (json as { formatVersion: unknown }).formatVersion;
    if (typeof v === 'number' && v > FORMAT_VERSION) {
      return { ok: false, error: `This file uses format version ${v}, but this app reads up to version ${FORMAT_VERSION}. Update the app first.` };
    }
  }
  const res = exchangeSchema.safeParse(json);
  if (!res.success) return { ok: false, error: describeIssues(res.error) };
  return { ok: true, value: res.data };
}

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

export function backupSummary(b: BackupFile): Array<[string, number]> {
  return [
    ['Log entries', b.data.log.length],
    ['Recipes', b.data.recipes.length],
    ['Batches', b.data.batches.length],
    ['Saved foods and supplements', b.data.customFoods.length],
    ['Day statuses', b.data.dayStatus.length],
    ['Fasts', b.data.fasts.length],
    ['Time-outside entries', b.data.sunEntries.length],
    ['Packaged products', b.data.products.length],
    ['Journal entries', b.data.journal.length],
    ['Sleeps', b.data.sleep.length],
    ['Activities', b.data.activities.length],
    ['Water entries', b.data.water.length],
  ];
}

export function backupFileName(now: Date): string {
  return `tofoo-backup-${now.toISOString().slice(0, 10)}.json`;
}
