import { describe, expect, it } from 'vitest';
import { migrateRecord, needsMigration } from './migrations';
import { CURRENT_SCHEMA_VERSION } from './types';

describe('migrations', () => {
  it('upgrades version-0 records and fills defaults', () => {
    const r = migrateRecord('profile', { id: 'profile', modelStartDay: '2026-01-01', sex: 'male' });
    expect(r.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(r.sex).toBe('male');
    expect(r.salt).toEqual({ iodised: true, fluoridated: false });
  });

  it('keeps existing values', () => {
    const r = migrateRecord('settings', { id: 'settings', features: { absorption: false } });
    expect((r.features as Record<string, boolean>).absorption).toBe(false);
    expect((r.features as Record<string, boolean>).retention).toBe(true);
  });

  it('leaves current records alone', () => {
    const rec = { id: 'x', schemaVersion: CURRENT_SCHEMA_VERSION, tags: ['a'] };
    expect(needsMigration(rec)).toBe(false);
    expect(migrateRecord('recipes', rec)).toEqual(rec);
  });

  it('refuses records from a newer app', () => {
    expect(() => migrateRecord('log', { schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(/newer/);
  });
});
