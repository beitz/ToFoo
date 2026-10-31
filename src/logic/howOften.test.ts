import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFoodDb, type Food } from '../foods/foodDb';
import type { BlsFile } from '../foods/blsTypes';
import { howOften } from '../../model/howOften';
import { storage } from '../../model/parameters';
import { en } from '../i18n/en';
import { coverExamples, slowBasis } from './howOften';

const food = (code: string, per100: Food['per100']): Food => ({ code, nameDe: code, nameEn: code, group: 'T', per100, provenance: {} });

describe('how often', () => {
  it('says how many days of the reference 100 g covers, leaving out foods without a value', () => {
    const byCode = new Map([
      ['T102100', food('T102100', { EPADHA: 1.974 })],
      ['T410100', food('T410100', { EPADHA: null })],
    ]);
    const ex = coverExamples('EPADHA', byCode, 0.25);
    expect(ex.map((e) => e.food.code)).toEqual(['T102100']);
    expect(ex[0]!.days).toBeCloseTo(7.9, 1);
    expect(coverExamples('EPADHA', byCode, 0)).toEqual([]);
    expect(coverExamples('VITC', byCode, 0.1)).toEqual([]);
  });

  it('has a chip text for every rule, and examples only on nutrients the body evens out slowly', () => {
    for (const [id, rule] of Object.entries(howOften)) {
      expect(en[`often.${id}` as keyof typeof en], id).toBeTruthy();
      if (rule.examples) expect(slowBasis(id), id).toBeDefined();
    }
  });

  it('explains every window that research backs, with a source; every slow window has one', () => {
    for (const [id, m] of Object.entries(storage)) {
      if (m.kind !== 'rolling') continue;
      if (m.window === 'slow') expect(m.basis, id).toBeDefined();
      if (!m.basis) continue;
      expect(en[`window.${id}` as keyof typeof en], id).toBeTruthy();
      expect(m.basis.source.length).toBeGreaterThan(10);
      expect(m.basis.url, id).toMatch(/^https:\/\//);
    }
  });
});

const file = resolve(__dirname, '../../public/data/bls-4.0.json');
describe.runIf(existsSync(file))('how often on BLS', () => {
  const db = buildFoodDb(JSON.parse(readFileSync(file, 'utf8')) as BlsFile);
  it('finds every example food with a value: a fatty fish covers about a week of EPA + DHA', () => {
    for (const [id, rule] of Object.entries(howOften)) {
      for (const code of rule.examples ?? []) expect(typeof db.byCode.get(code)?.per100[id], `${id} ${code}`).toBe('number');
    }
    // EFSA adequate intake 250 mg a day (model/reference-values.ts).
    const days = coverExamples('EPADHA', db.byCode, 0.25).map((e) => Math.round(e.days));
    expect(days).toEqual([8, 7, 5]);
  });
});
