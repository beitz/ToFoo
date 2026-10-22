import { describe, expect, it } from 'vitest';
import type { SleepRecord } from '../storage/types';
import { BED_PIVOT, lastMealBefore, nightsWindow, nightTimes, sleepDebt, spreadOf, weeklySleep } from './nights';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
let n = 0;
const sleep = (startDay: number, sh: number, sm: number, endDay: number, eh: number, em: number): SleepRecord => ({
  id: `s${n++}`,
  schemaVersion: 1,
  start: at(startDay, sh, sm),
  end: at(endDay, eh, em),
  day: `2026-10-${String(endDay).padStart(2, '0')}`,
});
const NEED = 7 * 60;

describe('nights', () => {
  // 19 → 20: 7 h 30; 20 → 21: two parts (woke up in the night), 6 h in all; 21 → 22 not logged.
  const records = [sleep(19, 23, 0, 20, 6, 30), sleep(20, 23, 30, 21, 2, 0), sleep(21, 2, 30, 21, 6, 0), sleep(21, 14, 0, 21, 14, 40)];

  it('lists the nights by the morning after, unlogged ones as unknown, naps left out', () => {
    const nights = nightsWindow(records, '2026-10-22', 3, NEED);
    // Today's night is not logged yet: the window ends yesterday.
    expect(nights.map((x) => x.day)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(nights[0]!.asleep).toBeUndefined();
    expect(nights[1]!.asleep).toBe(450);
    expect(nights[2]!.asleep).toBe(360);
    expect(nights[2]!.diff).toBe(-60);
    // Once this morning is logged, the window ends today.
    const withToday = nightsWindow([...records, sleep(21, 23, 0, 22, 7, 0)], '2026-10-22', 3, NEED);
    expect(withToday.at(-1)!.day).toBe('2026-10-22');
  });

  it('adds up the debt over logged nights only', () => {
    const debt = sleepDebt(nightsWindow(records, '2026-10-22', 3, NEED));
    expect(debt.balance).toBe(30 - 60);
    expect(debt.running).toEqual([0, 30, -30]);
    expect(debt.logged).toBe(2);
    expect(debt.average).toBe(405);
    expect(sleepDebt(nightsWindow([], '2026-10-22', 3, NEED)).average).toBeUndefined();
  });

  it('keeps bed times around midnight together', () => {
    const s = spreadOf([23 * 60 + 30, 30, 0, 23 * 60], BED_PIVOT)!;
    // From noon: 23:00, 23:30, 00:00, 00:30; the middle is 23:45, not midday.
    expect(s.median).toBe(23 * 60 + 45);
    expect(s.min).toBe(23 * 60);
    expect(s.max).toBe(30);
    expect(s.plusMinus).toBe(23);
    expect(spreadOf([], BED_PIVOT)).toBeUndefined();
    const times = nightTimes(nightsWindow(records, '2026-10-22', 3, NEED));
    expect(times.bed?.median).toBe(23 * 60 + 15);
    expect(times.wake?.median).toBe(6 * 60 + 15);
  });

  it('averages each week over its logged nights', () => {
    const weeks = weeklySleep(records, '2026-10-22', 2);
    expect(weeks.map((w) => w.monday)).toEqual(['2026-10-12', '2026-10-19']);
    expect(weeks[0]!.average).toBeUndefined();
    expect(weeks[1]).toEqual({ monday: '2026-10-19', nights: 2, average: 405 });
  });

  it('finds the last meal in the 12 hours before sleep', () => {
    expect(lastMealBefore([at(20, 12), at(20, 19, 30), at(21, 8)], at(20, 23))).toBe(at(20, 19, 30));
    expect(lastMealBefore([at(19, 19)], at(20, 23))).toBeUndefined();
  });
});
