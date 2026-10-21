import { describe, expect, it } from 'vitest';
import { ketosis } from '../../model/parameters';
import { curveAt, estimateKetosis, phaseOf, type KetosisInput } from './ketosis';

const man: KetosisInput = { hours: 0, carbShare: 0.6, exerciseMinutes: 0, sex: 'male', bmi: 23 };

describe('ketosis curve', () => {
  it('passes through the study means', () => {
    expect(curveAt(0)).toBeCloseTo(0.1);
    expect(curveAt(21)).toBeCloseTo(0.5); // Deru 2021: 0.5 mmol/L at 21 h
    expect(curveAt(30)).toBeCloseTo(0.9); // Haymond 1982, men
    expect(curveAt(158)).toBeCloseTo(4.2); // Cahill 1966
  });

  it('interpolates and stays flat beyond the ends', () => {
    expect(curveAt(25.5)).toBeCloseTo(0.7);
    expect(curveAt(-5)).toBeCloseTo(0.1);
    expect(curveAt(5000)).toBeCloseTo(5.9);
  });

  it('never falls with time', () => {
    const pts = ketosis.curve.value;
    for (let i = 1; i < pts.length; i++) expect(pts[i]![1]).toBeGreaterThanOrEqual(pts[i - 1]![1]);
  });
});

describe('estimateKetosis', () => {
  it('a man of normal weight after a usual meal: central on the curve, band from the spread between people in timing and level', () => {
    const e = estimateKetosis({ ...man, hours: 21 });
    expect(e.bhb.central).toBeCloseTo(0.5);
    expect(e.bhb.low).toBeCloseTo(0.1 + (curveAt(21 - 2.95) - 0.1) * (1 - 0.56));
    expect(e.bhb.high).toBeCloseTo(0.1 + (curveAt(21 + 2.95) - 0.1) * (1 + 0.56));
    expect(e.factors).toEqual([]);
  });

  it('low < central < high during a fast', () => {
    for (const hours of [6, 18, 30, 60, 200]) {
      const e = estimateKetosis({ ...man, hours, carbShare: null, sex: undefined, bmi: undefined, exerciseMinutes: 60 });
      expect(e.bhb.low).toBeLessThanOrEqual(e.bhb.central);
      expect(e.bhb.central).toBeLessThanOrEqual(e.bhb.high);
    }
  });

  it('a very-low-carbohydrate last meal moves the curve about 7 h earlier', () => {
    const lc = estimateKetosis({ ...man, hours: 14, carbShare: 0.04 });
    expect(lc.bhb.central).toBeCloseTo(curveAt(21));
    expect(lc.factors).toContainEqual({ kind: 'lowCarb', carbShare: 0.04 });
    // Halfway between the two measured shakes: half the shift.
    const mid = estimateKetosis({ ...man, hours: 14, carbShare: 0.3 });
    expect(mid.bhb.central).toBeCloseTo(curveAt(17.5));
  });

  it('unknown carbohydrate only widens the band upwards', () => {
    const known = estimateKetosis({ ...man, hours: 20 });
    const unknown = estimateKetosis({ ...man, hours: 20, carbShare: null });
    expect(unknown.bhb.central).toBeCloseTo(known.bhb.central);
    expect(unknown.bhb.low).toBeCloseTo(known.bhb.low);
    expect(unknown.bhb.high).toBeGreaterThan(known.bhb.high);
  });

  it('exercise counts from 30 minutes moderate or hard', () => {
    expect(estimateKetosis({ ...man, hours: 18, exerciseMinutes: 20 }).factors).toEqual([]);
    const ex = estimateKetosis({ ...man, hours: 18, exerciseMinutes: 45 });
    expect(ex.bhb.central).toBeCloseTo(curveAt(18 + 3.57));
    // The interval reaches "later" too.
    expect(ex.bhb.low).toBeCloseTo(0.1 + (curveAt(18 - 2.11 - 2.95) - 0.1) * 0.44);
  });

  it('women: the rise above baseline doubles (Haymond 1982: 1.7 vs 0.9 at 30 h)', () => {
    const w = estimateKetosis({ ...man, hours: 30, sex: 'female' });
    expect(w.bhb.central).toBeCloseTo(1.7);
    expect(w.factors).toContainEqual({ kind: 'female' });
  });

  it('obesity halves the rise during the first week, and not after the curve switches to Owen 1969', () => {
    const lean = estimateKetosis({ ...man, hours: 62 });
    const obese = estimateKetosis({ ...man, hours: 62, bmi: 34 });
    expect(obese.bhb.central).toBeCloseTo(0.1 + (lean.bhb.central - 0.1) * 0.52);
    expect(estimateKetosis({ ...man, hours: 300, bmi: 34 }).bhb.central).toBeCloseTo(estimateKetosis({ ...man, hours: 300 }).bhb.central);
    // BMI 27.5: halfway.
    const over = estimateKetosis({ ...man, hours: 62, bmi: 27.5 });
    expect(over.bhb.central).toBeCloseTo(0.1 + (lean.bhb.central - 0.1) * 0.76);
  });

  it('phases follow the central value, with "starting" when only the band reaches 0.5', () => {
    expect(phaseOf({ low: 0.1, central: 0.2, high: 0.4 })).toBe('none');
    expect(phaseOf({ low: 0.2, central: 0.4, high: 0.7 })).toBe('starting');
    expect(phaseOf({ low: 0.3, central: 0.8, high: 1.2 })).toBe('light');
    expect(phaseOf({ low: 1, central: 2, high: 3 })).toBe('moderate');
    expect(phaseOf({ low: 2, central: 3.5, high: 4 })).toBe('deep');
    expect(estimateKetosis({ ...man, hours: 8 }).phase).toBe('none');
    expect(estimateKetosis({ ...man, hours: 18 }).phase).toBe('starting');
    expect(estimateKetosis({ ...man, hours: 31 }).phase).toBe('light');
  });
});
