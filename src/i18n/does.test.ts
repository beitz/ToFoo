import { describe, expect, it } from 'vitest';
import { ROLE_ICONS, quickFacts } from '../features/nutrient/WhatItDoes';
import { bodyMakes } from '../../model/nutrientFacts';
import { doesEn } from './does.en';
import { NUTRIENT_INFO_SOURCES, nutrientInfoEn } from './nutrientInfo.en';

const texts: Record<string, string> = doesEn;
const info: Record<string, string> = nutrientInfoEn;

describe('what it does: tiles and quick facts', () => {
  it('has tiles for every nutrient with a summary, one text per icon', () => {
    for (const key of Object.keys(NUTRIENT_INFO_SOURCES)) {
      expect(info[`info.${key}.role`], key).toBeTruthy();
      const icons = ROLE_ICONS[key];
      expect(icons?.length, `${key} without tiles`).toBeGreaterThan(0);
      icons!.forEach((_, i) => expect(texts[`does.${key}.${i + 1}`], `does.${key}.${i + 1}`).toBeTruthy());
      expect(texts[`does.${key}.${icons!.length + 1}`], `does.${key}: more texts than icons`).toBeUndefined();
    }
  });

  it('has no texts for unknown nutrients', () => {
    for (const k of Object.keys(texts)) {
      const m = /^does\.([A-Z0-9:]+)\./.exec(k);
      if (m) expect(NUTRIENT_INFO_SOURCES, k).toHaveProperty([m[1]!]);
    }
  });

  it('keeps numbers out of the tiles (they come from model/)', () => {
    for (const [k, v] of Object.entries(texts)) if (/^does\.[A-Z0-9:]+\./.test(k)) expect(v.replace(/\bB\d+\b|omega-\d/g, ''), k).not.toMatch(/\d/);
  });

  it('cites every "body makes it" fact', () => {
    for (const [key, f] of Object.entries(bodyMakes)) {
      expect(NUTRIENT_INFO_SOURCES, key).toHaveProperty([key]);
      expect(f.url, key).toMatch(/^https:\/\//);
      expect(texts[`does.made.${f.value}`], key).toBeTruthy();
    }
  });

  it('shows only facts the model has a source for', () => {
    // Energy: nothing modelled. Vitamin D: made from sun, share taken up, no USDA cooking factor.
    expect(quickFacts('ENERCC')).toEqual([]);
    expect(quickFacts('VITD').map((f) => f.label)).toEqual(['Body makes it', 'Taken up']);
    // Iron: its share is not used by the model (own meal rule), so it is not shown.
    expect(quickFacts('FE').map((f) => f.label)).toEqual(['Body makes it', 'Kept when boiled']);
    expect(quickFacts('CA').find((f) => f.label === 'Taken up')?.value).toBe('25–35%');
    expect(quickFacts('VITC').find((f) => f.label === 'Kept when boiled')?.value).toBe('65–85%');
    expect(quickFacts('ID').find((f) => f.label === 'Taken up')?.value).toBe('nearly all');
  });

  it('adds what one meal gives, the store size and how fast it refills, where model/ has a source', () => {
    const ctx = { weightKg: 70, sex: 'male' as const, physiological: 2 };
    const b12 = quickFacts('VITB12', ctx);
    expect(b12.find((f) => f.label === 'From one meal')?.value).toBe('about 1.5 µg');
    expect(b12.find((f) => f.label === 'Body store')?.value).toBe('2–3 mg');
    // Without the user's weight there is no store size.
    expect(quickFacts('VITB12').find((f) => f.label === 'Body store')).toBeUndefined();
    expect(quickFacts('VITC').find((f) => f.label === 'From one meal')?.value).toBe('all of up to 200 mg');
    expect(quickFacts('FE', { ...ctx, physiological: 1 }).find((f) => f.label === 'Body store')?.value).toBe('0.5–1.5 g');
    const o3 = quickFacts('EPADHA', ctx);
    expect(o3.find((f) => f.label === 'Taken up')?.value).toBe('55–90%');
    expect(o3.find((f) => f.label === 'Refills')?.value).toBe('half in 4 weeks, all in 6 months');
    for (const f of [...b12, ...o3]) if (f.label !== 'Body makes it' && f.label !== 'Kept when boiled') expect(f.detail, f.label).toBeTruthy();
  });
});
