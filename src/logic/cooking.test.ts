import { describe, expect, it } from 'vitest';
import { boxesOf, nextBox, planOf, resizeBoxes, startPot, takenFromHome, withPot } from './cooking';

describe('boxes', () => {
  it('turn a plan into boxes and back', () => {
    const boxes = boxesOf({ fresh: 1, fridge: 1, freezer: 4 });
    expect(boxes).toEqual(['now', 'fridge', 'freezer', 'freezer', 'freezer', 'freezer']);
    expect(planOf(boxes)).toEqual({ fresh: 1, fridge: 1, freezer: 4 });
  });
  it('cycle eat now → fridge → freezer on a tap', () => {
    expect(nextBox('now')).toBe('fridge');
    expect(nextBox('fridge')).toBe('freezer');
    expect(nextBox('freezer')).toBe('now');
  });
  it('add new portions to the freezer and drop from the end', () => {
    expect(resizeBoxes(['now', 'fridge'], 4)).toEqual(['now', 'fridge', 'freezer', 'freezer']);
    expect(resizeBoxes(['now', 'fridge', 'freezer'], 2)).toEqual(['now', 'fridge']);
  });
});

describe('pots', () => {
  const red = { id: 'p1', name: 'Big red pot', grams: 1220 };
  it('start with the recipe’s pot, else one of the weight last used, else the weight alone', () => {
    expect(startPot({ potId: 'p1', potGrams: 900 }, { pots: [red] })).toEqual({ pot: red, grams: 1220 });
    expect(startPot({ potGrams: 1220 }, { pots: [red] })).toEqual({ pot: red, grams: 1220 });
    expect(startPot({}, { potGrams: 800, pots: [red] })).toEqual({ grams: 800 });
    expect(startPot({}, {})).toEqual({});
  });
  it('add or change a pot by id, ignoring one without a name or weight', () => {
    expect(withPot([red], { id: 'p2', name: ' Small ', grams: 640.4 })).toEqual([red, { id: 'p2', name: 'Small', grams: 640 }]);
    expect(withPot([red], { ...red, grams: 1250 })).toEqual([{ ...red, grams: 1250 }]);
    expect(withPot([red], { id: 'p3', name: '', grams: 500 })).toEqual([red]);
  });
});

describe('takenFromHome', () => {
  const ref = (code: string) => ({ source: 'BLS' as const, version: '4.0', code });
  const item = (code: string, grams: number) => ({ id: code, name: code, place: 'cupboard' as const, ref: ref(code), grams, since: 0, addedAt: 0, schemaVersion: 1 });
  it('lists what the pot takes from home and what is left after', () => {
    const lentils = { ref: ref('H730000'), name: 'Lentils', grams: 400, preparation: 'boiled' as const };
    const kale = { ref: ref('G322100'), name: 'Kale', grams: 450, preparation: 'boiled' as const };
    const rows = takenFromHome([lentils, kale], [item('H730000', 600), item('G322100', 450)], [], [], 10);
    expect(rows.map((r) => [r.ingredient.name, r.after.grams, r.after.out])).toEqual([
      ['Lentils', 200, false],
      ['Kale', 0, true],
    ]);
  });
  it('leaves out what is not at home or used up already', () => {
    const rice = { ref: ref('C359000'), name: 'Rice', grams: 100, preparation: 'boiled' as const };
    expect(takenFromHome([rice], [{ ...item('C359000', 500), status: 'out' as const }], [], [], 10)).toEqual([]);
  });
});
