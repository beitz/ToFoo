import { describe, expect, it } from 'vitest';
import { homeKindOf } from './homeKind';

const food = (code: string, nameEn = 'x') => ({ code, nameEn });

describe('homeKindOf', () => {
  it('sorts things at home by kind', () => {
    expect(homeKindOf({ pot: true })).toBe('cooked');
    expect(homeKindOf({ place: 'spices', food: food('G250400', 'Parsley dried') })).toBe('spice');
    expect(homeKindOf({ place: 'cupboard', food: food('R258100', 'Black pepper') })).toBe('spice');
    expect(homeKindOf({ place: 'freezer', food: food('X912233', 'Pizza quattro formaggi') })).toBe('ready');
    expect(homeKindOf({ place: 'fridge', food: food('M111200', 'Milk low-fat, fresh, 1.5 % fat') })).toBe('drink');
    expect(homeKindOf({ place: 'cupboard', food: food('N410100', 'Coffee (infusion)') })).toBe('drink');
    expect(homeKindOf({ place: 'cupboard', food: food('S570000', 'Dark chocolate') })).toBe('snack');
    expect(homeKindOf({ place: 'cupboard', food: food('C133000', 'Oat flakes') })).toBe('ingredient');
    expect(homeKindOf({ place: 'fridge', food: food('M402600', 'Gouda cheese') })).toBe('ingredient');
  });

  it("goes by a product's categories", () => {
    const meal = { name: 'Butter Chicken', categories: ['Meals', 'Meals with chicken'] };
    expect(homeKindOf({ place: 'fridge', product: meal, food: food('V416100', 'Chicken breast fillet, raw') })).toBe('ready');
    const beer = { name: 'Helles', categories: ['Beverages', 'Alcoholic beverages', 'Beers'] };
    expect(homeKindOf({ place: 'cupboard', product: beer })).toBe('drink');
    // A milk powder is no drink, whatever its BLS food.
    const powder = { name: 'Milchpulver', categories: ['Dairies', 'Milk powders'] };
    expect(homeKindOf({ place: 'cupboard', product: powder, food: food('M882000', 'Whole milk powder') })).toBe('ingredient');
  });
});
