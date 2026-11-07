import { describe, expect, it } from 'vitest';
import { FOOD_ICON_NAMES, iconFor, monogram, shortNames, type Nameable } from './foodIcons';
import { FOOD_ICON_SVG } from '../ui/foodIconData';

describe('iconFor', () => {
  it.each([
    ['Pizza Diavola · Gustavo Gusto', 'pizza'],
    ['Gouda jung, Scheiben · Milram', 'cheese-wedge'],
    ['Milk, 1.5 % fat', 'glass-of-milk'],
    ['Bio Vollmilch 3,8 %', 'glass-of-milk'],
    ['Haferflocken zart · Kölln', 'sheaf-of-rice'],
    ['Roggenvollkornbrot · Harry', 'bread'],
    ['Hähnchenbrustfilet · Wiesenhof', 'poultry-leg'],
    ['Lachsfilet · Golden Seafood', 'fish'],
    ['Eier, Freilandhaltung, 10 Stück', 'egg'],
    ['Kidney Bohnen · Kaufland', 'beans'],
    ['Milchschokolade · Milka', 'chocolate-bar'],
    ['Erdnussbutter crunchy', 'peanuts'],
    ['Peanut butter', 'peanuts'],
    ['Vanilla ice cream · Landliebe', 'ice-cream'],
    ['Lorbeerblätter · Ostmann', 'herb'],
    ['Bay leaves', 'herb'],
    ['Chili con carne', 'pot-of-food'],
    ['Chiliflocken · Kotányi', 'hot-pepper'],
    ['Äpfel Elstar', 'red-apple'],
    ['Lasagne', 'shallow-pan-of-food'],
  ])('%s → %s', (name, icon) => {
    expect(iconFor(name)).toBe(icon);
  });

  it('falls back to the BLS group of the linked food, eggs apart from pasta', () => {
    expect(iconFor('Tante Emmas Paste')).toBeUndefined();
    expect(iconFor('Tante Emmas Paste', 'T100000')).toBe('fish');
    expect(iconFor('Something', 'E111000')).toBe('egg');
    expect(iconFor('Something', 'E300000')).toBe('spaghetti');
  });

  it('only picks icons that are bundled', () => {
    for (const name of FOOD_ICON_NAMES) expect(FOOD_ICON_SVG[name], name).toMatch(/^<svg /);
    for (const code of 'BCDEFGHKMNPQRSTUVWXY') expect(FOOD_ICON_NAMES).toContain(iconFor('zzz', `${code}100000`));
  });
});

describe('monogram', () => {
  it('takes two letters of the first word worth showing', () => {
    expect(monogram('Tante Emmas Paste')).toBe('Ta');
    expect(monogram('Bio 500 g Ölmühle')).toBe('Öl');
  });
});

describe('shortNames', () => {
  const named = (items: Nameable[]) => Object.fromEntries(shortNames(items));

  it('gives the name when it fits, else its first word, when nothing else looks the same', () => {
    expect(named([{ id: 'a', name: 'Gouda jung, Scheiben · Milram', icon: 'cheese-wedge' }, { id: 'b', name: 'Pizza Diavola · Gustavo Gusto', icon: 'pizza' }])).toEqual({ a: 'Gouda jung', b: 'Pizza' });
  });

  it('tells look-alikes apart by the word they do not share', () => {
    expect(
      named([
        { id: 'a', name: 'Pizza Diavola · Gustavo Gusto', icon: 'pizza' },
        { id: 'b', name: 'Pizza Margherita · Wagner', icon: 'pizza' },
        { id: 'c', name: 'Pizza Diavola · Wagner', icon: 'pizza' },
      ]),
    ).toEqual({ a: 'Diavola', b: 'Margherita', c: 'Diavola' });
  });

  it('drops pack sizes, percentages and filler', () => {
    expect(named([{ id: 'a', name: 'Bio 1,5 % Milch', icon: 'glass-of-milk' }])).toEqual({ a: 'Milch' });
    expect(named([{ id: 'a', name: '500 g Spaghetti n.5', icon: 'spaghetti' }])).toEqual({ a: 'Spaghetti' });
  });

  it('uses the short English food name for a long German first word', () => {
    expect(named([{ id: 'a', name: 'Kichererbsen · K-Classic', icon: 'beans', english: 'Chickpeas, canned' }])).toEqual({ a: 'Chickpeas' });
    expect(named([{ id: 'a', name: 'Haferflocken zart', icon: 'sheaf-of-rice', english: 'Oat flakes' }])).toEqual({ a: 'Oat flakes' });
    expect(named([{ id: 'a', name: 'Kichererbsen', icon: 'beans', english: 'Chickpeas boiled (with fat and salt)' }])).toEqual({ a: 'Chickpeas' });
    // Not when it would make two things look the same.
    expect(
      named([
        { id: 'a', name: 'Kichererbsen · K-Classic', icon: 'beans', english: 'Chickpeas, canned' },
        { id: 'b', name: 'Chickpeas', icon: 'beans' },
      ]),
    ).toEqual({ a: 'Kichererbsen', b: 'Chickpeas' });
  });

  it('keeps one name for things that really are the same', () => {
    expect(named([{ id: 'a', name: 'Milk', icon: 'glass-of-milk' }, { id: 'b', name: 'Milk', icon: 'glass-of-milk' }])).toEqual({ a: 'Milk', b: 'Milk' });
  });
});
