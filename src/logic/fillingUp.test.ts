import { describe, expect, it } from 'vitest';
import { statusThresholds } from '../../model/parameters';
import type { FoodPart } from '../model/types';
import { daysToFine, omega3Rows, portionAbsorbed } from './fillingUp';

const fine = statusThresholds.tank.value.gettingLow;

describe('filling up', () => {
  it('counts the days until a store is back to fine, with extra on top of the recent rate', () => {
    const store = { capacity: 1000, level: { low: 0, central: fine * 1000 - 60, high: 0 }, netPerDay: 1 };
    expect(daysToFine(store)).toBe(60);
    expect(daysToFine(store, 2)).toBe(20);
    expect(daysToFine({ ...store, netPerDay: -1 })).toBeNull();
    expect(daysToFine({ ...store, netPerDay: -1 }, 3)).toBe(30);
    expect(daysToFine({ ...store, level: { low: 0, central: 900, high: 0 } })).toBeUndefined();
  });

  it('takes up a portion through the model’s rules: B12 is capped per meal, a fixed share is not', () => {
    const part = (per100: FoodPart['per100']): FoodPart => ({ label: 'Liver', grams: 100, per100, preparation: 'asListed', storage: 'fresh' });
    const opts = { retention: false, absorption: true, typicalFraction: () => 0.5 };
    const b12 = portionAbsorbed(part({ VITB12: 50 }), 'VITB12', opts);
    expect(b12).toBeLessThan(50 * 0.5);
    expect(b12).toBeGreaterThan(1);
    expect(portionAbsorbed(part({ FOL: 200 }), 'FOL', opts)).toBeCloseTo(100);
    expect(portionAbsorbed(part({ FOL: 200 }), 'FOL', { ...opts, absorption: false })).toBeCloseTo(100);
  });

  it('turns the omega-3 dose study into portions a week of a food', () => {
    const rows = omega3Rows(3.5);
    expect(rows.map((r) => r.dose)).toEqual([0.3, 0.6, 0.9, 1.8]);
    expect(rows[3]!.index).toBeGreaterThan(8);
    expect(rows[0]!.perWeek).toBeCloseTo(0.6);
    expect(omega3Rows()[0]!.perWeek).toBeUndefined();
  });
});
