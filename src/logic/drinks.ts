/**
 * Drink containers and plain drinks (docs/SPEC.md, "Water", "Own containers"): pure helpers.
 *
 * A container holds plain water (a water record, kept apart from the food log) or one of the plain
 * drinks below, logged as that BLS food so its water, its few nutrients and its effect on iron from
 * meals around it come from the food data like any other drink.
 */
import type { DrinkContainer, FoodRef } from '../storage/types';

/**
 * Plain drinks a container can hold, by BLS code: brewed without milk or sugar (0–2 kcal per 100 g
 * in the BLS). The key names the i18n label (`drinks.<key>`).
 */
export const CONTAINER_DRINKS = [
  { key: 'blackTea', code: 'N630000' },
  { key: 'greenTea', code: 'N610100' },
  { key: 'herbalTea', code: 'N720100' },
  { key: 'peppermintTea', code: 'N721000' },
  { key: 'fruitTea', code: 'N710000' },
  { key: 'rooibos', code: 'N601000' },
  { key: 'coffee', code: 'N410100' },
] as const;

export type ContainerDrinkKey = (typeof CONTAINER_DRINKS)[number]['key'];

/**
 * Plain drinks that do not end a fast, like water and the tea and coffee marks: the container drinks
 * and their decaffeinated, mate and espresso siblings, all without milk or sugar (0–2 kcal per 100 g).
 */
const FAST_FRIENDLY = new Set<string>([...CONTAINER_DRINKS.map((d) => d.code), 'N670100', 'N611000', 'N415000', 'N416000', 'N411100', 'N419000']);

/** True for a plain BLS tea or coffee (no milk, no sugar): it does not end a fast. */
export function isPlainDrink(ref: FoodRef): boolean {
  return ref.source === 'BLS' && FAST_FRIENDLY.has(ref.code);
}

/** The drink key of a container, or 'water'. A code no longer offered keeps working as 'other'. */
export function containerDrinkKey(c: Pick<DrinkContainer, 'drink'>): ContainerDrinkKey | 'water' | 'other' {
  if (!c.drink) return 'water';
  return CONTAINER_DRINKS.find((d) => d.code === c.drink!.code)?.key ?? 'other';
}

/** Parts of a container one can log: a quarter up to two full ones. */
export const CONTAINER_AMOUNTS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

/** Most a container may hold (a large thermos is 2 l, a big teapot 1.5 l); more is a typo. */
export const MAX_CONTAINER_ML = 3000;

/** Millilitres in `amount` containers (1 = full, 0.5 = half), rounded to whole ml. */
export function containerMl(c: Pick<DrinkContainer, 'ml'>, amount: number): number {
  return Math.round(c.ml * amount);
}

/** The list with `c` added or changed in place (name trimmed, size rounded); unchanged when `c` is not valid. */
export function withContainer(list: readonly DrinkContainer[], c: DrinkContainer): DrinkContainer[] {
  const name = c.name.trim();
  if (!name || !(c.ml > 0) || c.ml > MAX_CONTAINER_ML) return [...list];
  const clean: DrinkContainer = { id: c.id, name, ml: Math.round(c.ml), ...(c.drink ? { drink: c.drink } : {}), ...(c.whenEmpty ? { whenEmpty: true } : {}) };
  return list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? clean : x)) : [...list, clean];
}

/** The list without the container `id`, and where it was (for undo). */
export function withoutContainer(list: readonly DrinkContainer[], id: string): { list: DrinkContainer[]; index: number } {
  return { list: list.filter((c) => c.id !== id), index: list.findIndex((c) => c.id === id) };
}
