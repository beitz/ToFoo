import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '../model/types';
import type { ActivityRecord, CustomFood, Fast, LogEntry } from '../storage/types';
import { bodyMassIndex, carbShare, exerciseMinutesSince, fastClock, ketosisInput } from './fasting';

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
