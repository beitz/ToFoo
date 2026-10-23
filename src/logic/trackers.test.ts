import { describe, expect, it } from 'vitest';
import type { ActivityRecord, WaterRecord } from '../storage/types';
import { activitySummary, pastFasts, perDay, statusTally, waterSummary, windowDays } from './trackers';

const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const act = (day: number, minutes: number, extra: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `a${day}${minutes}`,
  schemaVersion: 1,
  kind: 'cycling',
  name: 'Commute',
  time: new Date(2026, 9, day, 8).getTime(),
  day: key(day),
  minutes,
  outside: true,
  ...extra,
});
const water = (day: number, ml: number): WaterRecord => ({ id: `w${day}${ml}`, schemaVersion: 1, time: 0, day: key(day), ml });

describe('tracker pages', () => {
  it('lists the window ending today, oldest first', () => {
    expect(windowDays(key(22), 3)).toEqual([key(20), key(21), key(22)]);
  });

  it('sums per day inside the window only', () => {
    expect([...perDay([water(19, 500), water(21, 250), water(21, 250)], windowDays(key(22), 3), (r) => r.ml)]).toEqual([[key(21), 500]]);
  });

  it('averages activity over logged days, never counting unlogged days as zero', () => {
    const s = activitySummary([act(20, 25), act(20, 25), act(22, 40, { kind: 'run', name: undefined, outside: false }), act(10, 99)], windowDays(key(22), 7));
    expect(s).toMatchObject({ loggedDays: 2, totalMinutes: 90, outsideMinutes: 50, averageMinutes: 45 });
    expect(s.top.map((g) => [g.kind, g.name, g.count, g.minutes])).toEqual([
      ['cycling', 'Commute', 2, 50],
      ['run', undefined, 1, 40],
    ]);
    expect(activitySummary([], windowDays(key(22), 7)).averageMinutes).toBeUndefined();
  });

  it('averages water over logged days and counts days at the target', () => {
    const totals = perDay([water(21, 2000), water(22, 1000), water(22, 500)], windowDays(key(22), 7), (r) => r.ml);
    expect(waterSummary(totals, 1500)).toEqual({ loggedDays: 2, averageMl: 1750, daysAtTarget: 2 });
    expect(waterSummary(new Map(), 1500).averageMl).toBeUndefined();
  });

  it('gives each fast its hours, newest first, and runs a fast still going until now', () => {
    const h = 3_600_000;
    const list = pastFasts(
      [
        { id: 'a', startDay: key(10), since: 0, end: 40 * h, fromMeal: true },
        { id: 'b', startDay: key(20), since: 100 * h, fromMeal: false },
      ],
      130 * h,
    );
    expect(list).toEqual([
      { id: 'b', startDay: key(20), hours: 30, running: true, fromMeal: false },
      { id: 'a', startDay: key(10), hours: 40, running: false, fromMeal: true },
    ]);
  });

  it('counts nutrients per status, leaving out info-only and hidden ones', () => {
    const m = new Map([
      ['a', { status: 'low' as const, kind: 'rolling' }],
      ['b', { status: 'fine' as const, kind: 'rolling' }],
      ['c', { status: 'fine' as const, kind: 'limit' }],
      ['d', { status: 'info' as const, kind: 'info' }],
      ['e', { status: 'low' as const, kind: 'rolling' }],
    ]);
    expect(statusTally(m, new Set(['e']))).toEqual({ low: 1, fine: 2 });
  });
});
