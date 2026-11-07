/**
 * What kind of thing something at home is, for the colour of its tile's ring and the groups in Log
 * meal (owner's idea, 2026-11-07: "ready to eat meals could be one thing, spices another,
 * ingredients another"). Worked out from where it is kept, the BLS group of its food and a product's
 * categories; the user can change it in the item's sheet (PantryItem `kind`). Pure; tested in
 * homeKind.test.ts.
 */
import { DISH, isBlsDrink, kindOf } from '../foods/productMatch';
import type { Food } from '../foods/foodDb';
import type { HomePlace, Product } from '../storage/types';

/** In the order Log meal lists them: what is ready to eat first. */
export const HOME_KINDS = ['cooked', 'ready', 'ingredient', 'snack', 'drink', 'spice'] as const;
export type HomeKind = (typeof HOME_KINDS)[number];

export const isHomeKind = (k: string | undefined): k is HomeKind => !!k && (HOME_KINDS as readonly string[]).includes(k);

/**
 * The kind of a thing at home: a cooked pot is "cooked"; the spices place or a BLS spice (group R)
 * "spice"; a drink by its product's categories or its BLS food "drink"; a product in a dish category
 * (meals, pizzas, soups…) or a BLS dish (groups X, Y) "ready"; BLS sweets, cakes and biscuits
 * (groups S, D) "snack"; anything else "ingredient".
 */
export function homeKindOf(thing: { pot?: boolean; place?: HomePlace; food?: Pick<Food, 'code' | 'nameEn'>; product?: Pick<Product, 'name' | 'categories'> }): HomeKind {
  if (thing.pot) return 'cooked';
  const group = thing.food?.code.charAt(0) ?? '';
  if (thing.place === 'spices' || group === 'R') return 'spice';
  const productKind = thing.product ? kindOf(thing.product).drink : 'unknown';
  if (productKind === 'drink' || (productKind !== 'food' && thing.food && isBlsDrink(thing.food))) return 'drink';
  if (thing.product?.categories.some((c) => DISH.test(c)) || group === 'X' || group === 'Y') return 'ready';
  if (group === 'S' || group === 'D') return 'snack';
  return 'ingredient';
}
