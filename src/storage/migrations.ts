/**
 * Record migrations. Each table has a list of steps; step i upgrades a record from version i to i+1.
 * Records without `schemaVersion` are treated as version 0 (pre-release data).
 * Pure functions: tested in migrations.test.ts.
 */
import { DEFAULT_FEATURES } from '../settings/features';
import { CURRENT_SCHEMA_VERSION } from './types';

type AnyRecord = Record<string, unknown> & { schemaVersion?: number };
type Step = (r: AnyRecord) => AnyRecord;

export const TABLES = ['profile', 'settings', 'recipes', 'batches', 'log', 'customFoods', 'dayStatus', 'fasts', 'sunEntries', 'products', 'journal', 'sleep', 'activities', 'water', 'shopping', 'pantry'] as const;
export type TableName = (typeof TABLES)[number];

const steps: Record<TableName, Step[]> = {
  // v0 → v1: fill fields that may be missing.
  profile: [(r) => ({ weightHistory: [], salt: { iodised: true, fluoridated: false }, exclusions: { groups: [], foods: [] }, startingLevel: 'average', onboarded: false, ...r })],
  settings: [(r) => ({ ...r, features: { ...DEFAULT_FEATURES, ...((r.features as object | undefined) ?? {}) }, hiddenNutrients: r.hiddenNutrients ?? [] })],
  recipes: [(r) => ({ tags: [], ...r })],
  batches: [(r) => ({ corrections: [], ...r })],
  log: [(r) => ({ confidence: 'B', ...r })],
  customFoods: [(r) => r],
  dayStatus: [(r) => r],
  fasts: [(r) => r],
  sunEntries: [(r) => r],
  products: [(r) => r],
  journal: [(r) => r],
  sleep: [(r) => r],
  activities: [(r) => r],
  water: [(r) => r],
  shopping: [(r) => r],
  pantry: [(r) => r],
};

export function needsMigration(record: AnyRecord): boolean {
  return (record.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION;
}

export function migrateRecord(table: TableName, record: AnyRecord): AnyRecord {
  let r = record;
  let v = r.schemaVersion ?? 0;
  if (v > CURRENT_SCHEMA_VERSION) throw new Error(`${table} record has schema version ${v}, newer than this app (${CURRENT_SCHEMA_VERSION}). Update the app.`);
  while (v < CURRENT_SCHEMA_VERSION) {
    const step = steps[table][v];
    if (!step) throw new Error(`No migration for ${table} from version ${v}`);
    r = { ...step(r), schemaVersion: v + 1 };
    v++;
  }
  return r;
}
