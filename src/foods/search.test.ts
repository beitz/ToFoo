import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFoodDb, groupSearchBoost } from './foodDb';
import { buildIndex, normalize, search } from './search';
import type { BlsFile } from './blsTypes';

describe('normalize', () => {
  it('folds German characters and accents', () => {
    expect(normalize('Äpfel, gedünstet – Grüße')).toBe('apfel gedunstet grusse');
  });
});

const file = resolve(__dirname, '../../public/data/bls-4.0.json');
describe.runIf(existsSync(file))('search on BLS', () => {
  const db = buildFoodDb(JSON.parse(readFileSync(file, 'utf8')) as BlsFile);
  const index = buildIndex(db.foods.map((f) => ({ key: f.code, nameEn: f.nameEn, nameDe: f.nameDe })));
  const boost = (key: string) => groupSearchBoost(key.charAt(0));
  const top = (q: string, n = 5) => search(index, q, { limit: n, boost }).map((r) => r.nameEn);

  it('finds plain foods first', () => {
    if (process.env.PRINT) for (const q of ['apple', 'oats', 'haferflocken', 'linsen', 'brocoli', 'salami pizza', 'rice', 'egg', 'milk', 'olive oil', 'kale', 'grünkohl', 'salt']) console.log(q, '→', top(q, 6).join(' | '));
    expect(top('apple', 3).some((n) => /^apple\b/i.test(n))).toBe(true);
    expect(top('oats', 5).join(' ')).toMatch(/Oat/);
  });

  it('searches German names too', () => {
    expect(search(index, 'haferflocken', { limit: 3 }).map((r) => r.nameDe).join(' ')).toMatch(/Hafer/);
    expect(top('linsen', 5).join(' ')).toMatch(/[Ll]entil/);
  });

  it('forgives a small typo', () => {
    expect(top('brocoli', 5).join(' ')).toMatch(/Broccoli/);
  });

  it('matches several words', () => {
    expect(top('salami pizza', 5).join(' ')).toMatch(/[Pp]izza.*[Ss]alami|[Ss]alami.*[Pp]izza/);
  });

  it('ranks recently used foods higher', () => {
    const plain = search(index, 'milk', { limit: 50 });
    const target = plain[10]!;
    const boosted = search(index, 'milk', { limit: 5, recent: new Map([[target.key, 1]]) });
    expect(boosted.findIndex((r) => r.key === target.key)).toBeLessThan(10);
  });
});
