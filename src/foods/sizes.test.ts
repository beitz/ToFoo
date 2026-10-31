import { describe, expect, it } from 'vitest';
import { foodSizes } from './sizes';

describe('foodSizes', () => {
  it('offers a ready meal’s pack (owner’s YouCook Butter Chicken, 420 g)', () => {
    expect(foodSizes({ product: { name: 'YouCook Butter Chicken', quantity: '420 g' } })).toEqual([{ kind: 'pack', grams: 420 }]);
  });

  it('puts pack, label serving, last logged, saved sizes and one piece in that order', () => {
    const sizes = foodFoo();
    expect(foodSizes({ product: { quantity: '200 g (8 Riegel x 25 g)', serving: { label: '2 Riegel (50 g)', grams: 50 } }, sizes, logged: 75 }, 10)).toEqual([
      { kind: 'pack', grams: 200 },
      { kind: 'serving', grams: 50 },
      { kind: 'logged', grams: 75 },
      { kind: 'saved', grams: 150, label: 'bowl' },
      { kind: 'piece', grams: 25 },
    ]);
  });

  it('keeps to three by default', () => {
    expect(foodSizes({ product: { quantity: '200 g (8 Riegel x 25 g)', serving: { label: '2 Riegel (50 g)', grams: 50 } }, sizes: foodFoo(), logged: 75 })).toHaveLength(3);
  });

  it('leaves out amounts the same as 100 g, an earlier one or one the view already shows', () => {
    expect(foodSizes({ product: { quantity: '100 g' } })).toEqual([]);
    expect(foodSizes({ product: { quantity: '420 g' }, logged: 420 })).toEqual([{ kind: 'pack', grams: 420 }]);
    expect(foodSizes({ product: { quantity: '420 g' }, taken: [420] })).toEqual([]);
  });

  it('reads multipacks as one piece, not as a pack weight', () => {
    expect(foodSizes({ product: { quantity: '6 x 0,5 l' } })).toEqual([{ kind: 'piece', grams: 500 }]);
  });

  it('works for a BLS food from saved sizes and the last logged amount alone', () => {
    expect(foodSizes({ sizes: [{ label: 'piece', grams: 180, piece: true }], logged: 360 })).toEqual([
      { kind: 'logged', grams: 360 },
      { kind: 'piece', grams: 180 },
    ]);
    expect(foodSizes({})).toEqual([]);
  });
});

function foodFoo() {
  return [
    { label: 'bowl', grams: 150 },
    { label: 'piece', grams: 25, piece: true as const },
  ];
}
