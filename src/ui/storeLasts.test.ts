import { describe, expect, it } from 'vitest';
import type { StoreResult } from '../model/simulate';
import { fmtDurationShort, storeLastsDays } from './Gauge';

const store = (fill: number, fullDays?: number) =>
  ({ fill: { low: fill, central: fill, high: fill }, storeDays: fullDays ? { low: fullDays / 2, central: fullDays, high: fullDays * 2 } : undefined }) as StoreResult;

describe('how long a store lasts', () => {
  it('is the fill level times the days a full store covers', () => {
    expect(storeLastsDays(store(0.5, 210))).toBeCloseTo(105);
    expect(storeLastsDays(store(0, 60))).toBe(0);
    expect(storeLastsDays(store(0.5))).toBeNull();
  });

  it('fits a narrow card', () => {
    expect(fmtDurationShort(9)).toBe('9 d');
    expect(fmtDurationShort(21)).toBe('3 wk');
    expect(fmtDurationShort(105)).toBe('3 mo');
    expect(fmtDurationShort(1250)).toBe('3.4 yr');
  });
});
