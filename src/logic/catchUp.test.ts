import { describe, expect, it } from 'vitest';
import type { ActivityRecord, SleepRecord, WaterRecord } from '../storage/types';
import { asksOn, atDayMinute, frequentActivities, missingOn, usualNight, usualWater, type CatchUpInput } from './catchUp';

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

  it('leaves out trackers that are off or skipped, and asks about one never used yet', () => {
    expect(missingOn({ ...base, on: { sleep: false, activity: true, water: true } })).toEqual(['activity', 'water']);
    expect(missingOn({ ...base, activities: [] })).toEqual(['sleep', 'activity', 'water']);
    // First used only after the day: not asked about.
    expect(missingOn({ ...base, water: [{ day: key(23) }] })).toEqual(['sleep', 'activity']);
    expect(missingOn({ ...base, skipped: new Set(['sleep', 'water'] as const) })).toEqual(['activity']);
  });

  it('asks about each thing only on the weekdays set for it', () => {
    // 2026-10-22 is a Thursday (4).
    expect(asksOn(undefined, 'activity', key(22))).toBe(true);
    expect(asksOn({ activity: [1, 3, 5] }, 'activity', key(22))).toBe(false);
    expect(asksOn({ activity: [4] }, 'activity', key(22))).toBe(true);
    expect(asksOn({ activity: [] }, 'activity', key(22))).toBe(false);
    expect(asksOn({ activity: [] }, 'sleep', key(22))).toBe(true);
    expect(missingOn({ ...base, foodUnknown: true, askDays: { activity: [1, 3, 5], water: [], sleep: [1, 2, 3, 4, 5, 6, 7] } })).toEqual(['food', 'sleep']);
    expect(missingOn({ ...base, askDays: { activity: [4] } })).toEqual(['sleep', 'activity', 'water']);
  });

  it('does not ask about food before the model starts, and a sleep still going does not count', () => {
    expect(missingOn({ ...base, foodUnknown: true, beforeStart: true })).toEqual(['sleep', 'activity', 'water']);
    expect(missingOn({ ...base, sleep: [{ day: key(22) }] })).toEqual(['sleep', 'activity', 'water']);
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

  it('counts the day itself and a shorter window when asked, and keeps Compendium rows apart', () => {
    const records = [
      activity(1, 8, 30),
      activity(20, 8, 30),
      activity(22, 8, 30),
      activity(21, 18, 60, { kind: 'other', name: undefined, compendium: '15610', outside: false }),
      activity(22, 18, 45, { kind: 'other', name: undefined, compendium: '02105', outside: false }),
    ];
    const picks = frequentActivities(records, key(22), 10, { days: 7, withDay: true });
    expect(picks.map((p) => [p.kind, p.compendium, p.count])).toEqual([
      ['cycling', undefined, 2],
      ['other', '02105', 1],
      ['other', '15610', 1],
    ]);
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
