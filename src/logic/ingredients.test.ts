import { describe, expect, it } from 'vitest';
import type { Product } from '../storage/types';
import { addProposed, foodIngredient, ingredientLine, itemIngredient, productIngredient } from './ingredients';

const salt = { iodised: true, fluoridated: false };
const lentils = { code: 'H741000', nameEn: 'Lentils, dried' };
const product: Product = {
  id: 'OFF:4008400121925',
  source: 'OFF',
  code: '4008400121925',
  name: 'Kokosmilch',
  brand: 'Alnatura',
  per100: { ENERCC: 180 },
  match: { version: '4.0', code: 'F503100' },
  categories: [],
  fetchedAt: 0,
  schemaVersion: 1,
};

describe('recipe ingredients', () => {
  it('refers to a BLS food by source, version and code', () => {
    expect(foodIngredient(lentils, '4.0', salt)).toEqual({ ref: { source: 'BLS', version: '4.0', code: 'H741000' }, name: 'Lentils, dried', grams: 0, preparation: 'asListed' });
  });

  it("turns any salt into the kitchen's salt", () => {
    const ing = foodIngredient({ code: 'R111000', nameEn: 'Salt' }, '4.0', salt, 5);
    expect(ing.isSalt).toBe(true);
    expect(ing.ref).toEqual({ source: 'BLS', version: '4.0', code: 'R114000' });
  });

  it('refers to a product by its source and code, not its values', () => {
    expect(productIngredient(product, 400, 'boiled')).toEqual({ ref: { source: 'OFF', code: '4008400121925' }, name: 'Kokosmilch · Alnatura', grams: 400, preparation: 'boiled' });
    expect(itemIngredient({ food: { code: product.id, nameEn: 'Kokosmilch' }, product, grams: 200, preparation: 'asListed' }, '4.0', salt).ref).toEqual({
      source: 'OFF',
      code: '4008400121925',
    });
    expect(itemIngredient({ food: lentils, grams: 250, preparation: 'boiled' }, '4.0', salt).ref).toEqual({ source: 'BLS', version: '4.0', code: 'H741000' });
  });

  it("takes the assistant's name and portions only where the user set none", () => {
    const ing = foodIngredient(lentils, '4.0', salt, 250, 'boiled');
    const fresh = addProposed({ name: '', portions: 4, ingredients: [] }, [ing], { name: 'Lentil curry', portions: 6 });
    expect(fresh).toEqual({ name: 'Lentil curry', portions: 6, ingredients: [ing] });
    const own = addProposed({ name: 'Dal', portions: 3, ingredients: [ing] }, [ing], { name: 'Lentil curry', portions: 6 });
    expect(own).toEqual({ name: 'Dal', portions: 3, ingredients: [ing, ing] });
    expect(addProposed({ name: '', portions: 4, ingredients: [] }, [ing], { name: '' }).portions).toBe(4);
  });

  it('describes an ingredient for the assistant', () => {
    expect(ingredientLine(foodIngredient(lentils, '4.0', salt, 250.04, 'boiled'), 'Lentils, dried')).toBe('Lentils, dried 250 g, boiled');
    expect(ingredientLine(foodIngredient(lentils, '4.0', salt, 12.5), 'Lentils, dried')).toBe('Lentils, dried 12.5 g');
  });
});
