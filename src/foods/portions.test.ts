import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import raw from './portions-usda.json';
import { commonSizes, onePieceGrams, sizeCount, sizeLabel, sizesNote, type PortionsFile } from './portions';

const file = raw as PortionsFile;

describe('common sizes from USDA', () => {
  it('gives the owner’s apple its USDA sizes (1 medium = 182 g)', () => {
    const apple = commonSizes('F110100');
    expect(apple?.usdaName).toBe('Apples, raw, with skin');
    expect(apple?.sizes).toContainEqual({ label: '1 medium', grams: 182, detail: '7.5 cm across' });
  });

  it('has nothing for foods without a fitting USDA size', () => {
    expect(commonSizes('C131000')).toBeUndefined(); // oat grains
  });

  it('points every BLS food at a USDA food with sizes, and every note at a text', () => {
    for (const [code, ref] of Object.entries(file.foods)) {
      expect(file.usda[ref.usda]?.sizes.length, code).toBeGreaterThan(0);
      if (ref.note) expect(en, code).toHaveProperty(`portions.note.${ref.note}`);
    }
  });

  it('keeps every size plausible: grams above 0, never US cups or packs', () => {
    for (const { sizes } of Object.values(file.usda))
      for (const s of sizes) {
        expect(s.grams).toBeGreaterThan(0);
        expect(s.label).not.toMatch(/\b(cup|oz|lb|package|can)\b|"/);
        expect(s.detail ?? '').not.toMatch(/"/);
      }
  });

  const bls = resolve(__dirname, '../../public/data/bls-4.0.json');
  it.runIf(existsSync(bls))('only names BLS foods that exist', () => {
    const codes = new Set((JSON.parse(readFileSync(bls, 'utf8')) as { foods: Array<[string]> }).foods.map((f) => f[0]));
    for (const code of Object.keys(file.foods)) expect(codes.has(code), code).toBe(true);
  });

  it('counts and labels sizes picked more than once', () => {
    expect(sizeCount('10 grapes')).toBe(10);
    expect(sizeCount('½ large')).toBe(0.5);
    expect(sizeCount('1 medium')).toBe(1);
    expect(sizeLabel('1 medium', 1)).toBe('1 medium');
    expect(sizeLabel('1 medium', 2)).toBe('2 × medium');
    expect(sizeLabel('10 grapes', 2)).toBe('2 × 10 grapes');
  });

  it('turns a size into the weight of one piece', () => {
    expect(onePieceGrams({ label: '10 grapes', grams: 49 })).toBe(4.9);
    expect(onePieceGrams({ label: '1 medium', grams: 182 })).toBe(182);
    expect(onePieceGrams({ label: '½ large', grams: 166 })).toBe(166);
  });

  it('tells the assistant the sizes and where they are from', () => {
    expect(sizesNote('F110100')).toContain('1 medium (7.5 cm across) = 182 g');
    expect(sizesNote('F110100')).toContain('USDA "Apples, raw, with skin"');
    expect(sizesNote('E111100')).toContain('US large ≈ EU size M');
    expect(sizesNote('C131000')).toBe('');
  });
});
