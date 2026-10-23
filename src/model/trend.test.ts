import { describe, expect, it } from 'vitest';
import { storeTrendOf, trendOf } from './trend';
import { isUnsure, type GaugeKind, type HistoryPoint } from './simulate';

const hist = (values: number[]): HistoryPoint[] => values.map((v, i) => ({ day: `2026-01-${String(i + 1).padStart(2, '0')}`, low: v, central: v, high: v }));
const line = (from: number, perDay: number, n = 8) => hist(Array.from({ length: n }, (_, i) => from + perDay * i));
const trend = (kind: GaugeKind, values: HistoryPoint[], ulRatio?: number) =>
  trendOf({ kind, history: values, ulRatio, value: { low: 0, central: values[values.length - 1]!.central, high: 0 } });

describe('trendOf', () => {
  it('shows an arrow from the second day on, and needs a status', () => {
    expect(trend('rolling', line(0.5, 0.05, 1))).toBeNull();
    expect(trend('rolling', line(0.5, 0.05, 2))).toMatchObject({ direction: 'up' });
    expect(trend('info', line(0.5, 0.05))).toBeNull();
  });

  it('calls small changes steady', () => {
    expect(trend('rolling', line(0.8, 0.001))).toMatchObject({ direction: 'steady', speed: 0 });
  });

  it('counts arrows by how soon the next status line is reached', () => {
    // Rolling lines at 0.7 and 0.9. Now 0.5 + 7·0.02 = 0.64: 0.06 to go at 0.02/day = 3 days.
    expect(trend('rolling', line(0.5, 0.02))).toMatchObject({ direction: 'up', speed: 3, better: true });
    // Now 0.5 + 7·0.004 = 0.528: (0.7 − 0.528) / 0.004 = 43 days.
    expect(trend('rolling', line(0.5, 0.004))).toMatchObject({ direction: 'up', speed: 1 });
    // Now 1.2 − 7·0.03 = 0.99, falling: (0.99 − 0.9) / 0.03 = 3 days.
    expect(trend('rolling', line(1.2, -0.03))).toMatchObject({ direction: 'down', speed: 3, better: false });
  });

  it('flags nothing when moving further into the best zone', () => {
    expect(trend('rolling', line(1.2, 0.02))).toMatchObject({ direction: 'up', speed: 1, better: undefined });
    expect(trend('limit', line(0.5, -0.02))).toMatchObject({ direction: 'down', speed: 1, better: undefined });
  });

  it('treats down as better for upper limits', () => {
    expect(trend('limit', line(1.3, -0.03))).toMatchObject({ direction: 'down', better: true });
    expect(trend('limit', line(1.3, 0.03))).toMatchObject({ direction: 'up', better: false });
  });

  it('flags a fall from above an upper limit as better', () => {
    // 3 × need, 1.5 × the upper limit: the limit line sits at 2 × need.
    expect(trend('rolling', line(3.3, -0.05), 1.5)).toMatchObject({ direction: 'down', better: true });
    expect(trend('rolling', line(1.2, 0.05), 0.9)).toMatchObject({ direction: 'up', better: false });
  });

  it('flags a fall within "low" as worse', () => {
    expect(trend('rolling', line(0.5, -0.02))).toMatchObject({ direction: 'down', speed: 1, better: false });
  });

  it('uses the last week only', () => {
    // Fell for weeks, then rose this week.
    const values = [...Array.from({ length: 20 }, (_, i) => 1 - i * 0.02), ...Array.from({ length: 7 }, (_, i) => 0.62 + (i + 1) * 0.02)];
    expect(trend('rolling', hist(values))!.direction).toBe('up');
  });
});

describe('storeTrendOf', () => {
  const store = (fill: number, netPerDay: number | undefined, capacity = 100) => storeTrendOf({ fill: { low: fill, central: fill, high: fill }, netPerDay, capacity });

  it('fills or drains by the net flow, however slowly', () => {
    // Tank lines at 0.2 and 0.4. At 0.1 gaining 0.01 of capacity a day: 10 days to "getting low" → two arrows.
    expect(store(0.1, 1)).toMatchObject({ direction: 'up', speed: 2, better: true });
    expect(store(0.1, 1)!.daysToNext).toBeCloseTo(10);
    // A big store gaining a little: still filling, one arrow.
    expect(store(0.1, 0.01)).toMatchObject({ direction: 'up', speed: 1 });
    // 0.45 losing 0.01 a day: 5 days to the "getting low" line.
    expect(store(0.45, -1)).toMatchObject({ direction: 'down', speed: 3, better: false });
  });

  it('holds when nothing flows or the store is already empty or full', () => {
    expect(store(0.5, 0)).toMatchObject({ direction: 'steady' });
    expect(store(0, -1)).toMatchObject({ direction: 'steady', better: false }); // stays empty
    expect(store(1, 1)).toMatchObject({ direction: 'steady' });
    expect(store(0.5, undefined)).toBeNull();
  });
});

describe('unsure directions (accuracy review proposal 1)', () => {
  it('shows no direction for a line when the low and high runs move opposite ways', () => {
    const h = line(0.8, 0.02).map((p, i) => ({ ...p, low: p.central - 0.1 - 0.03 * i, high: p.central + 0.1 + 0.03 * i }));
    expect(trend('rolling', h)).toMatchObject({ direction: 'steady', speed: 0, unsure: true });
    // All runs rising: an arrow as usual.
    expect(trend('rolling', line(0.5, 0.02))).not.toHaveProperty('unsure');
  });

  it('calls a store about even when one run fills and another drains', () => {
    const st = { fill: { low: 0.5, central: 0.5, high: 0.5 }, capacity: 100 };
    expect(storeTrendOf({ ...st, netPerDay: 0.1, netRange: { low: -0.1, central: 0.1, high: 0.3 } })).toMatchObject({ direction: 'steady', unsure: true });
    expect(storeTrendOf({ ...st, netPerDay: 0.2, netRange: { low: 0.1, central: 0.2, high: 0.3 } })).toMatchObject({ direction: 'up' });
  });
});

describe('isUnsure', () => {
  it('is unsure only when the range reaches both sides of the need or the limit', () => {
    expect(isUnsure({ low: 'low', high: 'fine' })).toBe(true);
    expect(isUnsure({ low: 'gettingLow', high: 'fine' })).toBe(true);
    expect(isUnsure({ low: 'fine', high: 'tooHigh' })).toBe(true);
    expect(isUnsure({ low: 'low', high: 'gettingLow' })).toBe(false); // below the need either way
    expect(isUnsure({ low: 'fine', high: 'fine' })).toBe(false);
    expect(isUnsure(undefined)).toBe(false);
  });
});
