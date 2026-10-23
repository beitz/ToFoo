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
