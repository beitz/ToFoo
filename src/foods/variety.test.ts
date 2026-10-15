import { describe, expect, it } from 'vitest';
import { diverseTop, nameWords } from './variety';

describe('varied food lists', () => {
  it('takes the main words of a name', () => {
    expect(nameWords('Veal liver, fried without fat (pan)')).toEqual(['veal', 'liver']);
    expect(nameWords('Goose liver in aspic')).toEqual(['goose', 'liver']);
    expect(nameWords('Carrots raw')).toEqual(['carrot']);
  });

  it('skips variants of foods already listed', () => {
    const foods = [
      { code: 'V532182', nameEn: 'Veal liver, fried without fat (pan)' },
      { code: 'V532100', nameEn: 'Veal liver, raw' },
      { code: 'U080132', nameEn: 'Beef liver mince, boiled' },
      { code: 'G620100', nameEn: 'Carrot raw' },
      { code: 'V531100', nameEn: 'Beef liver, raw' },
      { code: 'G520100', nameEn: 'Spinach raw' },
    ];
    expect(diverseTop(foods, 3, (f) => f).map((f) => f.code)).toEqual(['V532182', 'G620100', 'G520100']);
  });

  it('lists one food per BLS subgroup', () => {
    const foods = [
      { code: 'K711100', nameEn: 'Chanterelle dried' },
      { code: 'K702100', nameEn: 'Morel dried' },
      { code: 'T101100', nameEn: 'Anchovy grilled' },
    ];
    expect(diverseTop(foods, 3, (f) => f).map((f) => f.code)).toEqual(['K711100', 'T101100']);
  });
});
