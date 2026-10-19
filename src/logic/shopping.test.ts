import { describe, expect, it } from 'vitest';
import type { FoodRef, Recipe, ShoppingItem } from '../storage/types';
import { commonSection, sectionFromFoods, amountText, bySection, joinAmounts, MAX_REMEMBERED, parseAmount, parseEntry, planAdd, planClear, recipeLines, sectionOfCode, sectionOfRef, shareText, suggestions } from './shopping';

const bls = (code: string): FoodRef => ({ source: 'BLS', version: '4.0', code });
let n = 0;
const id = () => `n${++n}`;
const item = (o: Partial<ShoppingItem> & { name: string }): ShoppingItem => ({ id: o.name, schemaVersion: 1, section: 'other', addedAt: 1, ...o });

describe('shop sections', () => {
  it('follow the BLS main group, with eggs apart from pasta', () => {
    expect(sectionOfCode('G480100')).toBe('produce');
    expect(sectionOfCode('M111300')).toBe('dairy');
    expect(sectionOfCode('E111000')).toBe('dairy');
    expect(sectionOfCode('E410000')).toBe('dry');
    expect(sectionOfCode('U010000')).toBe('meat');
    expect(sectionOfCode('Q630000')).toBe('dairy');
    expect(sectionOfCode('Q130000')).toBe('pantry');
    expect(sectionOfCode('Z000000')).toBe('other');
  });

  it('put a product where its paired BLS food is', () => {
    expect(sectionOfRef({ source: 'OFF', code: '4001' }, () => 'M111300')).toBe('dairy');
    expect(sectionOfRef({ source: 'OFF', code: '4001' }, () => undefined)).toBe('other');
    expect(sectionOfRef({ source: 'custom', id: 'x' }, () => undefined)).toBe('other');
  });
});

describe('sorting a typed name', () => {
  it('knows common shopping words in English and German, the last word deciding', () => {
    expect(commonSection('Eggs')).toBe('dairy');
    expect(commonSection('Eier')).toBe('dairy');
    expect(commonSection('orange juice')).toBe('drinks');
    expect(commonSection('peanut butter')).toBe('pantry');
    expect(commonSection('Toilet paper')).toBe('other');
    expect(commonSection('Rucola')).toBeUndefined();
  });

  it('otherwise goes by database foods that name every word, never by composite dishes', () => {
    const hit = (key: string, nameEn: string) => ({ key, nameEn, nameDe: '' });
    expect(sectionFromFoods('rocket', [hit('X100000', 'Rocket soup'), hit('G100000', 'Rocket raw'), hit('G100100', 'Rocket steamed')])).toBe('produce');
    expect(sectionFromFoods('cashews', [hit('H100000', 'Cashew nut')])).toBe('dry');
    expect(sectionFromFoods('paper towels', [hit('G200000', 'Paprika raw')])).toBe('other');
  });
});

describe('typing an item', () => {
  it('reads an amount before or after the name; g and kg become grams', () => {
    expect(parseEntry('Milk')).toEqual({ name: 'Milk' });
    expect(parseEntry('Milk 2 l')).toEqual({ name: 'Milk', amount: '2 l' });
    expect(parseEntry('500 g oats')).toEqual({ name: 'oats', grams: 500 });
    expect(parseEntry('oats 1,5kg')).toEqual({ name: 'oats', grams: 1500 });
    expect(parseEntry('6 eggs')).toEqual({ name: 'eggs', amount: '6' });
    expect(parseEntry('  tomatoes   2 cans ')).toEqual({ name: 'tomatoes', amount: '2 cans' });
    // A number that is part of the name stays in it.
    expect(parseEntry('7up')).toEqual({ name: '7up' });
  });

  it('reads an amount field the same way', () => {
    expect(parseAmount('250 g')).toEqual({ grams: 250 });
    expect(parseAmount('1 pack')).toEqual({ amount: '1 pack' });
    expect(parseAmount(' ')).toEqual({});
  });

  it('shows amounts as they read on a list', () => {
    expect(amountText({ grams: 333.4 })).toBe('333 g');
    expect(amountText({ grams: 1250, amount: '1 pack' })).toBe('1.3 kg + 1 pack');
    expect(amountText({})).toBe('');
    expect(joinAmounts('2 l', '1 l')).toBe('3 l');
    expect(joinAmounts('6', '4')).toBe('10');
    expect(joinAmounts('2 l', '1 pack')).toBe('2 l + 1 pack');
    expect(joinAmounts(undefined, '1 pack')).toBe('1 pack');
  });
});

describe('adding to the list', () => {
  it('keeps the same thing on one line, adding up amounts and recipes', () => {
    const oats = item({ name: 'Oat flakes', ref: bls('C133000'), section: 'dry', grams: 300, recipes: ['Porridge'] });
    const milk = item({ name: 'Milk', amount: '1 l', section: 'dairy' });
    const { put } = planAdd(
      [oats, milk],
      [
        { name: 'Oat flakes', ref: bls('C133000'), section: 'dry', grams: 200, recipes: ['Muesli'] },
        { name: 'milk', section: 'dairy', amount: '2 l' },
        { name: 'Bread', section: 'bakery' },
        { name: 'bread', section: 'bakery', amount: '1' },
      ],
      5,
      id,
      1,
    );
    expect(put).toContainEqual({ ...oats, grams: 500, recipes: ['Porridge', 'Muesli'] });
    expect(put).toContainEqual({ ...milk, amount: '3 l' });
    expect(put.filter((i) => i.name === 'Bread')).toEqual([{ id: expect.any(String), schemaVersion: 1, name: 'Bread', section: 'bakery', addedAt: 5, amount: '1' }]);
    expect(put).toHaveLength(3);
  });

  it('starts a new line for something already in the basket, and ignores empty names', () => {
    const inBasket = item({ name: 'Milk', checkedAt: 3 });
    const { put } = planAdd([inBasket], [{ name: 'Milk', section: 'dairy' }, { name: '  ', section: 'other' }], 5, id, 1);
    expect(put).toHaveLength(1);
    expect(put[0]!.id).not.toBe(inBasket.id);
  });

  it('matches a typed name with a database food of the same name', () => {
    const typed = item({ name: 'oat flakes' });
    const { put } = planAdd([typed], [{ name: 'Oat flakes', ref: bls('C133000'), section: 'dry', grams: 100 }], 5, id, 1);
    expect(put).toEqual([{ ...typed, ref: bls('C133000'), grams: 100 }]);
  });
});

describe('a recipe for the list', () => {
  const recipe: Pick<Recipe, 'name' | 'portions' | 'ingredients'> = {
    name: 'Lentil curry',
    portions: 4,
    ingredients: [
      { ref: bls('H801111'), name: 'Red lentils', grams: 250, preparation: 'boiled' },
      { ref: bls('G480100'), name: 'Onion', grams: 150, preparation: 'fried' },
      { ref: bls('G480100'), name: 'Onion', grams: 50, preparation: 'raw' },
      { ref: bls('N110000'), name: 'Drinking water', grams: 800, preparation: 'asListed' },
      { ref: bls('R114000'), name: 'Salt', grams: 6, preparation: 'asListed', isSalt: true },
    ],
  };

  it('scales to the portions, joins the same food, leaves out tap water and unticks salt', () => {
    const lines = recipeLines(recipe, 6, (i) => i.name, (r) => (r.source === 'BLS' ? sectionOfCode(r.code) : 'other'));
    expect(lines).toEqual([
      { item: { name: 'Red lentils', ref: bls('H801111'), section: 'dry', grams: 375, recipes: ['Lentil curry'] }, selected: true },
      { item: { name: 'Onion', ref: bls('G480100'), section: 'produce', grams: 300, recipes: ['Lentil curry'] }, selected: true },
      { item: { name: 'Salt', ref: bls('R114000'), section: 'pantry', grams: 9, recipes: ['Lentil curry'] }, selected: false },
    ]);
  });
});

describe('after shopping', () => {
  it('clears ticked-off lines and remembers one per name', () => {
    const oldMilk = item({ id: 'old', name: 'milk', checkedAt: 1, clearedAt: 2 });
    const milk = item({ id: 'm', name: 'Milk', checkedAt: 9 });
    const bread = item({ name: 'Bread' });
    const { put, remove } = planClear([oldMilk, milk, bread], 10);
    expect(put).toEqual([{ ...milk, clearedAt: 10 }]);
    expect(remove).toEqual(['old']);
  });

  it('remembers at most MAX_REMEMBERED names', () => {
    const many = Array.from({ length: MAX_REMEMBERED + 2 }, (_, i) => item({ id: `x${i}`, name: `thing ${i}`, checkedAt: i, clearedAt: i }));
    expect(planClear(many, 1000).remove).toEqual(['x1', 'x0']);
  });

  it('suggests things bought before that match, newest first, none still to buy', () => {
    const items = [
      item({ id: 'a', name: 'Milk', checkedAt: 1, clearedAt: 2 }),
      item({ id: 'b', name: 'Oat milk', checkedAt: 3, clearedAt: 4 }),
      item({ id: 'c', name: 'Millet', checkedAt: 5 }),
      item({ id: 'd', name: 'Mint' }),
      item({ id: 'e', name: 'Mint', checkedAt: 1, clearedAt: 2 }),
    ];
    expect(suggestions(items, 'mil').map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(suggestions(items, '')).toEqual([]);
  });
});

describe('showing and sharing', () => {
  const items = [
    item({ name: 'Bread', section: 'bakery', addedAt: 2 }),
    item({ name: 'Onions', section: 'produce', grams: 500, addedAt: 3 }),
    item({ name: 'Apples', section: 'produce', amount: '6', addedAt: 1 }),
    item({ name: 'Milk', section: 'dairy', checkedAt: 4 }),
  ];

  it('groups by section in shop order', () => {
    expect(bySection(items).map((g) => [g.section, g.items.map((i) => i.name)])).toEqual([
      ['produce', ['Apples', 'Onions']],
      ['bakery', ['Bread']],
      ['dairy', ['Milk']],
    ]);
  });

  it('shares what is still to buy as text', () => {
    expect(shareText(items, 'Shopping list', (s) => s.toUpperCase())).toBe('Shopping list\n\nPRODUCE\n- Apples (6)\n- Onions (500 g)\n\nBAKERY\n- Bread');
  });
});
