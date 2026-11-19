import { describe, expect, it } from 'vitest';
import { parseCsv, sizesOf, tidyDetail, toCm, toSize } from './portions';

describe('USDA measures as sizes', () => {
  it('keeps sizes, pieces, slices and spoons, with inches in centimetres', () => {
    expect(toSize(1, 'medium (3" dia)', 182)).toEqual({ label: '1 medium', grams: 182, detail: '7.5 cm across' });
    expect(toSize(10, 'grapes', 49)).toEqual({ label: '10 grapes', grams: 49 });
    expect(toSize(0.5, 'large (approx 4-1/2" dia)', 166)).toEqual({ label: '½ large', grams: 166, detail: 'about 11.5 cm across' });
    expect(toSize(1, 'tablespoon', 13.5)).toEqual({ label: '1 tbsp', grams: 13.5 });
    expect(toSize(1, 'tsp or 1 packet', 5)).toEqual({ label: '1 tsp', grams: 5 });
  });

  it('drops US kitchen and pack measures', () => {
    expect(toSize(1, 'cup, chopped', 160)).toBeUndefined();
    expect(toSize(1, 'oz', 28.35)).toBeUndefined();
    expect(toSize(1, 'NLEA serving', 242)).toBeUndefined();
    expect(toSize(1, 'small box (1.5 oz)', 43)).toBeUndefined();
    expect(toSize(1, 'stick', 113, /pat|tbsp/)).toBeUndefined();
  });

  it('reads a count in an ounce measure as that count', () => {
    expect(toSize(1, 'oz (22 whole kernels)', 28.35)).toEqual({ label: '22 whole kernels', grams: 28.4 });
    // A range is no count.
    expect(toSize(1, 'oz (10-12 kernels)', 28.35)).toBeUndefined();
  });

  it('converts ranges and mixed fractions, and leaves out what it cannot read', () => {
    expect(toCm('7" to 7-7/8" long')).toBe('18–20 cm long');
    expect(toCm('5-6" dia.')).toBe('12.5–15 cm across');
    expect(tidyDetail('2-1/4 per lb, approx 3-3/4" long, 3" dia')).toBe('about 9.5 cm long, 7.5 cm across');
    expect(tidyDetail('7-1/4" to 8-/1/2" long')).toBeUndefined();
    expect(tidyDetail('1 oz')).toBeUndefined();
  });

  it('keeps distinct sizes in USDA order up to six, smallest first', () => {
    const rows = [
      { seq: 1, amount: 1, modifier: 'large', grams: 223 },
      { seq: 2, amount: 1, modifier: 'medium', grams: 182 },
      { seq: 3, amount: 1, modifier: 'medium', grams: 180 },
      { seq: 4, amount: 1, modifier: 'cup slices', grams: 109 },
    ];
    expect(sizesOf(rows)).toEqual([
      { label: '1 medium', grams: 182 },
      { label: '1 large', grams: 223 },
    ]);
  });

  it('parses USDA’s quoted CSV', () => {
    expect(parseCsv('"a","b ""x"", c"\n"1","2"\n')).toEqual([
      ['a', 'b "x", c'],
      ['1', '2'],
    ]);
  });
});
