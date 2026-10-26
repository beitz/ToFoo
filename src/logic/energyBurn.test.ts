import { describe, expect, it } from 'vitest';
import { activityKcal } from '../model/activityEnergy';
import type { ActivityRecord } from '../storage/types';
import { activityEnergyOf, averageActivityKcal, burnByDay, rowOf } from './energyBurn';

const act = (p: Partial<ActivityRecord>): ActivityRecord => ({ id: 'a', schemaVersion: 1, kind: 'walk', time: 0, day: '2026-10-20', minutes: 60, intensity: 'hard', outside: true, ...p });
const base = { kcalPerDay: 2400, weightKg: 80 };

describe('energy burned', () => {
  it('counts an activity as its picked Compendium row, else the one for its kind and effort', () => {
    expect(rowOf(act({}))).toMatchObject({ row: { code: '17200' }, picked: false });
    expect(rowOf(act({ compendium: '02175' }))).toMatchObject({ row: { code: '02175' }, picked: true });
    expect(rowOf(act({ kind: 'other' }))).toBeUndefined();
    // An unknown code falls back to the kind's row.
    expect(rowOf(act({ compendium: '99999' }))?.row.code).toBe('17200');
  });

  it('gives the total cost and what it adds above the base day', () => {
    const e = activityEnergyOf(act({}), 80, 2400)!;
    expect(e.totalKcal).toBeCloseTo(activityKcal(4.8, 80, 60));
    expect(e.extraKcal).toBeCloseTo(e.totalKcal - 100);
  });

  it('adds up the activities of each day and counts the ones without energy as unknown', () => {
    const days = ['2026-10-20', '2026-10-21'];
    const m = burnByDay(days, [act({}), act({ id: 'b', kind: 'other' }), act({ id: 'c', day: '2026-10-30' })], base);
    const d = m.get('2026-10-20')!;
    expect(d.unknown).toBe(1);
    expect(d.totalKcal).toBeCloseTo(2400 + d.activityKcal);
    expect(m.get('2026-10-21')).toEqual({ baseKcal: 2400, activityKcal: 0, unknown: 0, totalKcal: 2400 });
    expect(averageActivityKcal(days, [act({})], base)).toBeCloseTo(d.activityKcal / 2);
  });
});
