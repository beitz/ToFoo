import { describe, expect, it } from 'vitest';
import { parseCofidValue } from './cofid';
import { bestMatch, estimateFrom, isEdiblePortion, nameSimilarity, prepare, profileDistance, scaleFactor, SELENIUM, tokens, type BlsFoodLike, type CofidFood } from './selenium';

const cofid = (code: string, name: string, group: string, values: CofidFood['values']): CofidFood => ({ code, name, group, values });
const bls = (code: string, nameEn: string, per100: BlsFoodLike['per100']): BlsFoodLike => ({ code, nameEn, per100 });

// Values per 100 g, roughly as in the tables (CoFID copper in mg, BLS in µg).
const codRaw = cofid('16-001', 'Cod, flesh only, raw', 'JA', { WATER: 81, PROT: 17.5, FAT: 0.6, CHO: 0, NA: 70, K: 340, CA: 9, MG: 25, P: 190, FE: 0.1, ZN: 0.4, CU: 0.02, SE: 23 });
const beefRaw = cofid('18-001', 'Beef, lean, average, raw', 'MAC', { WATER: 73, PROT: 22.5, FAT: 4.3, CHO: 0, NA: 60, K: 350, CA: 5, MG: 22, P: 200, FE: 2.1, ZN: 4.4, CU: 0.07, SE: 7 });
const apple = cofid('14-001', 'Apples, eating, raw, flesh only', 'FA', { WATER: 85, PROT: 0.6, FAT: 0.1, CHO: 11.6, NA: 1, K: 100, CA: 4, MG: 5, P: 9, FE: 0.1, ZN: 0.1, CU: 0.02, SE: 't' });
const codWithBones = cofid('16-002', 'Cod, raw, weighed with bones and skin', 'JA', { WATER: 70, PROT: 15, SE: 20 });
const candidates = prepare([codRaw, beefRaw, apple, codWithBones], SELENIUM);

const blsCod = bls('T204100', 'Cod raw', { WATER: 80.5, PROT625: 17.7, FAT: 0.7, CHO: 0, NA: 72, K: 350, CA: 11, MG: 26, P: 195, FE: 0.1, ZN: 0.4, CU: 25 });
const blsCodBaked = bls('T204162', 'Cod baked', { WATER: 72, PROT625: 23, FAT: 0.9, CHO: 0, NA: 90, K: 390, CA: 14, MG: 30, P: 250, FE: 0.2, ZN: 0.5, CU: 30 });

describe('selenium from CoFID', () => {
  it('reads CoFID cells: numbers, Tr as trace, N as missing', () => {
    expect(parseCofidValue('23')).toBe(23);
    expect(parseCofidValue(0.5)).toBe(0.5);
    expect(parseCofidValue('Tr')).toBe('t');
    expect(parseCofidValue('N')).toBeNull();
    expect(parseCofidValue(null)).toBeNull();
    expect(() => parseCofidValue('??')).toThrow();
  });

  it('compares names by their words, the food word first, preparation words less', () => {
    expect(tokens('Salmon, farmed, flesh only, raw')).toEqual(['salmon', 'farmed', 'raw']);
    expect(tokens('Lentils, red, split')).toEqual(['lentil', 'red', 'split']);
    const steak = tokens('Salmon steaks fried');
    expect(nameSimilarity(steak, tokens('Salmon, farmed, flesh only, grilled'))).toBeGreaterThan(nameSimilarity(steak, tokens('Beef, sirloin steak, fried')));
    expect(nameSimilarity([], ['cod'])).toBe(0);
  });

  it('measures how alike two foods are by the nutrients both have', () => {
    expect(profileDistance(blsCod, codRaw).distance).toBeLessThan(0.1);
    expect(profileDistance(blsCod, beefRaw).distance).toBeGreaterThan(profileDistance(blsCod, codRaw).distance);
    // Copper is compared in the same unit (CoFID mg → BLS µg).
    expect(profileDistance(bls('X', 'x', { CU: 20 }), cofid('y', 'y', 'J', { CU: 0.02 })).distance).toBe(0);
    expect(profileDistance(bls('X', 'x', {}), codRaw)).toEqual({ distance: Infinity, shared: 0 });
  });

  it('pairs a food with the most alike CoFID food of the same kind, never an as-bought weight', () => {
    expect(isEdiblePortion(codWithBones)).toBe(false);
    expect(candidates.map((c) => c.food.code)).not.toContain('16-002');
    expect(bestMatch(blsCod, candidates)?.cofid.code).toBe('16-001');
    // Fish (T) may only match CoFID fish (J): with no fish left, nothing, rather than beef.
    expect(bestMatch(blsCod, prepare([beefRaw, apple], SELENIUM))).toBeUndefined();
  });

  it('scales by protein, or by dry matter for foods with little protein, within limits', () => {
    expect(scaleFactor(blsCodBaked, codRaw)).toBeCloseTo(23 / 17.5);
    expect(estimateFrom(blsCodBaked, codRaw)).toBeCloseTo(23 * (23 / 17.5), 1);
    expect(scaleFactor(bls('F1', 'Apple dried', { PROT625: 0.5, WATER: 25 }), apple)).toBe(2); // dry matter ×5, capped
    expect(scaleFactor(bls('F2', 'x', {}), apple)).toBe(1);
  });

  it('keeps trace as trace and missing as missing', () => {
    expect(estimateFrom(bls('F110100', 'Apple raw', { PROT625: 0.3, WATER: 85 }), apple)).toBe('t');
    expect(estimateFrom(blsCod, cofid('z', 'z', 'J', { SE: null }))).toBeNull();
  });
});
