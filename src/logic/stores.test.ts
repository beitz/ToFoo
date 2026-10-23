import { describe, expect, it } from 'vitest';
import type { StoreResult } from '../model/simulate';
import { storeNeedsAttention } from './stores';

const store = (fill: number, netPerDay: number, status: StoreResult['status']): StoreResult => ({
  fill: { low: fill, central: fill, high: fill },
  status,
  capacity: 100,
  level: { low: fill * 100, central: fill * 100, high: fill * 100 },
  netPerDay,
  slow: true,
  history: [],
});

describe('stores needing attention', () => {
  it('warns only for a low store that is not filling', () => {
    expect(storeNeedsAttention(store(0, -1, 'low'))).toBe(true); // empty and the diet doesn't cover the need
    expect(storeNeedsAttention(store(0.3, -1, 'gettingLow'))).toBe(true);
    expect(storeNeedsAttention(store(0.1, 0.5, 'low'))).toBe(false); // empty start, but filling
    expect(storeNeedsAttention(store(0.6, -1, 'fine'))).toBe(false); // draining, but plenty left
  });

  it('does not warn while the likely range reaches enough', () => {
    expect(storeNeedsAttention({ ...store(0.35, -1, 'gettingLow'), statusSpan: { low: 'gettingLow', high: 'fine' } })).toBe(false);
    expect(storeNeedsAttention({ ...store(0.15, -1, 'low'), statusSpan: { low: 'low', high: 'gettingLow' } })).toBe(true);
  });
});
