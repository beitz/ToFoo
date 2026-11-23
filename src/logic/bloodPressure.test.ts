import { describe, expect, it } from 'vitest';
import { homeCategories, homeProtocol, low, veryHigh } from '../../model/blood-pressure';
import type { BloodPressureReading } from '../storage/types';
import { bpAverage, bpByDay, bpCategory, bpInWindow, bpProblem, bpSittings, bpWeek, enteredAtFor, lastVeryHigh, partOfDay, STAMP_NEAR_MS, stampReading } from './bloodPressure';

const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00`).getTime();
const r = (day: string, hour: number, systolic: number, diastolic: number, pulse?: number): BloodPressureReading => ({
  id: `${day}-${hour}-${systolic}`,
  schemaVersion: 1,
  time: at(day, hour),
  day,
  systolic,
  diastolic,
  ...(pulse !== undefined ? { pulse } : {}),
});

describe('blood pressure categories (ESC 2024 home lines)', () => {
  it('takes the lines from model/blood-pressure.ts', () => {
    expect(homeCategories.value).toEqual({ raisedFrom: { systolic: 120, diastolic: 70 }, highFrom: { systolic: 135, diastolic: 85 } });
    expect(veryHigh.value).toEqual({ systolic: 180, diastolic: 110 });
    expect(low.value).toEqual({ systolic: 90, diastolic: 60 });
  });

  it('moves up a step when either number crosses a line', () => {
    expect(bpCategory({ systolic: 115, diastolic: 65 })).toBe('notRaised');
    expect(bpCategory({ systolic: 119, diastolic: 70 })).toBe('raised');
    expect(bpCategory({ systolic: 120, diastolic: 60 })).toBe('raised');
    expect(bpCategory({ systolic: 134, diastolic: 84 })).toBe('raised');
    expect(bpCategory({ systolic: 135, diastolic: 70 })).toBe('high');
    expect(bpCategory({ systolic: 125, diastolic: 85 })).toBe('high');
    expect(bpCategory({ systolic: 179, diastolic: 109 })).toBe('high');
    expect(bpCategory({ systolic: 150, diastolic: 110 })).toBe('veryHigh');
    expect(bpCategory({ systolic: 180, diastolic: 90 })).toBe('veryHigh');
  });

  it('calls it low below 90/60 only when nothing is raised', () => {
    expect(bpCategory({ systolic: 88, diastolic: 58 })).toBe('low');
    expect(bpCategory({ systolic: 105, diastolic: 58 })).toBe('low');
    expect(bpCategory({ systolic: 88, diastolic: 72 })).toBe('raised');
  });
});

describe('checking a typed reading', () => {
  it('needs both numbers, plausible values and the upper above the lower', () => {
    expect(bpProblem({ systolic: 120 })).toBe('empty');
    expect(bpProblem({ systolic: 1280, diastolic: 82 })).toBe('systolic');
    expect(bpProblem({ systolic: 128, diastolic: 8 })).toBe('diastolic');
    expect(bpProblem({ systolic: 128, diastolic: 82, pulse: 640 })).toBe('pulse');
    expect(bpProblem({ systolic: 82, diastolic: 128 })).toBe('order');
    expect(bpProblem({ systolic: 128, diastolic: 82 })).toBeUndefined();
    expect(bpProblem({ systolic: 128, diastolic: 82, pulse: 64 })).toBeUndefined();
  });
});

describe('averages', () => {
  const readings = [r('2026-11-10', 7, 130, 84, 60), r('2026-11-10', 7, 126, 80), r('2026-11-11', 20, 122, 78, 70), r('2026-11-03', 8, 150, 95)];

  it('averages every reading, the pulse only where noted, and counts the days', () => {
    expect(bpAverage(readings.slice(0, 3))).toEqual({ systolic: 126, diastolic: 81, pulse: 65, readings: 3, days: 2 });
    expect(bpAverage([])).toBeUndefined();
    expect(bpAverage([r('2026-11-10', 7, 130, 84)])).not.toHaveProperty('pulse');
  });

  it('uses the protocol window of 7 days ending today, and says when it covers too few days', () => {
    expect(homeProtocol.value.days).toBe(7);
    expect(bpInWindow(readings, '2026-11-12').map((x) => x.day)).toEqual(['2026-11-10', '2026-11-10', '2026-11-11']);
    const week = bpWeek(readings, '2026-11-12');
    expect(week.average?.systolic).toBe(126);
    expect(week.enough).toBe(false);
    const more = [...readings, r('2026-11-12', 7, 124, 79)];
    expect(bpWeek(more, '2026-11-12').enough).toBe(true);
    expect(bpWeek([], '2026-11-12')).toEqual({ average: undefined, enough: false });
  });

  it('splits morning and evening at noon, and averages per day', () => {
    expect(partOfDay(at('2026-11-10', 7))).toBe('morning');
    expect(partOfDay(at('2026-11-10', 12))).toBe('evening');
    expect([...bpByDay(readings).keys()]).toEqual(['2026-11-10', '2026-11-11', '2026-11-03']);
    expect(bpByDay(readings).get('2026-11-10')).toMatchObject({ systolic: 128, diastolic: 82, readings: 2 });
  });

  it('flags only a newest reading that is very high', () => {
    expect(lastVeryHigh(readings)).toBeUndefined();
    const high = r('2026-11-12', 8, 186, 112);
    expect(lastVeryHigh([...readings, high])).toBe(high);
    expect(lastVeryHigh([high, r('2026-11-12', 9, 140, 88)])).toBeUndefined();
  });
});

// Owner's ask 2026-11-23: each reading of a sitting gets the time its numbers were filled in.
describe('a time per reading', () => {
  it('stamps when systolic and diastolic first both have a value, and again once the pulse has one', () => {
    let r = stampReading({ systolic: 128 }, 1000);
    expect(r).toEqual({ systolic: 128 });
    r = stampReading({ ...r, diastolic: 82 }, 2000);
    expect(r).toEqual({ systolic: 128, diastolic: 82, pairAt: 2000 });
    r = stampReading({ ...r, pulse: 64 }, 3000);
    expect(r).toEqual({ systolic: 128, diastolic: 82, pulse: 64, pairAt: 2000, allAt: 3000 });
  });

  it('keeps the first stamp when a typo is fixed, and starts over when the row is emptied', () => {
    const full = { systolic: 128, diastolic: 82, pulse: 64, pairAt: 2000, allAt: 3000 };
    expect(stampReading({ ...full, systolic: 126 }, 9000)).toEqual({ ...full, systolic: 126 });
    expect(stampReading({ ...full, pulse: undefined }, 9000).allAt).toBe(3000);
    const empty = stampReading({ pairAt: 2000, allAt: 3000 }, 9000);
    expect(empty).toEqual({});
    expect(stampReading({ ...empty, systolic: 120, diastolic: 80, pulse: 60 }, 9500)).toMatchObject({ pairAt: 9500, allAt: 9500 });
  });

  it('saves the pulse stamp, else the pair stamp, only when typed in at the sitting', () => {
    const sitting = 1_000_000_000;
    expect(enteredAtFor({ pairAt: sitting + 10_000, allAt: sitting + 15_000 }, sitting)).toBe(sitting + 15_000);
    expect(enteredAtFor({ pairAt: sitting + 10_000 }, sitting)).toBe(sitting + 10_000);
    expect(enteredAtFor({}, sitting)).toBeUndefined();
    // Logged the next day from the diary or catch-up: the typing time says nothing about the order.
    expect(enteredAtFor({ allAt: sitting + STAMP_NEAR_MS + 1 }, sitting)).toBeUndefined();
    expect(enteredAtFor({ allAt: sitting - STAMP_NEAR_MS }, sitting)).toBe(sitting - STAMP_NEAR_MS);
  });

  it('groups readings by sitting, each in the order its numbers were filled in', () => {
    const at = (time: number, enteredAt?: number) => ({ time, ...(enteredAt !== undefined ? { enteredAt } : {}) });
    const groups = bpSittings([at(500, 620), at(100), at(500, 560), at(500, 680)]);
    expect(groups).toEqual([[at(100)], [at(500, 560), at(500, 620), at(500, 680)]]);
  });

  it('takes the last reading of the newest sitting as the newest', () => {
    const r = (systolic: number, enteredAt: number): BloodPressureReading => ({ id: String(systolic), schemaVersion: 1, time: 500, day: '2026-11-23', systolic, diastolic: 80, enteredAt });
    expect(lastVeryHigh([r(190, 600), r(130, 700)])).toBeUndefined();
    expect(lastVeryHigh([r(130, 600), r(190, 700)])?.systolic).toBe(190);
  });
});
