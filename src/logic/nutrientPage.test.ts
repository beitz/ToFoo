import { describe, expect, it } from 'vitest';
import type { DailyTotals } from '../model/simulate';
import { cameFrom, storeAhead, tileTop, timesEaten, uptakeDays, windowDays } from './nutrientPage';

const totals = (intake: number, absorbed: number, missing = false): DailyTotals => ({
  absorbed: {
    low: { FE: absorbed },
    central: { FE: absorbed },
    high: { FE: absorbed },
  },
  intake: { FE: intake },
  supplementIntake: {},
  missing: new Set(missing ? ['FE'] : []),
});

describe('nutrient page numbers', () => {
  it('shows eaten and taken up per day, nothing on days the log does not tell, zero on fasted days', () => {
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];
    const daily = [totals(9, 1), totals(14, 1.5, true), totals(0, 0), totals(3, 0.2)];
    const status = {
      '2026-10-19': 'logged',
      '2026-10-20': 'logged',
      '2026-10-21': 'fasted',
      '2026-10-22': 'unknown',
    } as const;
    expect(uptakeDays(days, daily, status, 'FE', 3)).toEqual([
      {
        day: '2026-10-20',
        eaten: 14,
        takenUp: 1.5,
        fasted: false,
        missing: true,
      },
      { day: '2026-10-21', eaten: 0, takenUp: 0, fasted: true, missing: false },
      { day: '2026-10-22', fasted: false, missing: false },
    ]);
  });

  it('lists the biggest sources over the window or per time eaten, and the rest as one line', () => {
    // Per day over 7 days, shares of all taken up (the model lists at most 8 sources).
    const contributors = [
      { label: 'Dal', amount: 0.4, share: 0.4 },
      { label: 'Bread', amount: 0.2, share: 0.2 },
      { label: 'Oats', amount: 0.15, share: 0.15 },
      { label: 'Chili', amount: 0.1, share: 0.1 },
      { label: 'Egg', amount: 0.05, share: 0.05 },
    ];
    const times = new Map([
      ['Dal', 1],
      ['Bread', 7],
      ['Oats', 5],
      ['Chili', 2],
      ['Egg', 2],
    ]);
    const total = cameFrom(contributors, 7, times, false);
    expect(total.total).toBeCloseTo(7);
    expect(total.lines.map((l) => [l.label, +l.amount.toFixed(2)])).toEqual([
      ['Dal', 2.8],
      ['Bread', 1.4],
      ['Oats', 1.05],
      ['Chili', 0.7],
    ]);
    // The rest also holds what the model did not list: everything not in the four lines.
    expect(total.rest!.share).toBeCloseTo(0.15);
    expect(total.rest!.amount).toBeCloseTo(1.05);
    const each = cameFrom(contributors, 7, times, true);
    expect(each.lines.map((l) => [l.label, +l.amount.toFixed(2), l.times])).toEqual([
      ['Dal', 2.8, 1],
      ['Chili', 0.35, 2],
      ['Oats', 0.21, 5],
      ['Bread', 0.2, 7],
    ]);
    expect(
      cameFrom(
        contributors.slice(0, 2).map((c) => ({ ...c, share: c.share / 0.6 })),
        7,
        times,
        false,
      ).rest,
    ).toBeUndefined();
  });

  it('counts how often each thing was eaten on the window days', () => {
    const days = new Set(['2026-10-21', '2026-10-22']);
    const entries = [
      { label: 'Dal', day: '2026-10-21' },
      { label: 'Dal', day: '2026-10-22' },
      { label: 'Dal', day: '2026-10-01' },
      { label: 'Tea', day: '2026-10-22' },
    ];
    expect([...timesEaten(entries, days)]).toEqual([
      ['Dal', 2],
      ['Tea', 1],
    ]);
  });

  it('draws the store ahead at the recent rate, between empty and full', () => {
    const ahead = storeAhead(
      {
        capacity: 100,
        level: { low: 40, central: 50, high: 60 },
        netPerDay: -10,
      },
      '2026-10-22',
      7,
    );
    expect(ahead.map((p) => p.central)).toEqual([0.4, 0.3, 0.2, 0.1, 0, 0, 0]);
    expect(ahead[0]!.day).toBe('2026-10-23');
    expect(
      storeAhead(
        {
          capacity: 100,
          level: { low: 90, central: 95, high: 99 },
          netPerDay: 3,
        },
        '2026-10-22',
        3,
      ).map((p) => p.central),
    ).toEqual([0.98, 1, 1]);
    expect(storeAhead({ capacity: 100, level: { low: 1, central: 1, high: 1 } }, '2026-10-22', 3)).toEqual([]);
  });

  it('lists the averaging window up to yesterday, with how each day counts', () => {
    const days = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const daily = [totals(1, 1), totals(1, 1, true), totals(0, 0), totals(0, 0), totals(1, 1), totals(5, 5)];
    const status = {
      '2026-10-18': 'logged',
      '2026-10-19': 'logged',
      '2026-10-20': 'unknown',
      '2026-10-21': 'excluded',
      '2026-10-22': 'fasted',
      '2026-10-23': 'pending',
    } as const;
    expect(windowDays(days, daily, status, 'FE', 4, false)).toEqual([
      { day: '2026-10-19', dot: 'known', missing: true },
      { day: '2026-10-20', dot: 'known', missing: false },
      { day: '2026-10-21', dot: 'leftOut', missing: false },
      { day: '2026-10-22', dot: 'known', missing: false },
    ]);
    // With "Fill in unlogged days" on, the unlogged day is an estimate.
    expect(windowDays(days, daily, status, 'FE', 4, true)[1]).toEqual({ day: '2026-10-20', dot: 'estimated', missing: false });
    // A window longer than the model's days starts at the first day.
    expect(windowDays(days, daily, status, 'FE', 14, false)).toHaveLength(5);
  });

  it('grows the tile in steps so the likely range fits, and says when it goes past the last step', () => {
    expect(tileTop(0.6)).toEqual({ top: 1, over: false });
    expect(tileTop(1)).toEqual({ top: 1, over: false });
    expect(tileTop(1.2)).toEqual({ top: 1.5, over: false });
    expect(tileTop(1.87)).toEqual({ top: 2, over: false });
    expect(tileTop(2.5)).toEqual({ top: 3, over: false });
    expect(tileTop(10.9)).toEqual({ top: 3, over: true });
  });
});
