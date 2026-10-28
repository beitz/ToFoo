import { describe, expect, it } from 'vitest';
import type { Food } from '../foods/foodDb';
import type { Batch, LogEntry, Product } from '../storage/types';
import { CHECK_PILE_UP, checkNudge, checkSignature, foodCheck, marksOf, productFlags, type CheckRow } from './foodCheck';

const food = (code: string, nameEn: string, per100: Food['per100']): Food => ({ code, nameEn, nameDe: nameEn, group: code.charAt(0), per100, provenance: {} });
const foods = {
  byCode: new Map(
    [
      food('P161000', 'Pale beer', { ENERCC: 36, FAT: 0, PROT625: 0.4, CHO: 2.3 }),
      food('W271000', 'Beer ham', { ENERCC: 161, FAT: 10.5, PROT625: 16.6, CHO: 0.1 }),
      food('C133000', 'Oat flakes', { ENERCC: 370, FAT: 7, PROT625: 13.5, CHO: 58.7 }),
      food('G480100', 'Onion raw', { ENERCC: 30, FAT: 0.2, PROT625: 1.2, CHO: 5 }),
    ].map((f) => [f.code, f]),
  ),
};

const product = (code: string, name: string, extra: Partial<Product> = {}): Product => ({
  id: `OFF:${code}`,
  schemaVersion: 1,
  source: 'OFF',
  code,
  name,
  per100: { ENERCC: 42, FAT: 0, PROT625: 0.5, CHO: 3 },
  categories: [],
  fetchedAt: 0,
  ...extra,
});
const helles = product('1', 'Helles', { match: { version: '4.0', code: 'W271000' } });
const pils = product('2', 'Pils', { match: { version: '4.0', code: 'P161000', auto: true } });
const water = product('3', 'Mineralwasser', { per100: { ENERCC: 0 } });
const productsById = new Map([helles, pils, water].map((p) => [p.id, p]));

let n = 0;
const entry = (day: string, ref: Extract<LogEntry, { kind: 'food' }>['ref'], grams: number): LogEntry => ({
  id: `e${n++}`,
  schemaVersion: 1,
  kind: 'food',
  ref,
  grams,
  preparation: 'raw',
  time: 0,
  day,
  confidence: 'A',
  label: 'typed',
});

describe('checking what was logged', () => {
  it('flags a label that does not fit its food, a product without one, and unchecked picks', () => {
    expect(productFlags(helles, foods).flags).toEqual(['misfit']);
    expect(productFlags(pils, foods)).toMatchObject({ flags: ['auto'] });
    expect(productFlags(pils, foods).fit).toBeGreaterThan(0.75);
    expect(productFlags(water, foods).flags).toEqual(['none']);
    // "Label values only" was the user's choice: nothing to flag.
    expect(productFlags({ ...water, labelOnly: true }, foods).flags).toEqual([]);
  });

  it('flags a food of another kind first: a beer paired with beer ham', () => {
    const beer = { ...helles, categories: ['Beverages', 'Alcoholic beverages', 'Beers'] };
    expect(productFlags(beer, foods)).toMatchObject({ kind: 'drink', flags: ['kind', 'misfit'] });
    expect(productFlags({ ...beer, match: { version: '4.0', code: 'P161000' } }, foods).flags).toEqual([]);
  });

  it('lists every food of the period once, flagged ones first, with portions by recipe', () => {
    const batch = {
      id: 'b1',
      recipe: { name: 'Porridge', portions: 2, ingredients: [{ ref: { source: 'BLS', version: '4.0', code: 'C133000' }, name: 'Oats', grams: 100, preparation: 'raw' }] },
    } as unknown as Batch;
    const log: LogEntry[] = [
      entry('2026-10-20', { source: 'BLS', version: '4.0', code: 'G480100' }, 50),
      entry('2026-10-21', { source: 'BLS', version: '4.0', code: 'G480100' }, 30),
      entry('2026-10-21', { source: 'OFF', code: '2' }, 500),
      entry('2026-10-22', { source: 'OFF', code: '1' }, 500),
      entry('2026-10-22', { source: 'OFF', code: '3' }, 750),
      entry('2026-10-01', { source: 'BLS', version: '4.0', code: 'C133000' }, 60), // before the period
      { ...entry('2026-10-22', { source: 'custom', id: 'x' }, 0), kind: 'custom', customFoodId: 'x', servings: 1 } as LogEntry,
      { id: 'p', schemaVersion: 1, kind: 'portion', batchId: 'b1', storage: 'fridge', portions: 1, time: 0, day: '2026-10-23', confidence: 'A', label: 'Porridge' },
    ];
    const rows = foodCheck(log, new Map([['b1', batch]]), productsById, foods, '2026-10-20', '2026-10-26');
    expect(rows.map((r) => r.name)).toEqual(['Helles', 'Mineralwasser', 'Pils', 'Onion raw', 'Oat flakes']);
    expect(rows[3]).toMatchObject({ count: 2, grams: 80, recipes: [] });
    expect(rows[4]).toMatchObject({ count: 0, grams: 0, recipes: ['Porridge'] });
  });

  it('puts the foods the user checked last, while they still have the food they were checked with', () => {
    const log: LogEntry[] = [
      entry('2026-10-21', { source: 'OFF', code: '1' }, 500),
      entry('2026-10-21', { source: 'BLS', version: '4.0', code: 'G480100' }, 30),
      entry('2026-10-22', { source: 'OFF', code: '2' }, 500),
    ];
    const checked = { checkedFoods: { 'OFF:1': checkSignature(helles, helles), 'BLS:G480100': 'BLS' } };
    expect(checked.checkedFoods['OFF:1']).toBe('W271000');
    const rows = foodCheck(log, new Map(), productsById, foods, '2026-10-20', '2026-10-26', checked);
    expect(rows.map((r) => [r.name, r.checked])).toEqual([
      ['Pils', false],
      ['Helles', true],
      ['Onion raw', true],
    ]);
    // A new food for it takes the mark off.
    const changed = new Map(productsById).set(helles.id, { ...helles, match: { version: '4.0', code: 'P161000' } });
    expect(foodCheck(log, new Map(), changed, foods, '2026-10-20', '2026-10-26', checked).find((r) => r.name === 'Helles')!.checked).toBe(false);
    expect(checkSignature(water, { labelOnly: true })).toBe('label');
  });

  it('adds the things at home it was asked to cover, with their places, beside what was eaten', () => {
    const log: LogEntry[] = [entry('2026-10-21', { source: 'BLS', version: '4.0', code: 'G480100' }, 30)];
    const home = [
      { ref: { source: 'BLS', version: '4.0', code: 'G480100' }, name: 'Onions', place: 'cupboard' },
      { ref: { source: 'OFF', code: '1' }, name: 'Helles', place: 'fridge' },
      { ref: { source: 'OFF', code: '1' }, name: 'Helles', place: 'cupboard' },
      { ref: { source: 'custom', id: 'x' }, name: 'Own muesli', place: 'cupboard' },
    ] as const;
    const rows = foodCheck(log, new Map(), productsById, foods, '2026-10-20', '2026-10-26', {}, home);
    expect(rows.map((r) => [r.name, r.count, r.home])).toEqual([
      ['Helles', 0, ['fridge', 'cupboard']],
      ['Onion raw', 1, ['cupboard']],
    ]);
    // Only the kitchen: nothing eaten is listed.
    expect(foodCheck([], new Map(), productsById, foods, '2026-10-20', '2026-10-26', {}, home).map((r) => r.name)).toEqual(['Helles', 'Onion raw']);
  });

  it('asks Home for a look while a food is flagged, or once enough unchecked ones piled up', () => {
    const row = (key: string, flags: CheckRow['flags'], checked = false) => ({ key, flags, checked }) as CheckRow;
    expect(checkNudge([])).toBeUndefined();
    expect(checkNudge([row('a', []), row('b', ['auto'], true)])).toBeUndefined();
    expect(checkNudge([row('a', []), row('b', ['misfit'])])).toEqual({ unchecked: 2, flagged: 1 });
    const many = Array.from({ length: CHECK_PILE_UP }, (_, i) => row(`k${i}`, []));
    expect(checkNudge(many)).toEqual({ unchecked: CHECK_PILE_UP, flagged: 0 });
    expect(checkNudge(many.slice(1))).toBeUndefined();
  });

  it('puts what the user marked "Not right" first, until the food changes', () => {
    const log: LogEntry[] = [entry('2026-10-21', { source: 'OFF', code: '2' }, 500), entry('2026-10-21', { source: 'BLS', version: '4.0', code: 'G480100' }, 30)];
    const marks = { doubtedFoods: { 'BLS:G480100': 'BLS' }, checkedFoods: { 'BLS:G480100': 'BLS' } };
    const rows = foodCheck(log, new Map(), productsById, foods, '2026-10-20', '2026-10-26', marks);
    expect(rows.map((r) => [r.name, r.flags, r.checked, r.doubted])).toEqual([
      ['Onion raw', ['doubt'], false, true],
      ['Pils', ['auto'], false, false],
    ]);
    expect(checkNudge(rows)).toEqual({ unchecked: 2, flagged: 2 });
    // A product's mark holds for the food it had: a new one takes it off.
    const pils = { doubtedFoods: { 'OFF:2': 'W271000' } };
    expect(foodCheck(log, new Map(), productsById, foods, '2026-10-20', '2026-10-26', pils)[0]!.doubted).toBe(false);
    expect(foodCheck(log, new Map(), productsById, foods, '2026-10-20', '2026-10-26', { doubtedFoods: { 'OFF:2': 'P161000' } })[0]).toMatchObject({ name: 'Pils', flags: ['doubt', 'auto'] });
  });

  it('keeps both marks of some foods for undo', () => {
    expect(marksOf({ checkedFoods: { a: 'BLS' }, doubtedFoods: { b: 'X1' } }, ['a', 'b', 'c'])).toEqual({ a: { checked: 'BLS' }, b: { doubted: 'X1' }, c: {} });
  });
});
