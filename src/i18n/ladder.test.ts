import { describe, expect, it } from 'vitest';
import { ladder } from '../../model/ladder';
import { infoOnly, referenceValues } from '../../model/reference-values';
import { ladderEn } from './ladder.en';
import { infoId, NUTRIENT_INFO_SOURCES, nutrientInfoEn } from './nutrientInfo.en';

const texts: Record<string, string> = ladderEn;
const KEY = /^ladder\.([A-Z0-9:]+)\.(none|low|over|farOver)(?:\.(how|signs|who))?$/;
/** A nutrient's own words for a general step (energy speaks of its target, not of "nearly everyone"). */
const OWN = /^ladder\.([A-Z0-9:]+)\.(?:(enough|bitLow)|name\.(farOver|over|plenty|enough|bitLow|low|none))$/;

describe('from too little to too much: data and texts', () => {
  it('has a line, a source and matching signs for every sourced step', () => {
    for (const [key, steps] of Object.entries(ladder)) {
      expect(NUTRIENT_INFO_SOURCES, key).toHaveProperty([key]);
      for (const [kind, step] of Object.entries(steps)) {
        const base = `ladder.${key}.${kind}`;
        expect(texts[base], `${base} without a line`).toBeTruthy();
        expect(step.url, base).toMatch(/^https:\/\//);
        for (const a of step.also ?? []) expect(a.url, base).toMatch(/^https:\/\//);
        const signs = step.signs ?? [];
        const signText = texts[`${base}.signs`];
        if (signs.length) expect(signText?.split(' · ').length, `${base}.signs`).toBe(signs.length);
        else expect(signText, `${base}.signs without signs in model/ladder.ts`).toBeUndefined();
        // Amounts only where they mean something: under it for "almost none", over it for "far too much".
        if (step.amount !== undefined) expect(['none', 'farOver'], base).toContain(kind);
      }
    }
  });

  it('has no text for a step the data does not have', () => {
    for (const k of Object.keys(texts)) {
      const m = KEY.exec(k);
      if (!m) {
        const own = OWN.exec(k);
        if (own) {
          expect(ladder, `${k} for a nutrient without a ladder`).toHaveProperty([own[1]!]);
          continue;
        }
        expect(k, 'general ladder texts start with ladder.<word>.').toMatch(/^ladder\.(title|intro|step|amount|you|label|onset|goesAway|who|noHarm|sources|whyTag|noTag|noLadder|basis|seeAll|generic)/);
        continue;
      }
      expect(ladder[m[1]!]?.[m[2] as 'none'], `${k} without a step in model/ladder.ts`).toBeDefined();
    }
  });

  it('keeps physiological numbers out of the step texts (they live in model/)', () => {
    // Names with digits (type 2 diabetes, vitamin B6, K1) are not amounts.
    const names = /type 2|\bB\d+\b|\bK[12]\b|omega-\d/g;
    for (const [k, v] of Object.entries(texts)) if (KEY.test(k) || OWN.test(k)) expect(v.replace(names, ''), k).not.toMatch(/\d/);
  });

  it('describes too much with a step or the general text for every nutrient with an upper limit', () => {
    for (const r of referenceValues) {
      if (!r.upperLimit) continue;
      const key = infoId(r.nutrient);
      expect(texts[`ladder.${key}.over`] ?? (nutrientInfoEn as Record<string, string>)[`info.${key}.high`], r.nutrient).toBeTruthy();
    }
  });

  it('says why info-only nutrients have no steps', () => {
    for (const i of infoOnly) expect(texts[`ladder.noLadder.${infoId(i.nutrient)}`], i.nutrient).toBeTruthy();
  });
});
