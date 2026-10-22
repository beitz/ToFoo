import { describe, expect, it } from 'vitest';
import { liftPoints, nextToCook } from './nextToCook';

const req = (recommended: number, limitOnly = false) => ({ nutrient: '', kind: 'rda', recommended, physiological: recommended, physiologicalDerived: false, limitOnly, confidence: 'high', source: '' }) as never;
const byNutrient = new Map([
  ['FE', req(15)],
  ['FOL', req(300)],
  ['VITC', req(100)],
  ['FASAT', req(20, true)],
]);
const r = (status: string, central = 0.6, kind = 'rolling', limit?: number) => ({ status, kind, value: { low: central, central, high: central }, ...(limit ? { limit } : {}) }) as never;
const nutrients = new Map([
  ['FE', r('low', 0.5)],
  ['FOL', r('gettingLow', 0.8)],
  ['VITC', r('fine', 1.2)],
  ['FASAT', r('fine', 0.9, 'limit', 20)],
]);
const dish = (name: string, intake: Record<string, number>) => ({ name, intake });
const portion = (d: { intake: Record<string, number> }) => ({ intake: d.intake, missing: [] });

describe('liftPoints', () => {
  it('spreads one day over the window', () => {
    expect(liftPoints(0.35, 7)).toBeCloseTo(5);
    expect(liftPoints(0.7, 14)).toBeCloseTo(5);
  });
});

describe('nextToCook', () => {
  it('keeps only dishes that lift a gap by 5 points of the 7-day average', () => {
    const dal = dish('Dal', { FE: 6, FOL: 120 }); // iron 40 % of a day → 5.7 points; folate 40 % → 5.7
    const soup = dish('Soup', { FE: 3, FOL: 60 }); // 20 % of a day → under 3 points
    const res = nextToCook([soup, dal], portion, nutrients, { byNutrient }, 7);
    expect(res.map((o) => o.item.name)).toEqual(['Dal']);
    expect(res[0]!.helps.map((h) => h.id)).toEqual(['FE', 'FOL']);
  });

  it('never shows a dish only because it is the only one', () => {
    expect(nextToCook([dish('Toast', { VITC: 90 })], portion, nutrients, { byNutrient }, 7)).toEqual([]);
  });

  it('leaves out dishes that push a limit over its maximum', () => {
    const fatty = dish('Fatty dal', { FE: 9, FASAT: 30 }); // saturated fat 90 % → +21 points over a 90 % average
    const lean = dish('Lean dal', { FE: 9, FASAT: 0.5 });
    expect(nextToCook([fatty, lean], portion, nutrients, { byNutrient }, 7).map((o) => o.item.name)).toEqual(['Lean dal']);
  });

  it('ranks low gaps above a bit low ones and shows at most three', () => {
    const iron = dish('Iron', { FE: 9 });
    const fol = dish('Folate', { FOL: 180 });
    const both = dish('Both', { FE: 9, FOL: 180 });
    const more = [dish('A', { FE: 6 }), dish('B', { FE: 7 })];
    const res = nextToCook([fol, iron, both, ...more], portion, nutrients, { byNutrient }, 7);
    expect(res).toHaveLength(3);
    expect(res[0]!.item.name).toBe('Both');
    expect(res[1]!.item.name).toBe('Iron');
  });
});
