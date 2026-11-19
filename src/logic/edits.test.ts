import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../storage/types';
import { applyEdit, editableFields, sameRecord, type RecentRecord } from './edits';

const at = (s: string) => new Date(s).getTime();
const gum: LogEntry = { id: 'L', schemaVersion: 1, kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'S1' }, grams: 4.2, pieces: 3, preparation: 'asListed', time: at('2026-11-18T08:10'), day: '2026-11-18', confidence: 'C', label: 'Gum' };

describe('applying a change to a saved entry', () => {
  it('moves the day with the time', () => {
    const r = applyEdit({ kind: 'log', rec: gum }, { time: at('2026-11-17T23:30') });
    expect(r.rec).toMatchObject({ time: at('2026-11-17T23:30'), day: '2026-11-17', grams: 4.2 });
  });

  it('sets grams from pieces by the weight of one, and grams alone end the count', () => {
    expect(applyEdit({ kind: 'log', rec: gum }, { pieces: 2 }).rec).toMatchObject({ pieces: 2, grams: 2.8 });
    const byGrams = applyEdit({ kind: 'log', rec: gum }, { grams: 10 }).rec as Extract<LogEntry, { kind: 'food' }>;
    expect(byGrams.grams).toBe(10);
    expect(byGrams.pieces).toBeUndefined();
  });

  it('gives a sleep the day it now ends on', () => {
    const r = applyEdit({ kind: 'sleep', rec: { id: 'S', schemaVersion: 1, start: at('2026-11-17T23:00'), end: at('2026-11-18T07:00'), day: '2026-11-18' } }, { start: at('2026-11-18T01:00'), end: at('2026-11-18T09:00') });
    expect(r.rec).toMatchObject({ start: at('2026-11-18T01:00'), end: at('2026-11-18T09:00'), day: '2026-11-18' });
  });

  it('takes the pulse off with 0 and keeps it otherwise', () => {
    const bp: RecentRecord = { kind: 'bloodPressure', rec: { id: 'D', schemaVersion: 1, time: at('2026-11-18T08:00'), day: '2026-11-18', systolic: 130, diastolic: 85, pulse: 64 } };
    expect(applyEdit(bp, { systolic: 128 }).rec).toMatchObject({ systolic: 128, pulse: 64 });
    expect('pulse' in applyEdit(bp, { pulse: 0 }).rec).toBe(false);
  });

  it('tells when nothing would change, whatever the order of fields', () => {
    const water: RecentRecord = { kind: 'water', rec: { id: 'W', schemaVersion: 1, time: at('2026-11-18T08:00'), day: '2026-11-18', ml: 500 } };
    expect(sameRecord(water, applyEdit(water, { ml: 500 }))).toBe(true);
    expect(sameRecord(water, applyEdit(water, { ml: 250 }))).toBe(false);
  });

  it('lets each kind change only its own fields', () => {
    expect(editableFields({ kind: 'log', rec: gum })).toEqual(['time', 'grams', 'pieces']);
    expect(editableFields({ kind: 'weight', rec: { day: '2026-11-18', kg: 80 } })).toEqual(['kg']);
  });
});
