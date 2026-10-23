import { describe, expect, it } from 'vitest';
import type { ActivityRecord, SleepRecord, WaterRecord } from '../storage/types';
import { atDayMinute, frequentActivities, missingOn, usualNight, usualWater, type CatchUpInput } from './catchUp';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

const base: CatchUpInput = {
  day: key(22),
  on: { sleep: true, activity: true, water: true },
  foodUnknown: false,
  beforeStart: false,
  sleep: [{ day: key(20), end: at(20, 7) }],
  activities: [{ day: key(20) }],
  water: [{ day: key(21) }],
  skipped: new Set(),
};

const activity = (day: number, h: number, minutes: number, extra: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `a${day}${h}`,
  schemaVersion: 1,
  kind: 'cycling',
  name: 'Commute',
  time: at(day, h),
  day: key(day),
  minutes,
  outside: true,
  ...extra,
});

describe('catch up', () => {
  it('lists what the day lacks among the trackers in use, food first', () => {
    expect(missingOn({ ...base, foodUnknown: true })).toEqual(['food', 'sleep', 'activity', 'water']);
    expect(missingOn({ ...base, sleep: [...base.sleep, { day: key(22), end: at(22, 7) }], activities: [...base.activities, { day: key(22) }] })).toEqual(['water']);
  });

  it('leaves out trackers that are off, never used before the day, or skipped', () => {
    expect(missingOn({ ...base, on: { sleep: false, activity: true, water: true } })).toEqual(['activity', 'water']);
    expect(missingOn({ ...base, water: [{ day: key(23) }] })).toEqual(['sleep', 'activity']);
    expect(missingOn({ ...base, skipped: new Set(['sleep', 'water'] as const) })).toEqual(['activity']);
  });

  it('does not ask about food before the model starts, and a sleep still going does not count', () => {
    expect(missingOn({ ...base, foodUnknown: true, beforeStart: true })).toEqual(['sleep', 'activity', 'water']);
    expect(missingOn({ ...base, sleep: [{ day: key(20) }] })).toEqual(['activity', 'water']);
  });

  it('proposes the usual night ending on the day', () => {
    const nights: SleepRecord[] = [
      { id: 'n1', schemaVersion: 1, start: at(19, 23, 30), end: at(20, 7, 0), day: key(20) },
      { id: 'n2', schemaVersion: 1, start: at(20, 23, 30), end: at(21, 7, 0), day: key(21) },
    ];
    expect(usualNight(nights, key(22))).toEqual({ start: at(21, 23, 30), end: at(22, 7, 0) });
    expect(usualNight([], key(22))).toBeUndefined();
  });

  it('offers the most logged activities with their usual length and start', () => {
    const records = [activity(18, 8, 30), activity(19, 8, 40), activity(20, 9, 30), activity(20, 18, 60, { kind: 'run', name: undefined }), activity(22, 8, 30)];
    const picks = frequentActivities(records, key(22));
    expect(picks.map((p) => [p.kind, p.name, p.minutes, p.startMinute, p.count])).toEqual([
      ['cycling', 'Commute', 30, 8 * 60, 3],
      ['run', undefined, 60, 18 * 60, 1],
    ]);
    expect(frequentActivities(records, key(18))).toEqual([]);
  });

  it('takes usual water as the median day of recent plain water', () => {
    const w = (day: number, ml: number): WaterRecord => ({ id: `w${day}${ml}`, schemaVersion: 1, time: at(day, 12), day: key(day), ml });
    expect(usualWater([w(19, 500), w(19, 500), w(20, 1500), w(21, 750), w(22, 3000)], key(22))).toBe(1000);
    expect(usualWater([], key(22))).toBeUndefined();
  });

  it('places a time of day on a day', () => {
    expect(atDayMinute(key(22), 8 * 60 + 15)).toBe(at(22, 8, 15));
  });
});
