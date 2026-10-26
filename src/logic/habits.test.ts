import { describe, expect, it } from 'vitest';
import type { Habit, HabitDay } from '../storage/types';
import { answersByHabit, habitDay, habitRun, habitStart, habitsDaySummary, habitTally, habitWeek, isDue, isoWeekday, openHabitsOn, quickActivity, type HabitActivityLike, type HabitData } from './habits';

const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const made = (day: number) => new Date(2026, 9, day, 9).getTime();

// 2026-10-12, -19 and -26 are Mondays.
const habit = (extra: Partial<Habit> = {}): Habit => ({ id: 'h', schemaVersion: 1, name: 'Floss', colour: 'teal', kind: 'do', goal: { type: 'daily' }, order: 0, createdAt: made(12), ...extra });

function data(answers: Array<[number, boolean]>, today = 26, extra: Partial<HabitData> = {}, id = 'h'): HabitData {
  const days: HabitDay[] = answers.map(([d, did]) => ({ id: `${id}|${key(d)}`, schemaVersion: 1, habitId: id, day: key(d), did }));
  return { today: key(today), answers: answersByHabit(days), activities: [], noActivity: new Set(), ...extra };
}

const act = (day: number, minutes: number, kind: HabitActivityLike['kind'] = 'run', name?: string): HabitActivityLike => ({ day: key(day), kind, minutes, ...(name ? { name } : {}) });

describe('days', () => {
  it('knows weekdays and due days', () => {
    expect(isoWeekday(key(26))).toBe(1);
    expect(isoWeekday(key(25))).toBe(7);
    expect(isDue({ type: 'weekdays', days: [1, 3] }, key(26))).toBe(true);
    expect(isDue({ type: 'weekdays', days: [1, 3] }, key(27))).toBe(false);
    expect(isDue({ type: 'perWeek', times: 2 }, key(27))).toBe(true);
  });

  it('starts on the day it was made, or an earlier day answered', () => {
    expect(habitStart(habit(), data([]))).toBe(key(12));
    expect(habitStart(habit(), data([[8, true]]))).toBe(key(8));
  });

  it('leaves unanswered days open, never "not done"', () => {
    const h = habit();
    const d = data([[20, true], [21, false]]);
    expect(habitDay(h, key(20), d)).toEqual({ mark: 'kept', did: true });
    expect(habitDay(h, key(21), d)).toEqual({ mark: 'missed', did: false });
    expect(habitDay(h, key(22), d).mark).toBe('open');
    expect(habitDay(h, key(10), d).mark).toBe('off');
    expect(habitDay(h, key(27), d).mark).toBe('off');
  });

  it('reads an avoid habit the other way round: had some is not kept', () => {
    const h = habit({ kind: 'avoid', name: 'Alcohol' });
    const d = data([[20, true], [21, false]]);
    expect(habitDay(h, key(20), d).mark).toBe('missed');
    expect(habitDay(h, key(21), d).mark).toBe('kept');
  });

  it('is off on weekdays it is not due unless answered', () => {
    const h = habit({ goal: { type: 'weekdays', days: [1, 3, 5] } });
    const d = data([[21, true]]);
    expect(habitDay(h, key(19), d).mark).toBe('open');
    expect(habitDay(h, key(21), d).mark).toBe('kept');
    expect(habitDay(h, key(20), d).mark).toBe('off');
    expect(habitDay(h, key(20), data([[20, true]])).mark).toBe('kept');
  });
});

describe('minutes habits', () => {
  const h = habit({ kind: 'minutes', name: 'Exercise', minutes: 30, goal: { type: 'perWeek', times: 2 }, activities: [{ kind: 'run' }, { kind: 'other', name: 'Yoga' }] });

  it('adds up the day, only from the activities picked', () => {
    const d = data([], 26, { activities: [act(20, 20), act(20, 15, 'other', 'yoga'), act(21, 60, 'walk'), act(22, 30, 'other', 'Football')] });
    expect(habitDay(h, key(20), d)).toEqual({ mark: 'kept', minutes: 35 });
    // Another activity answers the day: not reached.
    expect(habitDay(h, key(21), d)).toEqual({ mark: 'missed', minutes: 0 });
    expect(habitDay(h, key(22), d)).toEqual({ mark: 'missed', minutes: 0 });
    // Nothing logged: open, until "No activity" on the fill-in page.
    expect(habitDay(h, key(23), d).mark).toBe('open');
    expect(habitDay(h, key(23), { ...d, noActivity: new Set([key(23)]) }).mark).toBe('missed');
  });

  it('counts any activity when none is picked', () => {
    const any = { ...h, activities: [] };
    expect(habitDay(any, key(21), data([], 26, { activities: [act(21, 30, 'walk')] })).mark).toBe('kept');
  });

  it('reaches a week on the second day of 30 minutes', () => {
    const d = data([], 26, { activities: [act(13, 30), act(16, 40), act(20, 30)] });
    expect(habitWeek(h, key(12), d)).toMatchObject({ count: 2, of: 2, outcome: 'reached' });
    // Last week: one session, days left unlogged could have been another.
    expect(habitWeek(h, key(19), d)).toMatchObject({ count: 1, outcome: 'open' });
    expect(habitWeek(h, key(26), d).outcome).toBe('running');
  });
});

describe('weeks', () => {
  it('holds an avoid habit against its maximum', () => {
    const h = habit({ kind: 'avoid', goal: { type: 'perWeek', times: 1 } });
    const all = (had: number[]) => [12, 13, 14, 15, 16, 17, 18].map((d): [number, boolean] => [d, had.includes(d)]);
    expect(habitWeek(h, key(12), data(all([14]))).outcome).toBe('reached');
    expect(habitWeek(h, key(12), data(all([14, 16]))).outcome).toBe('notReached');
    // Had once, and two days unanswered: could have been more.
    expect(habitWeek(h, key(12), data([[14, true], [12, false], [13, false], [15, false], [16, false]])).outcome).toBe('open');
  });

  it('does not count a half first week against a weekly goal', () => {
    const h = habit({ goal: { type: 'perWeek', times: 3 }, createdAt: made(17) });
    expect(habitWeek(h, key(12), data([[17, true]])).outcome).toBe('open');
  });

  it('counts the due days of a daily goal', () => {
    const h = habit();
    const d = data([12, 13, 14, 15, 16, 17, 18].map((x): [number, boolean] => [x, true]));
    expect(habitWeek(h, key(12), d)).toMatchObject({ count: 7, of: 7, outcome: 'reached' });
    expect(habitWeek(h, key(19), d)).toMatchObject({ count: 0, open: 7, outcome: 'open' });
  });
});

describe('runs', () => {
  const daysKept = (from: number, to: number, skip: number[] = []): Array<[number, boolean]> => {
    const out: Array<[number, boolean]> = [];
    for (let d = from; d <= to; d++) if (!skip.includes(d)) out.push([d, true]);
    return out;
  };

  it('counts kept days in a row; today and yesterday open do not break it', () => {
    expect(habitRun(habit(), data(daysKept(12, 24)))).toEqual({ unit: 'days', current: 13, longest: 13 });
  });

  it('forgives one missed or open day in 7', () => {
    expect(habitRun(habit(), data(daysKept(12, 25, [18]))).current).toBe(13);
    expect(habitRun(habit(), data([...daysKept(12, 25, [18]), [18, false]])).current).toBe(13);
  });

  it('breaks on a second miss within 7 days, keeping the longest', () => {
    const r = habitRun(habit(), data(daysKept(12, 25, [18, 20])));
    // 12–17 kept, 18 forgiven, 19 kept: 7; 20 breaks it; 21–25: 5.
    expect(r.current).toBe(5);
    expect(r.longest).toBe(7);
  });

  it('repairs a run when a past day is answered later', () => {
    const before = habitRun(habit(), data(daysKept(12, 25, [15, 18])));
    const after = habitRun(habit(), data(daysKept(12, 25, [18])));
    expect(before.current).toBeLessThan(after.current);
  });

  it('only counts the days a weekday habit is due', () => {
    const h = habit({ goal: { type: 'weekdays', days: [1, 3, 5] } });
    expect(habitRun(h, data([[12, true], [14, true], [16, true], [19, true], [21, true], [23, true]])).current).toBe(6);
  });

  it('counts weeks for a weekly goal', () => {
    const h = habit({ goal: { type: 'perWeek', times: 2 }, createdAt: made(5) });
    const r = habitRun(h, data([[6, true], [8, true], [13, true], [15, true], [20, true], [22, true], [26, true]], 26));
    expect(r).toEqual({ unit: 'weeks', current: 3, longest: 3 });
  });

  it('keeps a run going while a minutes habit is short of its minutes today', () => {
    const h = habit({ kind: 'minutes', minutes: 30, activities: [], createdAt: made(24) });
    const d = data([], 26, { activities: [act(24, 30), act(25, 45), act(26, 10)] });
    expect(habitRun(h, d).current).toBe(2);
  });
});

describe('tally', () => {
  it('counts the days of this month a daily habit was kept, today only once answered', () => {
    const h = habit({ createdAt: made(1) });
    expect(habitTally(h, data([[1, true], [2, false], [3, true]], 3))).toEqual({ unit: 'days', kept: 2, of: 3, open: 0 });
    expect(habitTally(h, data([[1, true]], 3))).toEqual({ unit: 'days', kept: 1, of: 2, open: 1 });
  });

  it('counts reached weeks for a weekly goal, the current week once reached', () => {
    const h = habit({ goal: { type: 'perWeek', times: 1 }, createdAt: made(12) });
    expect(habitTally(h, data([[13, true], [26, true]]))).toEqual({ unit: 'weeks', kept: 2, of: 3, open: 1 });
  });
});

describe('fill-in and calendar', () => {
  const floss = habit();
  const alcohol = habit({ id: 'a', kind: 'avoid', name: 'Alcohol', goal: { type: 'perWeek', times: 2 } });
  const stretch = habit({ id: 's', name: 'Stretch', goal: { type: 'perWeek', times: 3 } });
  const run = habit({ id: 'r', kind: 'minutes', minutes: 30 });
  const old = habit({ id: 'o', archived: true });

  it('asks about open do and avoid habits, not weekly "do" goals, minutes or archived ones', () => {
    expect(openHabitsOn([floss, alcohol, stretch, run, old], key(25), data([])).map((h) => h.id)).toEqual(['h', 'a']);
    expect(openHabitsOn([floss], key(25), data([[25, false]]))).toEqual([]);
  });

  it('sums up a day', () => {
    const d: HabitData = { ...data([]), answers: answersByHabit([{ habitId: 'h', day: key(25), did: true }, { habitId: 'a', day: key(25), did: true }]) };
    expect(habitsDaySummary([floss, alcohol, stretch, run, old], key(25), d)).toEqual({ kept: 1, missed: 1, open: 1 });
  });
});

describe('one tap logs it', () => {
  it('logs the preset ending now, on the day it started, with the sun only when outside', () => {
    const now = new Date(2026, 9, 26, 8, 40).getTime();
    expect(quickActivity({ kind: 'walk', name: ' Commute ', minutes: 30, intensity: 'easy', outside: true, sun: true }, now, 'faceHands')).toEqual({
      kind: 'walk',
      name: 'Commute',
      time: new Date(2026, 9, 26, 8, 10).getTime(),
      day: '2026-10-26',
      minutes: 30,
      intensity: 'easy',
      outside: true,
      sunSkin: 'faceHands',
    });
    const late = quickActivity({ kind: 'run', minutes: 45, intensity: 'hard', outside: false, sun: true }, new Date(2026, 9, 27, 0, 15).getTime(), 'faceHands');
    expect(late).toMatchObject({ day: '2026-10-26', outside: false });
    expect(late).not.toHaveProperty('sunSkin');
    expect(late).not.toHaveProperty('name');
  });
});
