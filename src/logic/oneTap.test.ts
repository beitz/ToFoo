import { describe, expect, it } from 'vitest';
import { oneOf } from './oneTap';

describe('oneOf', () => {
  it('is one piece when a piece weight is known', () => {
    expect(oneOf({ countedInPieces: true, units: { piece: 60, pack: 600 }, lastGrams: 120 })).toEqual({ grams: 60, pieces: 1, what: 'piece' });
  });
  it('is the whole pack for something counted in packs', () => {
    expect(oneOf({ countedInPieces: true, units: { pack: 350 }, lastGrams: 175 })).toEqual({ grams: 350, what: 'pack' });
  });
  it('is the amount logged last time for something counted in grams', () => {
    expect(oneOf({ countedInPieces: false, units: { pack: 500 }, lastGrams: 60 })).toEqual({ grams: 60, what: 'last' });
  });
  it('falls back to the label serving, else asks', () => {
    expect(oneOf({ countedInPieces: false, servingGrams: 30 })).toEqual({ grams: 30, what: 'serving' });
    expect(oneOf({ countedInPieces: false })).toBeUndefined();
    expect(oneOf({ countedInPieces: true, lastGrams: 0 })).toBeUndefined();
  });
});
