/**
 * Recipe ingredients from what was picked: a BLS food, a product (Open Food Facts or USDA), or the
 * assistant's proposal (pure, tested in ingredients.test.ts). Ingredients refer to their food by
 * source and code (CLAUDE.md rule 5); salt becomes the kitchen's salt.
 */
import { ALL_SALT_CODES, saltCode, type Food } from '../foods/foodDb';
import { productLabel, productRef } from '../foods/products';
import type { Preparation } from '../model/paramTypes';
import type { Ingredient, Product, Profile } from '../storage/types';

export function foodIngredient(food: Pick<Food, 'code' | 'nameEn'>, version: string, salt: Profile['salt'], grams = 0, preparation: Preparation = 'asListed'): Ingredient {
  const isSalt = ALL_SALT_CODES.has(food.code);
  return { ref: { source: 'BLS', version, code: isSalt ? saltCode(salt) : food.code }, name: food.nameEn, grams, preparation, ...(isSalt ? { isSalt: true } : {}) };
}

export function productIngredient(product: Product, grams: number, preparation: Preparation = 'asListed'): Ingredient {
  return { ref: productRef(product), name: productLabel(product), grams, preparation };
}

/** A checked item from the assistant: a BLS food, or a product with the BLS food standing in for its micronutrients. */
export interface PickedItem {
  food: Pick<Food, 'code' | 'nameEn'>;
  product?: Product;
  grams: number;
  preparation: Preparation;
}

export function itemIngredient(item: PickedItem, version: string, salt: Profile['salt']): Ingredient {
  return item.product ? productIngredient(item.product, item.grams, item.preparation) : foodIngredient(item.food, version, salt, item.grams, item.preparation);
}

export interface RecipeDraft {
  name: string;
  portions: number | undefined;
  ingredients: Ingredient[];
  instructions: string;
}

/**
 * Add the assistant's ingredients to the recipe being edited. Its name is taken only when the
 * recipe has none, its portions only while the recipe has no ingredients yet (a new recipe's
 * portions are just the default then); the user's own entries always win. Its steps replace the
 * recipe's: the assistant was shown them and proposes the complete steps (the user checked them
 * on the card, and the undo brings the old ones back).
 */
export function addProposed(draft: RecipeDraft, added: readonly Ingredient[], proposal: { name: string; portions?: number; instructions?: string }): RecipeDraft {
  return {
    name: draft.name.trim() ? draft.name : proposal.name,
    portions: draft.ingredients.length === 0 && proposal.portions ? proposal.portions : draft.portions,
    ingredients: [...draft.ingredients, ...added],
    instructions: proposal.instructions?.trim() ? proposal.instructions.trim() : draft.instructions,
  };
}

/** One line per ingredient for the assistant: "Red lentils, dried 250 g, boiled". */
export function ingredientLine(ing: Ingredient, name: string): string {
  return `${name} ${Math.round(ing.grams * 10) / 10} g${ing.preparation === 'asListed' ? '' : `, ${ing.preparation}`}`;
}
