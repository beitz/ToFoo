import { describe, expect, it } from 'vitest';
import { activityEnergy } from '../../model/parameters';
import { COMPENDIUM, compendiumActivity, searchCompendium } from './compendium';

describe('2024 Adult Compendium', () => {
  it('has every row of the PDF once, with values as printed', () => {
    expect(COMPENDIUM.length).toBe(1111);
    expect(new Set(COMPENDIUM.map((a) => a.code)).size).toBe(COMPENDIUM.length);
    expect(compendiumActivity('17200')).toMatchObject({ met: 4.8, heading: 'Walking' });
    expect(compendiumActivity('12050')?.met).toBe(9.3);
    // A description wrapped around its row in the PDF is joined back together.
    expect(compendiumActivity('02050')?.description).toBe('Resistance (weight lifting - free weight, nautilus or universal-type), power lifting or body building, vigorous effort (Taylor Code 210)');
    for (const a of COMPENDIUM) {
      expect(a.met).toBeGreaterThan(0);
      expect(a.heading).not.toBe('');
    }
  });

  it('has a row for every default kind and effort', () => {
    for (const efforts of Object.values(activityEnergy.defaultRows.value)) for (const code of Object.values(efforts)) expect(compendiumActivity(code)).toBeDefined();
  });

  it('finds activities by word starts in heading and description', () => {
    const soccer = searchCompendium('soccer');
    expect(soccer.length).toBeGreaterThan(0);
    expect(soccer.every((a) => /soccer/i.test(a.description))).toBe(true);
    expect(searchCompendium('yoga')[0]?.description).toMatch(/^Yoga/);
    expect(searchCompendium('walk dog').some((a) => a.code === '17165')).toBe(true);
    expect(searchCompendium('')).toEqual([]);
    expect(searchCompendium('zzzz')).toEqual([]);
  });
});
