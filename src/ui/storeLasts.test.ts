import { describe, expect, it } from 'vitest';
import type { StoreResult } from '../model/simulate';
import { storeLastsLine } from './Gauge';

const store = (fill: number, fullDays?: number) =>
  ({ fill: { low: fill, central: fill, high: fill }, storeDays: fullDays ? { low: fullDays / 2, central: fullDays, high: fullDays * 2 } : undefined }) as StoreResult;

describe('store "lasts" line', () => {
  it('says how long the store covers the need now and when full', () => {
    expect(storeLastsLine(store(0.5, 210))).toBe('Lasts 3 months now · 7 months when full');
    expect(storeLastsLine(store(0, 60))).toBe('Lasts under a day now · 2 months when full');
    expect(storeLastsLine(store(0.5))).toBeNull();
  });
});
