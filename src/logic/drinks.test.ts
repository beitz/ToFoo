import { describe, expect, it } from 'vitest';
import { containerDrinkKey, containerMl, isPlainDrink, withContainer, withoutContainer } from './drinks';

const bls = (code: string) => ({ source: 'BLS' as const, version: '4.0', code });

describe('drink containers', () => {
  it('works out part of a container in whole ml', () => {
    expect(containerMl({ ml: 1200 }, 0.5)).toBe(600);
    expect(containerMl({ ml: 750 }, 0.25)).toBe(188);
    expect(containerMl({ ml: 750 }, 2)).toBe(1500);
  });

  it('adds, changes and removes containers, refusing a nameless or oversized one', () => {
    const pot = { id: 'a', name: ' Teekanne ', ml: 1000.4, drink: bls('N630000') };
    const one = withContainer([], pot);
    expect(one).toEqual([{ id: 'a', name: 'Teekanne', ml: 1000, drink: bls('N630000') }]);
    const two = withContainer(one, { id: 'b', name: 'Flasche', ml: 750 });
    expect(two.map((c) => c.name)).toEqual(['Teekanne', 'Flasche']);
    expect(withContainer(two, { id: 'a', name: 'Kanne', ml: 1200 })[0]).toEqual({ id: 'a', name: 'Kanne', ml: 1200 });
    expect(withContainer(two, { id: 'c', name: '  ', ml: 300 })).toEqual(two);
    expect(withContainer(two, { id: 'c', name: 'Tank', ml: 5000 })).toEqual(two);
    expect(withoutContainer(two, 'a')).toEqual({ list: [two[1]], index: 0 });
  });

  it('names what a container holds', () => {
    expect(containerDrinkKey({})).toBe('water');
    expect(containerDrinkKey({ drink: bls('N630000') })).toBe('blackTea');
    expect(containerDrinkKey({ drink: bls('N999999') })).toBe('other');
  });

  it('counts only plain tea and coffee as drinks that keep a fast', () => {
    expect(isPlainDrink(bls('N720100'))).toBe(true);
    expect(isPlainDrink(bls('N670100'))).toBe(true);
    expect(isPlainDrink(bls('N630600'))).toBe(false); // with sugar
    expect(isPlainDrink(bls('N410200'))).toBe(false); // with milk
    expect(isPlainDrink({ source: 'custom', id: 'N630000' })).toBe(false);
  });
});
