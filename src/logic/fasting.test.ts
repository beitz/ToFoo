import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '../model/types';
import type { ActivityRecord, CustomFood, Fast, KetoneReading, LogEntry } from '../storage/types';
import { bloodReadingsInFasts, bodyMassIndex, carbShare, exerciseMinutesSince, fastClock, ketosisInput, personalTiming } from './fasting';

const H = 3_600_000;
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime();

function food(id: string, day: string, hour: number): LogEntry {
  return { id, schemaVersion: 1, kind: 'food', time: at(day, hour), day, confidence: 'A', label: '', ref: { source: 'BLS', version: '4.0', code: 'X' }, grams: 100, preparation: 'asListed' };
}
function drink(id: string, day: string, hour: number): LogEntry {
  return { id, schemaVersion: 1, kind: 'drink', drink: 'tea', time: at(day, hour), day, confidence: 'A', label: '' };
}
const fast: Fast = { id: 'f', schemaVersion: 1, startDay: '2026-10-21' };
const none = new Map<string, CustomFood>();

function entry(id: string, per100: Record<string, number | null>): ModelEntry {
  return {
    id,
    label: id,
    time: 0,
    dayKey: '2026-10-20',
    confidence: 'A',
    isSupplement: false,
    parts: [{ label: id, grams: 100, per100, preparation: 'asListed', storage: 'fresh' }],
  };
}

describe('fastClock', () => {
  it('counts from the last meal before the fast, with what was eaten in the meal window before it', () => {
    const log = [food('a', '2026-10-20', 12), food('b', '2026-10-20', 18), food('c', '2026-10-20', 19), drink('t', '2026-10-20', 22)];
    const c = fastClock(fast, log, none, 90);
    expect(c).toEqual({ since: at('2026-10-20', 19), fromMeal: true, mealIds: ['b', 'c'] });
  });

  it('falls back to the start of the first fasted day when the last meal is long ago', () => {
    const c = fastClock(fast, [food('a', '2026-10-18', 19)], none, 90);
    expect(c.fromMeal).toBe(false);
    expect(c.since).toBe(new Date('2026-10-21T00:00:00').getTime());
    expect(c.mealIds).toEqual([]);
  });
});

describe('carbShare', () => {
  it('is the share of energy from carbohydrate at 4 kcal/g', () => {
    expect(carbShare([entry('m', { ENERCC: 400, CHO: 50 })])).toBeCloseTo(0.5);
    expect(carbShare([entry('m', { ENERCC: 400, CHO: 0 }), entry('n', { ENERCC: 400, CHO: 20 })])).toBeCloseTo(0.1);
  });

  it('is unknown when a food has no carbohydrate or energy value', () => {
    expect(carbShare([entry('m', { ENERCC: 400, CHO: null })])).toBeNull();
    expect(carbShare([entry('m', { ENERCC: 0, CHO: 0 })])).toBeNull();
  });
});

describe('exerciseMinutesSince', () => {
  const act = (time: number, minutes: number, intensity?: ActivityRecord['intensity']): ActivityRecord => ({
    id: String(time),
    schemaVersion: 1,
    kind: 'walk',
    time,
    day: '2026-10-21',
    minutes,
    intensity,
    outside: false,
  });
  it('adds moderate and hard minutes after the last meal only', () => {
    const since = at('2026-10-20', 19);
    const acts = [act(since - H, 60, 'hard'), act(since + H, 20, 'easy'), act(since + 2 * H, 30, 'moderate'), act(since + 3 * H, 15, 'hard'), act(since + 5 * H, 40)];
    expect(exerciseMinutesSince(acts, since, since + 10 * H)).toBe(45);
  });
});

describe('ketosisInput', () => {
  it('puts hours, the meal, activity and profile together', () => {
    const clock = { since: at('2026-10-20', 19), fromMeal: true, mealIds: ['m'] };
    const input = ketosisInput({
      clock,
      now: clock.since + 30 * H,
      entries: new Map([['m', entry('m', { ENERCC: 800, CHO: 20 })]]),
      activities: [],
      profile: { sex: 'male', heightCm: 180 },
      weightKg: 81,
    });
    expect(input).toEqual({ hours: 30, carbShare: 0.1, exerciseMinutes: 0, sex: 'male', bmi: 25 });
  });

  it('has no BMI without a weight or height', () => {
    expect(bodyMassIndex(undefined, 180)).toBeUndefined();
    expect(bodyMassIndex(70, undefined)).toBeUndefined();
  });
});

describe('blood readings during fasts', () => {
  const k = (id: string, day: string, hour: number, type: KetoneReading['type'], value: number): KetoneReading => ({ id, schemaVersion: 1, time: at(day, hour), day, type, value });
  const log = [food('dinner', '2026-10-20', 19), food('next', '2026-10-23', 8)];
  const ctx = {
    fasts: [fast],
    log,
    customFoods: none,
    mealWindowMinutes: 90,
    entries: new Map<string, ModelEntry>(),
    activities: [],
    profile: { sex: 'male' as const, heightCm: 180 },
    weightKg: 75,
  };

  it('keeps blood readings from the meal before the fast until the next food, with the hours since that meal', () => {
    const readings = [
      k('b1', '2026-10-21', 15, 'blood', 0.6),
      k('br', '2026-10-21', 16, 'breath', 10),
      k('b2', '2026-10-22', 19, 'blood', 1.8),
      k('after', '2026-10-23', 12, 'blood', 0.2), // the fast ended with breakfast that day
      k('before', '2026-10-20', 12, 'blood', 0.1),
      k('evening', '2026-10-20', 23, 'blood', 0.2), // after the meal, before the first fasted day
    ];
    const got = bloodReadingsInFasts(readings, ctx);
    expect(got.map((g) => [g.reading.id, Math.round(g.input.hours)])).toEqual([
      ['evening', 4],
      ['b1', 20],
      ['b2', 48],
    ]);
  });

  it('learns a personal timing once there are three usable readings', () => {
    const two = [k('b1', '2026-10-21', 19, 'blood', 0.9), k('b2', '2026-10-22', 1, 'blood', 1.6)];
    expect(personalTiming(two, ctx)).toBeNull();
    // 0.9 at 24 h, 1.6 at 30 h, 0.5 at 21 h: 6, 8 and 0 h earlier; the median is 6.
    const three = [...two, k('b3', '2026-10-21', 16, 'blood', 0.5)];
    const p = personalTiming(three, ctx);
    expect(p?.readings).toBe(3);
    expect(p?.hours).toBeCloseTo(6, 1);
  });
});
