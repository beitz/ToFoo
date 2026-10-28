import { describe, expect, it } from 'vitest';
import { SLEEP_FACTS, sleepAgeGroup } from '../../model/sleep';
import { runInsightTool } from '../ai/insights';
import { dayRange } from '../lib/dates';
import type { DailyTotals } from '../model/simulate';
import type { DayStatus, FoodPart, ModelEntry } from '../model/types';
import type { SleepRecord } from '../storage/types';
import { buildInsightData, shareInsightData, type InsightInput, type SleepProfile } from './insights';
import { sleepCheck } from './sleepCheck';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const days = dayRange('2026-10-01', '2026-10-15');

let n = 0;
const sleepPart = (day: number, start: number, end: number): SleepRecord => ({ id: `s${n++}`, schemaVersion: 1, day: key(day), start, end });
const sleep: SleepRecord[] = [];
// Nights ending on the 1st to the 8th: broken up (22:00–06:00 with 30, 45 and 10 min awake), 6 h 35 min asleep.
for (let d = 1; d <= 8; d++)
  sleep.push(sleepPart(d, at(d - 1, 22), at(d, 0)), sleepPart(d, at(d, 0, 30), at(d, 2)), sleepPart(d, at(d, 2, 45), at(d, 4)), sleepPart(d, at(d, 4, 10), at(d, 6)));
// The 9th: one 3-minute gap, too short to count as a wake-up (the panel counts awakenings over 5 min).
sleep.push(sleepPart(9, at(8, 23), at(9, 3)), sleepPart(9, at(9, 3, 3), at(9, 7)));
// The 10th to the 14th: in one piece, 23:00–07:00.
for (let d = 10; d <= 14; d++) sleep.push(sleepPart(d, at(d - 1, 23), at(d, 7)));
// A 70-minute nap on the 3rd.
sleep.push(sleepPart(3, at(3, 13), at(3, 14, 10)));

const part = (o: Partial<FoodPart>): FoodPart => ({ label: 'f', grams: 100, per100: { ALC: 0, WATER: 50 }, preparation: 'asListed', storage: 'fresh', ...o });
const entry = (day: number, h: number, label: string, nameDe: string): ModelEntry => ({
  id: `e${day}${h}`,
  label,
  time: at(day, h),
  dayKey: key(day),
  confidence: 'B',
  isSupplement: false,
  parts: [part({ label, nameEn: label, nameDe })],
});
// Coffee 6 h before the night ending on the 3rd, and 14 h before the one ending on the 6th.
const entries = [entry(2, 16, 'Coffee (beverage)', 'Kaffee (Getränk)'), entry(5, 8, 'Coffee (beverage)', 'Kaffee (Getränk)'), ...days.slice(0, 14).map((_, i) => entry(i + 1, 12, 'Rye bread', 'Roggenbrot'))];
const dayStatus: Record<string, DayStatus | 'pending'> = Object.fromEntries(days.map((d) => [d, 'logged' as DayStatus | 'pending']));
dayStatus[key(10)] = 'unknown';
dayStatus[key(15)] = 'pending';
const daily: DailyTotals[] = days.map(() => ({ absorbed: { low: {}, central: {}, high: {} }, intake: { ENERCC: 2000 }, supplementIntake: {}, missing: new Set<string>() }));

const adult: SleepProfile = { needHours: 7, ownNeed: false, ageGroup: 'adult', ageUnknown: false };
const input: InsightInput = { days, daily, dayStatus, entries, journal: [], sleep, activities: [], water: [], mealWindowMinutes: 60, today: key(15), sleepProfile: adult };
const data = buildInsightData(input);

describe('sleep check', () => {
  const c = sleepCheck(data, key(1), key(15), adult, ['kaffee', 'coffee']);

  it('counts nights against the NSF lines for the age group', () => {
    expect(c.nights).toBe(14);
    // Broken nights: 3 wake-ups is between the lines; 85 min awake is past 41 (not good); 6 h 35 min of 8 h is 82 %.
    expect(c.wakeUps).toEqual({ good: 6, between: 8, poor: 0 });
    expect(c.awake).toEqual({ good: 6, between: 0, poor: 8 });
    expect(c.share).toMatchObject({ good: 6, between: 8, poor: 0 });
    expect(c.length).toMatchObject({ underNeed: 8, tooShort: 0, tooLong: 0 });
    expect(c.length!.mean).toBeCloseTo((8 * (6 + 35 / 60) + 7 + 57 / 60 + 5 * 8) / 14, 5);
  });

  it('has no poor line for time awake from 65, and counts 2 wake-ups as good there', () => {
    const older = sleepCheck(data, key(1), key(15), { ...adult, ageGroup: 'older' });
    expect(older.awake).toEqual({ good: 6, between: 8, poor: 0 });
    expect(older.standsOut.map((s) => s.line)).not.toContain('awake');
  });

  it('marks only what happens on 3 or more nights a week', () => {
    expect(c.standsOut).toEqual([
      { line: 'underNeed', count: 8, of: 14 },
      { line: 'awake', count: 8, of: 14 },
    ]);
    // Under a week of nights, nothing is called frequent.
    expect(sleepCheck(data, key(1), key(6), adult).standsOut).toEqual([]);
  });

  it('times the last caffeine before falling asleep, leaving out nights whose food log is incomplete', () => {
    // Known: nights ending on the 3rd to the 14th, except the 11th and 12th (the 10th is not logged).
    expect(c.caffeine).toEqual({ words: ['kaffee', 'coffee'], known: 10, within: 1, none: 8, medianGapHours: 10 });
    expect(sleepCheck(data, key(1), key(15), adult).caffeine).toBeUndefined();
  });

  it('counts naps and the timing spread', () => {
    expect(c.naps).toEqual({ trackedDays: 15, napDays: 1, longDays: 1, tooLong: 0, many: 0 });
    // 8 nights 22:00–06:00, 6 nights 23:00–07:00.
    expect(c.timing!.bed.median).toBe(22);
    expect(c.timing!.up.median).toBe(6);
    expect(c.timing!.up.sd).toBeCloseTo(Math.sqrt((8 / 14) * (6 / 14)), 5);
  });
});

describe('sleep_check tool', () => {
  it('answers with the lines, their sources and what is worth mentioning', () => {
    const r = runInsightTool('sleep_check', { from: key(1), to: key(15), caffeine_words: ['kaffee'] }, data);
    expect(r.ok).toBe(true);
    expect(r.text).toContain('Lines for adults (26–64)');
    expect(r.text).toContain('Ohayon 2017');
    expect(r.text).toContain('Worth mentioning');
    expect(r.text).toContain('awake long in the night (NSF: not good sleep quality) on 8 of 14');
  });

  it('needs sleep shared', () => {
    const noSleep = shareInsightData(data, key(1), new Set(['food']));
    expect(noSleep.sleepProfile).toBeUndefined();
    expect(shareInsightData(data, key(1), new Set(['sleep'])).sleepProfile).toEqual(adult);
    expect(runInsightTool('sleep_check', { from: key(1), to: key(15), caffeine_words: [] }, noSleep)).toMatchObject({ ok: false });
  });
});

describe('sleep background', () => {
  it('gives every fact a source and a link', () => {
    for (const f of SLEEP_FACTS) {
      expect(f.source, f.topic).toBeTruthy();
      expect(f.url, f.topic).toMatch(/^https:\/\/doi\.org\//);
    }
  });

  it('sorts ages into the NSF groups', () => {
    expect([20, 26, 64, 65].map(sleepAgeGroup)).toEqual(['young', 'adult', 'adult', 'older']);
  });
});
