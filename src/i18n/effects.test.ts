import { describe, expect, it } from 'vitest';
import { infoOnly, referenceValues } from '../../model/reference-values';
import { EFFECT_SOURCES, effectsEn } from './effects.en';
import { infoId, NUTRIENT_INFO_SOURCES } from './nutrientInfo.en';

/** Out-of-range directions with no effect worth a line (the general "too little / too much" text says why). */
const NO_LOW_EFFECT = new Set(['MN', 'CR', 'MO']);
const NO_HIGH_EFFECT = new Set(['MN']);

const keys = Object.keys(effectsEn);
const has = (key: string) => keys.includes(key);

describe('what your levels mean: texts', () => {
  it('belong to known nutrients and come with what helps', () => {
    for (const k of keys) {
      const rest = k.slice('effect.'.length);
      const nutrient = rest.slice(0, rest.lastIndexOf('.'));
      const part = rest.slice(rest.lastIndexOf('.') + 1);
      expect(NUTRIENT_INFO_SOURCES, k).toHaveProperty([nutrient]);
      const direction = part.startsWith('low') ? 'low' : 'high';
      expect(has(`effect.${nutrient}.${direction}`), `${k} without a one-line text`).toBe(true);
      expect(has(`effect.${nutrient}.${direction}Help`), `${k} without "what helps"`).toBe(true);
    }
  });

  it('cover every nutrient that can be low or over an upper limit, unless no effect is known', () => {
    const limitOrInfo = new Set([...infoOnly.map((x) => x.nutrient), ...referenceValues.filter((r) => r.limitOnly).map((r) => r.nutrient)]);
    for (const r of referenceValues) {
      const key = infoId(r.nutrient);
      if (!limitOrInfo.has(r.nutrient) && !NO_LOW_EFFECT.has(key)) expect(has(`effect.${key}.low`), `${r.nutrient} low`).toBe(true);
      if ((r.upperLimit || r.limitOnly) && !NO_HIGH_EFFECT.has(key)) expect(has(`effect.${key}.high`), `${r.nutrient} high`).toBe(true);
    }
    for (const key of NO_LOW_EFFECT) expect(has(`effect.${key}.low`), key).toBe(false);
    for (const key of NO_HIGH_EFFECT) expect(has(`effect.${key}.high`), key).toBe(false);
  });

  it('cite extra sources only for directions with a text, all https', () => {
    for (const [k, list] of Object.entries(EFFECT_SOURCES)) {
      expect(has(`effect.${k}`), k).toBe(true);
      for (const s of list) expect(s.url).toMatch(/^https:\/\//);
    }
  });
});
