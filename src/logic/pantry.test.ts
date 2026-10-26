import { describe, expect, it } from 'vitest';
import type { Batch, FoodRef, LogEntry, PantryItem, ShoppingItem } from '../storage/types';
import { amountField, byPlace, fromShopping, guessPlace, leftOf, leftText, loggable, packGrams, piecesAsGrams, scannedAmount, onShoppingList, pantrySuggestions, parseStock, placeFromWords, placeOfCode, planReports, planStock, stockAmount, toBuy, usageOf, withAmount, withStatus } from './pantry';

const bls = (code: string): FoodRef => ({ source: 'BLS', version: '4.0', code });
const lasagne: FoodRef = { source: 'OFF', code: '4001' };
const oats = bls('C133000');
let n = 0;
const id = () => `p${++n}`;
const item = (o: Partial<PantryItem> & { name: string }): PantryItem => ({ id: o.name, schemaVersion: 1, place: 'cupboard', since: 100, addedAt: 100, ...o });
const food = (ref: FoodRef, grams: number, time: number): LogEntry => ({ id: `e${time}`, schemaVersion: 1, kind: 'food', ref, grams, preparation: 'asListed', time, day: '2026-10-21', confidence: 'A', label: '' });
const pot = (ref: FoodRef, grams: number, cookedAt: number): Batch => ({
  id: `b${cookedAt}`,
  schemaVersion: 1,
  recipeId: 'r',
  recipe: { name: 'Porridge', portions: 4, ingredients: [{ ref, name: 'Oats', grams, preparation: 'boiled' }] },
  cookedDay: '2026-10-21',
  cookedAt,
  plan: { fresh: 4, fridge: 0, freezer: 0 },
  remaining: { fresh: 4, fridge: 0, freezer: 0 },
  corrections: [],
});
const piecesLeft = (k: number) => `${k} left`;

describe('what is left', () => {
  it('takes one piece off per meal and pot from the time it was bought, never earlier ones', () => {
    const usage = usageOf([food(lasagne, 400, 50), food(lasagne, 400, 200), food(oats, 60, 300)], []);
    const l = leftOf(item({ name: 'Lasagne', ref: lasagne, pieces: 3 }), usage);
    expect(l).toEqual({ pieces: 2, out: false, low: false });
    expect(leftOf(item({ name: 'Lasagne', ref: lasagne, pieces: 1 }), usage)).toEqual({ pieces: 0, out: true, low: false });
  });

  it('takes grams off for what was eaten and cooked, and never goes below zero', () => {
    const usage = usageOf([food(oats, 60, 200)], [pot(oats, 250, 300), pot(oats, 100, 10)]);
    expect(leftOf(item({ name: 'Oats', ref: oats, grams: 500 }), usage)).toMatchObject({ grams: 190, out: false });
    expect(leftOf(item({ name: 'Oats', ref: oats, grams: 200 }), usage)).toMatchObject({ grams: 0, out: true });
  });

  it('counts saved items by servings', () => {
    const vitD: LogEntry = { id: 'v', schemaVersion: 1, kind: 'custom', customFoodId: 'vd', servings: 2, time: 200, day: '2026-10-21', confidence: 'A', label: 'Vitamin D' };
    expect(leftOf(item({ name: 'Vitamin D', ref: { source: 'custom', id: 'vd' }, pieces: 90 }), usageOf([vitD], []))).toMatchObject({ pieces: 88 });
  });

  it('leaves things without an amount or a food as they are, unless marked', () => {
    const usage = usageOf([food(bls('R100000'), 2, 200)], []);
    expect(leftOf(item({ name: 'Paprika powder', ref: bls('R100000') }), usage)).toEqual({ out: false, low: false });
    expect(leftOf(item({ name: 'Paprika powder', status: 'low' }), usage)).toEqual({ out: false, low: true });
    expect(leftOf(item({ name: 'Paprika powder', status: 'out' }), usage)).toEqual({ out: true, low: false });
    expect(leftOf(item({ name: 'Milk', amount: '1 l' }), usage)).toEqual({ out: false, low: false });
  });

  it('reads as pieces, grams or the typed amount', () => {
    const none = usageOf([], []);
    const text = (i: PantryItem) => leftText(i, leftOf(i, none), piecesLeft);
    expect(text(item({ name: 'a', pieces: 2 }))).toBe('2 left');
    expect(text(item({ name: 'b', grams: 1500 }))).toBe('1.5 kg');
    expect(text(item({ name: 'c', amount: '1 l' }))).toBe('1 l');
    expect(text(item({ name: 'd' }))).toBe('');
  });

  it('counts a spice jar to a tenth of a gram, and reads it back that way', () => {
    // Owner's case (2026-10-26): 8.5 g left of a 12.5 g Ostmann jar, then 2 g cooked into a pot.
    const paprika = { source: 'OFF', code: '4002674044201' } as const;
    const jar = item({ name: 'Ostmann Paprika', ref: paprika, place: 'spices', ...stockAmount('8,5 g') });
    expect(jar.grams).toBe(8.5);
    const none = usageOf([], []);
    expect(leftText(jar, leftOf(jar, none), piecesLeft)).toBe('8.5 g');
    expect(amountField(jar, leftOf(jar, none))).toBe('8.5 g');
    const cooked = usageOf([], [pot(paprika, 2.3, 200)]);
    expect(leftOf(jar, cooked)).toMatchObject({ grams: 6.2, out: false });
    expect(leftText(jar, leftOf(jar, cooked), piecesLeft)).toBe('6.2 g');
    expect(leftText(item({ name: 'Salt', grams: 12 }), leftOf(item({ name: 'Salt', grams: 12 }), none), piecesLeft)).toBe('12 g');
    expect(leftText(item({ name: 'Oats', grams: 350.4 }), leftOf(item({ name: 'Oats', grams: 350.4 }), none), piecesLeft)).toBe('350 g');
  });

  it('turns jars into grams when the pack weight is known', () => {
    expect(packGrams({ quantity: '12,5 g' })).toBe(12.5);
    expect(packGrams({ quantity: '1 l', perMl: true })).toBeUndefined();
    expect(packGrams({ quantity: '500 ml', perMl: true })).toBeUndefined();
    expect(packGrams(undefined)).toBeUndefined();
    expect(piecesAsGrams({ pieces: 2, out: false, low: false }, 12.5)).toBe(25);
    expect(piecesAsGrams({ grams: 8, out: false, low: false }, 12.5)).toBeUndefined();
    expect(piecesAsGrams({ pieces: 1, out: false, low: false }, undefined)).toBeUndefined();
  });

  it('starts a scanned spice at its pack weight, anything else at one piece', () => {
    expect(scannedAmount('spices', 12.5)).toEqual({ grams: 12.5 });
    expect(scannedAmount('spices', undefined)).toEqual({ pieces: 1 });
    expect(scannedAmount('freezer', 400)).toEqual({ pieces: 1 });
  });
});

describe('typing what was bought', () => {
  it('reads plain numbers and packs as pieces, g and kg as grams, anything else as typed', () => {
    expect(parseStock('lasagne 2')).toEqual({ name: 'lasagne', pieces: 2 });
    expect(parseStock('2 cans tomatoes')).toEqual({ name: 'tomatoes', pieces: 2 });
    expect(parseStock('500 g oats')).toEqual({ name: 'oats', grams: 500 });
    expect(parseStock('milk 1 l')).toEqual({ name: 'milk', amount: '1 l' });
    expect(parseStock('paprika powder')).toEqual({ name: 'paprika powder' });
    expect(stockAmount('3 Dosen')).toEqual({ pieces: 3 });
    expect(stockAmount('0')).toEqual({ pieces: 0 });
    expect(stockAmount('')).toEqual({});
  });

  it('turns a shopping list line into something to put away', () => {
    const line = (o: Partial<ShoppingItem>): ShoppingItem => ({ id: 's', schemaVersion: 1, name: 'Oats', section: 'dry', addedAt: 1, ...o });
    expect(fromShopping(line({ ref: oats, grams: 1000, amount: '2 packs' }), 'cupboard')).toEqual({ name: 'Oats', ref: oats, grams: 1000, place: 'cupboard' });
    expect(fromShopping(line({ amount: '2 packs' }), 'cupboard')).toEqual({ name: 'Oats', pieces: 2, place: 'cupboard' });
    expect(fromShopping(line({}), 'cupboard')).toEqual({ name: 'Oats', place: 'cupboard' });
  });
});

describe('where things are kept', () => {
  it('goes by the BLS main group', () => {
    expect(placeOfCode('R100000')).toBe('spices');
    expect(placeOfCode('M111300')).toBe('fridge');
    expect(placeOfCode('X100000')).toBe('fridge');
    expect(placeOfCode('E111000')).toBe('fridge');
    expect(placeOfCode('E410000')).toBe('cupboard');
    expect(placeOfCode('C133000')).toBe('cupboard');
  });

  it('listens to the words first: frozen anywhere, a spice as the last word', () => {
    expect(placeFromWords('Frozen spinach')).toBe('freezer');
    expect(placeFromWords('TK Erbsen')).toBe('freezer');
    expect(placeFromWords('Paprika powder')).toBe('spices');
    expect(placeFromWords('Paprikapulver')).toBe('spices');
    expect(placeFromWords('black pepper')).toBe('spices');
    expect(placeFromWords('red pepper')).toBeUndefined();
    expect(placeFromWords('cinnamon rolls')).toBeUndefined();
    expect(placeFromWords('vanilla yogurt')).toBeUndefined();
  });

  it('then the food it is, common shopping words, and the database', () => {
    expect(guessPlace('Giotto', 'S100000', () => [])).toBe('cupboard');
    expect(guessPlace('Eggs', undefined, () => [])).toBe('fridge');
    expect(guessPlace('Rocket', undefined, () => [{ key: 'G100000', nameEn: 'Rocket raw', nameDe: 'Rucola roh' }])).toBe('fridge');
    expect(guessPlace('Something', undefined, () => [])).toBe('cupboard');
    expect(guessPlace('Bananas', undefined, () => [{ key: 'F503100', nameEn: 'Banana raw', nameDe: 'Banane roh' }])).toBe('cupboard');
  });
});

describe('putting things away', () => {
  const none = usageOf([], []);
  const left = (i: PantryItem) => leftOf(i, none);

  it('adds new things with their amount, counted from now', () => {
    const { put } = planStock([], [{ name: 'Lasagne', ref: lasagne, place: 'fridge', pieces: 2 }, { name: 'Salt', place: 'spices' }], 500, id, 1, left);
    expect(put).toEqual([
      { id: expect.any(String), schemaVersion: 1, name: 'Lasagne', ref: lasagne, place: 'fridge', pieces: 2, since: 500, addedAt: 500 },
      { id: expect.any(String), schemaVersion: 1, name: 'Salt', place: 'spices', since: 500, addedAt: 500 },
    ]);
  });

  it('adds to what is left of the same thing, clears running low and keeps its place', () => {
    const usage = usageOf([food(lasagne, 400, 200)], []);
    const had = item({ name: 'Lasagne', ref: lasagne, place: 'freezer', pieces: 3, status: 'low' });
    const { put } = planStock([had], [{ name: 'lasagne', place: 'fridge', pieces: 2 }], 500, id, 1, (i) => leftOf(i, usage));
    const { status: _low, ...rest } = had;
    expect(put).toEqual([{ ...rest, pieces: 4, since: 500 }]);
  });

  it('starts from nothing when it was used up, and adds up the same thing twice in one go', () => {
    const had = item({ name: 'Oats', ref: oats, grams: 500, status: 'out' });
    const { put } = planStock([had], [{ name: 'Oats', ref: oats, place: 'cupboard', grams: 1000 }, { name: 'Oats', ref: oats, place: 'cupboard', grams: 500 }], 500, id, 1, left);
    expect(put).toHaveLength(1);
    expect(put[0]).toMatchObject({ grams: 1500, since: 500 });
    expect(put[0]!.status).toBeUndefined();
  });

  it('keeps what is left when no amount is given, or makes a used-up thing "have it"', () => {
    const spice = item({ name: 'Cumin', place: 'spices', status: 'out' });
    expect(planStock([spice], [{ name: 'Cumin', place: 'spices' }], 500, id, 1, left).put[0]).toEqual({ ...item({ name: 'Cumin', place: 'spices' }), since: 500 });
    const usage = usageOf([food(lasagne, 400, 200)], []);
    const meals = item({ name: 'Lasagne', ref: lasagne, pieces: 3 });
    expect(planStock([meals], [{ name: 'Lasagne', place: 'fridge' }], 500, id, 1, (i) => leftOf(i, usage)).put[0]).toMatchObject({ pieces: 2, since: 500 });
  });
});

describe('reports from the assistant', () => {
  it('puts bought things away and marks the rest, adding unknown ones with their mark', () => {
    const none = usageOf([], []);
    const cumin = item({ name: 'Cumin', place: 'spices' });
    const { put } = planReports(
      [cumin],
      [
        { name: 'Lasagne', ref: lasagne, place: 'freezer', pieces: 2, status: 'bought' },
        { name: 'cumin', place: 'spices', status: 'low' },
        { name: 'Olive oil', place: 'cupboard', status: 'out' },
      ],
      500,
      id,
      1,
      (i) => leftOf(i, none),
    );
    expect(put.map((i) => [i.name, i.status, i.pieces])).toEqual([
      ['Lasagne', undefined, 2],
      ['Cumin', 'low', undefined],
      ['Olive oil', 'out', undefined],
    ]);
  });

  it('sets what is left from now when the user counted it, and adds it when not at home yet', () => {
    const none = usageOf([], []);
    const jar = item({ name: 'Paprika', place: 'spices', pieces: 1, status: 'low' });
    const { put } = planReports(
      [jar],
      [
        { name: 'paprika', place: 'spices', grams: 8.5, status: 'left' },
        { name: 'Yogurt', place: 'fridge', pieces: 2, status: 'left' },
        { name: 'Cumin', place: 'spices', pieces: 0, status: 'left' },
      ],
      500,
      id,
      1,
      (i) => leftOf(i, none),
    );
    expect(put.map((i) => [i.name, i.status, i.pieces, i.grams, i.since])).toEqual([
      ['Paprika', undefined, undefined, 8.5, 500],
      ['Yogurt', undefined, 2, undefined, 500],
      ['Cumin', 'out', 0, undefined, 500],
    ]);
  });
});

describe('marking and counting again', () => {
  it('sets a new amount from now, one kind at a time', () => {
    const had = item({ name: 'Oats', ref: oats, grams: 500, status: 'low' });
    expect(withAmount(had, { pieces: 2 }, 700)).toEqual({ id: 'Oats', schemaVersion: 1, name: 'Oats', ref: oats, place: 'cupboard', pieces: 2, since: 700, addedAt: 100, status: 'low' });
    expect(withAmount(had, {}, 700)).not.toHaveProperty('grams');
  });

  it('starts over without an amount when something eaten up is had again', () => {
    const usage = usageOf([food(lasagne, 400, 200)], []);
    const had = item({ name: 'Lasagne', ref: lasagne, pieces: 1 });
    const again = withStatus(had, undefined, leftOf(had, usage), 700);
    expect(again).not.toHaveProperty('pieces');
    expect(again.since).toBe(700);
    expect(withStatus(had, 'low', leftOf(item({ name: 'x', pieces: 3 }), usage), 700)).toMatchObject({ status: 'low', pieces: 1, since: 100 });
  });
});

describe('lists', () => {
  it('offers foods on the log screen, not spices or used-up things', () => {
    const none = usageOf([], []);
    const ok = (i: PantryItem) => loggable(i, leftOf(i, none));
    expect(ok(item({ name: 'Lasagne', ref: lasagne, pieces: 1 }))).toBe(true);
    expect(ok(item({ name: 'Lasagne', ref: lasagne, pieces: 0 }))).toBe(false);
    expect(ok(item({ name: 'Salt', ref: bls('R100000'), place: 'spices' }))).toBe(false);
    expect(ok(item({ name: 'Bread' }))).toBe(false);
  });

  it('knows what is on the shopping list', () => {
    const shopping: ShoppingItem[] = [
      { id: 'a', schemaVersion: 1, name: 'Cumin', section: 'pantry', addedAt: 1 },
      { id: 'b', schemaVersion: 1, name: 'Oats', section: 'dry', addedAt: 1, checkedAt: 2 },
      { id: 'c', schemaVersion: 1, name: 'Salt', section: 'pantry', addedAt: 1, checkedAt: 2, clearedAt: 3 },
    ];
    expect(onShoppingList({ name: 'cumin' }, shopping)).toBe(true);
    expect(onShoppingList({ name: 'Oats' }, shopping)).toBe(true);
    expect(toBuy({ name: 'Oats' }, shopping)).toBe(false);
    expect(onShoppingList({ name: 'Salt' }, shopping)).toBe(false);
  });

  it('groups by place and suggests things at home by name', () => {
    const items = [item({ name: 'Salt', place: 'spices' }), item({ name: 'Milk', place: 'fridge' }), item({ name: 'Butter', place: 'fridge', since: 200 })];
    expect(byPlace(items).map((g) => [g.place, g.items.map((i) => i.name)])).toEqual([
      ['fridge', ['Butter', 'Milk']],
      ['spices', ['Salt']],
    ]);
    expect(pantrySuggestions(items, 'mi').map((i) => i.name)).toEqual(['Milk']);
    expect(pantrySuggestions(items, '')).toEqual([]);
  });
});
