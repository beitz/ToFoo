import { describe, expect, it } from 'vitest';
import { keepAllPreview } from './keepAll';

const r = (status: string, central: number, extra: object = {}) => ({ status, kind: 'rolling', value: { low: central, central, high: central }, ...extra }) as never;
const req = { byNutrient: new Map([['ZN', { recommended: 10 }], ['MG', { recommended: 350 }], ['FE', { recommended: 15 }], ['VITC', { recommended: 110 }]]) } as never;

describe('keepAllPreview', () => {
  it('shows gaps before and after on the window average, biggest move first, with the energy', () => {
    const nutrients = new Map([
      ['ZN', r('low', 0.46)],
      ['MG', r('gettingLow', 0.78)],
      ['VITC', r('fine', 1.2)],
      ['FE', r('low', 0.6, { store: {} })],
    ]);
    const res = keepAllPreview([{ ZN: 3, MG: 70, VITC: 50, FE: 5, ENERCC: 600 }, { ZN: 0.5, ENERCC: 200 }], nutrients, req, 7);
    // Zn: 3.5 mg of 10 = 35 % of a day → 5 points of a 7-day average; Mg: 20 % → 3 points.
    expect(res.moves).toEqual([
      { id: 'ZN', before: 46, after: 51 },
      { id: 'MG', before: 78, after: 81 },
    ]);
    expect(res.kcal).toBe(800);
  });

  it('leaves out moves under a point', () => {
    const res = keepAllPreview([{ ZN: 0.5 }], new Map([['ZN', r('low', 0.4)]]), req, 7);
    expect(res.moves).toEqual([]);
  });
});
