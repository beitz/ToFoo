import { describe, expect, it } from 'vitest';
import { kitchenPlaces, placeCount, sectionInView } from './kitchen';
import type { Batch, PantryItem } from '../storage/types';

const pot = (id: string, cookedAt: number, remaining: Batch['remaining']): Batch =>
  ({ id, recipeId: 'r', recipe: { name: id, portions: 6, ingredients: [] }, cookedDay: '2026-10-20', cookedAt, plan: remaining, remaining, corrections: [], schemaVersion: 1 }) as Batch;
const item = (name: string, place: PantryItem['place']): PantryItem => ({ id: name, name, place, addedAt: 0, schemaVersion: 1 }) as unknown as PantryItem;

describe('kitchenPlaces', () => {
  it('puts portions where they are kept, fresh ones in the fridge', () => {
    const places = kitchenPlaces([item('Oats', 'cupboard'), item('Butter', 'fridge'), item('Apples', 'fridge')], [pot('Dal', 2, { fresh: 1, fridge: 1, freezer: 4 }), pot('Chili', 1, { fresh: 0, fridge: 0, freezer: 1 })]);
    expect(places.map((p) => p.place)).toEqual(['fridge', 'freezer', 'cupboard', 'spices']);
    const [fridge, freezer, cupboard, spices] = places;
    expect(fridge!.portions.map((p) => [p.batch.id, p.portions])).toEqual([['Dal', 2]]);
    expect(fridge!.items.map((i) => i.name)).toEqual(['Apples', 'Butter']);
    expect(freezer!.portions.map((p) => [p.batch.id, p.portions])).toEqual([['Chili', 1], ['Dal', 4]]);
    expect(placeCount(fridge!)).toBe(3);
    expect(placeCount(cupboard!)).toBe(1);
    expect(placeCount(spices!)).toBe(0);
  });

  it('leaves empty pots out', () => {
    const places = kitchenPlaces([], [pot('Gone', 1, { fresh: 0, fridge: 0, freezer: 0 })]);
    expect(places.every((p) => p.portions.length === 0)).toBe(true);
  });
});

describe('sectionInView', () => {
  it('is the last section that reached the line', () => {
    expect(sectionInView([100, 400, 900], 120)).toBe(0);
    expect(sectionInView([-300, 80, 600], 120)).toBe(1);
    expect(sectionInView([-900, -500, -20], 120)).toBe(2);
    expect(sectionInView([300, 600], 120)).toBe(0);
  });
});
