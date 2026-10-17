import { describe, expect, it } from 'vitest';
import { measuredStores } from './lab';

describe('blood tests', () => {
  it('converts the latest ferritin value to an iron store (8 mg per µg/L)', () => {
    const m = measuredStores([
      { id: 'a', marker: 'ferritin', value: 20, day: '2026-09-01' },
      { id: 'b', marker: 'ferritin', value: 50, day: '2026-10-01' },
      { id: 'c', marker: 'unknown', value: 1, day: '2026-10-02' },
    ]);
    expect(Object.keys(m)).toEqual(['FE']);
    expect(m.FE!.day).toBe('2026-10-01');
    expect(m.FE!.amount).toBe(400);
  });
});
