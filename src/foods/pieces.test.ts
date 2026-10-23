import { describe, expect, it } from 'vitest';
import { labelPiece, packHints, pieceCount, pieceWeight, piecesToGrams, savedPiece, withPiece } from './pieces';

describe('pieceCount', () => {
  it('reads counts of pieces as Open Food Facts packs print them', () => {
    expect(pieceCount('60 pieces')).toBe(60);
    expect(pieceCount('10 Dragees')).toBe(10);
    expect(pieceCount('50pcs')).toBe(50);
    expect(pieceCount('4pcs')).toBe(4);
    expect(pieceCount('12 Stück')).toBe(12);
    expect(pieceCount('2 PIECES (3 g)')).toBe(2);
    expect(pieceCount('1 Riegel = 25 g')).toBe(1);
  });

  it('reads the other ways counts are written on Open Food Facts products in Germany', () => {
    expect(pieceCount('Toffifee 15er')).toBe(15);
    expect(pieceCount('Knoppers 8-Pack')).toBe(8);
    expect(pieceCount('16 pack 160g')).toBe(16);
    expect(pieceCount('Tortilla Original Medium 8pk')).toBe(8);
    expect(pieceCount('50 pc')).toBe(50);
    expect(pieceCount('10 stck.')).toBe(10);
    expect(pieceCount('24 ct')).toBe(24);
    expect(pieceCount('15 Fischstäbchen')).toBe(15);
    expect(pieceCount('20 Brausetabletten 82g')).toBe(20);
    expect(pieceCount('25 Aufgussbeutel')).toBe(25);
    expect(pieceCount('80g (20 comprimés)')).toBe(20);
    expect(pieceCount('2x 12 slices (225g)')).toBe(24);
    // Numbers that are not pieces.
    expect(pieceCount('5-Korn Müsli')).toBeUndefined();
    expect(pieceCount('Nescafe 3 in 1 classic')).toBeUndefined();
    expect(pieceCount('Frühlings Quark 7 Kräuter')).toBeUndefined();
    expect(pieceCount('1 Packung 190g')).toBeUndefined();
  });

  it('does not count weights, measures or words that merely start like a piece word', () => {
    expect(pieceCount('42 g')).toBeUndefined();
    expect(pieceCount('2 tbsp (30 g)')).toBeUndefined();
    expect(pieceCount('1 cup (240 ml)')).toBeUndefined();
    expect(pieceCount('3 strong mints')).toBeUndefined();
    expect(pieceCount(undefined)).toBeUndefined();
  });
});

describe('labelPiece', () => {
  it('divides a serving that counts pieces by its weight', () => {
    expect(labelPiece({ serving: { label: '2 pieces (2.8 g)', grams: 2.8 } })).toEqual({ grams: 1.4, from: 'serving', text: '2 pieces (2.8 g)' });
    // USDA branded: household serving and the label serving in grams.
    expect(labelPiece({ serving: { label: '2 PIECES (3 g)', grams: 3 } })?.grams).toBe(1.5);
    expect(labelPiece({ serving: { label: '1 Riegel (21,5 g)', grams: 21.5 } })?.grams).toBe(21.5);
  });

  it('ignores a serving that is a measure, not pieces', () => {
    expect(labelPiece({ serving: { label: '30 g', grams: 30 } })).toBeUndefined();
    expect(labelPiece({ serving: { label: '1 cup (240 ml)', grams: 240 } })).toBeUndefined();
  });

  it('reads multipacks and packs that give both a count and a weight', () => {
    expect(labelPiece({ quantity: '10 x 1,5 g' })).toEqual({ grams: 1.5, from: 'pack', text: '10 x 1,5 g' });
    expect(labelPiece({ quantity: '6*14g' })?.grams).toBe(14);
    expect(labelPiece({ quantity: '10 Dragees (14 g)' })?.grams).toBe(1.4);
    expect(labelPiece({ quantity: '6 x 0,5 l' })?.grams).toBe(500);
  });

  it('gives nothing for packs that say only the count or only the weight (most of them)', () => {
    expect(labelPiece({ quantity: '60 pieces' })).toBeUndefined();
    expect(labelPiece({ quantity: '42 g' })).toBeUndefined();
    expect(labelPiece({})).toBeUndefined();
  });

  it('reads the weight of each piece where the text gives it', () => {
    expect(labelPiece({ quantity: '10 Sticks a 2 g' })).toEqual({ grams: 2, from: 'pack', text: '10 Sticks a 2 g' });
    expect(labelPiece({ quantity: '200 g (8 Riegel x 25 g)' })?.grams).toBe(25);
    expect(labelPiece({ quantity: '185 g, 10 barres de 18.5 g' })?.grams).toBe(18.5);
    expect(labelPiece({ name: 'Snickers (5 x 2 Stück à 9.125 g)' })).toMatchObject({ grams: 9.13, from: 'name' });
    expect(labelPiece({ name: 'Zwieback', quantity: '2x 12 slices (225g)' })?.grams).toBe(9.38);
    expect(labelPiece({ name: 'Kitkat Chunky White 4er-Pack', quantity: '160 g' })?.grams).toBe(40);
  });

  it('reads the count in the name, with the weight from the pack or the name', () => {
    // Wrigley's Extra in Germany: "50 Stk" only in the name, the weight in the pack size.
    expect(labelPiece({ name: 'Extra Peppermint 50 Stk', quantity: '70 g' })).toEqual({ grams: 1.4, from: 'name', text: 'Extra Peppermint 50 Stk · 70 g' });
    expect(labelPiece({ name: 'Kaugummi 10 Stück 14 g' })?.grams).toBe(1.4);
    expect(labelPiece({ name: 'Müsliriegel 5 x 25 g' })).toMatchObject({ grams: 25, from: 'name' });
    // A count alone is not a weight.
    expect(labelPiece({ name: 'Extra Peppermint 50 Stk' })).toBeUndefined();
    expect(labelPiece({ name: 'Extra Peppermint 50 Stk', quantity: '60 pieces' })).toBeUndefined();
    expect(labelPiece({ name: 'Kaugummi 70 g', quantity: '50 pieces' })).toMatchObject({ grams: 1.4, from: 'name' });
    // The pack's own text wins.
    expect(labelPiece({ name: 'Gum 50 Stk', quantity: '10 Dragees (14 g)' })?.from).toBe('pack');
  });

  it('prefers the serving to the pack', () => {
    expect(labelPiece({ quantity: '10 x 20 g', serving: { label: '2 pieces (3 g)', grams: 3 } })?.from).toBe('serving');
  });
});

describe('packHints', () => {
  it('starts the user off with what the pack says', () => {
    expect(packHints({ quantity: '60 pieces' })).toEqual({ count: 60 });
    expect(packHints({ quantity: '42 g' })).toEqual({ grams: 42 });
    expect(packHints({ quantity: '1,1 kg' })).toEqual({ grams: 1100 });
    expect(packHints({ quantity: '10 x 1.5 g' })).toEqual({});
    expect(packHints(undefined)).toEqual({});
    expect(packHints({ name: 'Extra Peppermint 50 Stk', quantity: '70 g' })).toEqual({ grams: 70, count: 50 });
    expect(packHints({ name: 'Extra Peppermint 50 Stk' })).toEqual({ count: 50 });
    expect(packHints({ name: 'Kaugummi 70 g', quantity: '60 pieces' })).toEqual({ grams: 70, count: 60 });
  });
});

describe('the piece weight among saved portion sizes', () => {
  const sizes = [{ label: 'My bowl', grams: 60 }];

  it('adds, replaces and removes it, keeping other sizes', () => {
    const one = withPiece(sizes, 1.4, 'piece');
    expect(one).toEqual([{ label: 'My bowl', grams: 60 }, { label: 'piece', grams: 1.4, piece: true }]);
    expect(savedPiece(one)).toBe(1.4);
    const two = withPiece(one, 1.5, 'piece');
    expect(two.filter((s) => s.piece)).toHaveLength(1);
    expect(savedPiece(two)).toBe(1.5);
    expect(withPiece(two, undefined, 'piece')).toEqual(sizes);
    expect(savedPiece(sizes)).toBeUndefined();
  });

  it("uses the user's weight before the label's", () => {
    const product = { serving: { label: '2 pieces (3 g)', grams: 3 } };
    expect(pieceWeight(undefined, product)).toEqual({ grams: 1.5, from: 'serving', text: '2 pieces (3 g)' });
    expect(pieceWeight(withPiece([], 1.4, 'piece'), product)).toEqual({ grams: 1.4, from: 'yours' });
    expect(pieceWeight(undefined, { quantity: '60 pieces' })).toBeUndefined();
  });

  it('turns pieces into grams to a tenth of a gram', () => {
    expect(piecesToGrams(3, 1.4)).toBe(4.2);
    expect(piecesToGrams(0.5, 21.5)).toBe(10.8);
  });
});
