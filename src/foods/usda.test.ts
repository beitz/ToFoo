import { describe, expect, it } from 'vitest';
import { genericFirst, parseUsdaFood, parseUsdaNutrients, searchUrl, searchUsda, tidyName, usdaGroup } from './usda';

const n = (number: string, unitName: string, amount: number) => ({ type: 'FoodNutrient', nutrient: { number, name: '', unitName }, amount });

// Trimmed from the SR Legacy download (FoodData_Central_sr_legacy_food_json_2018-04), food details format.
const kimchi = {
  fdcId: 170392,
  description: 'Cabbage, kimchi',
  dataType: 'SR Legacy',
  foodCategory: { description: 'Vegetables and Vegetable Products' },
  publicationDate: '4/1/2019',
  foodPortions: [{ amount: 1, modifier: 'cup', measureUnit: { name: 'undetermined' }, gramWeight: 150 }],
  foodNutrients: [
    n('203', 'g', 1.1),
    n('204', 'g', 0.5),
    n('205', 'g', 2.4),
    n('208', 'kcal', 15),
    n('268', 'kJ', 65),
    n('269', 'g', 1.06),
    n('291', 'g', 1.6),
    n('301', 'mg', 33),
    n('303', 'mg', 2.5),
    n('307', 'mg', 498),
    n('320', 'µg', 5),
    n('323', 'mg', 0.11),
    n('328', 'µg', 0),
    n('401', 'mg', 0),
    n('406', 'mg', 1.1),
    n('415', 'mg', 0.213),
    n('431', 'µg', 0),
    n('432', 'µg', 52),
    n('435', 'µg', 52),
    n('606', 'g', 0.067),
    n('618', 'g', 0.104),
    n('619', 'g', 0.137),
  ],
};

// Search results format (nutrientNumber, unitName in capitals, value), as in the API documentation.
const branded = {
  fdcId: 2345678,
  description: 'GOCHUJANG HOT PEPPER PASTE',
  dataType: 'Branded',
  brandOwner: 'CJ CHEILJEDANG',
  brandName: 'BIBIGO',
  gtinUpc: '8801007000000',
  servingSize: 19,
  servingSizeUnit: 'g',
  householdServingFullText: '1 Tbsp',
  foodCategory: 'Ketchup, Mustard, BBQ & Cheese Sauce',
  foodNutrients: [
    { nutrientId: 1003, nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: 5.26 },
    { nutrientId: 1004, nutrientNumber: '204', unitName: 'G', value: 0 },
    { nutrientId: 1005, nutrientNumber: '205', unitName: 'G', value: 47.4 },
    { nutrientId: 1008, nutrientNumber: '208', unitName: 'KCAL', value: 211 },
    { nutrientId: 2000, nutrientNumber: '269', unitName: 'G', value: 21.1 },
    { nutrientId: 1093, nutrientNumber: '307', unitName: 'MG', value: 2580 },
    { nutrientId: 1089, nutrientNumber: '303', unitName: 'MG', value: 1.9 },
  ],
};

describe('USDA nutrients', () => {
  it('maps a generic food to BLS ids and units', () => {
    const v = parseUsdaNutrients(kimchi.foodNutrients, 'SR Legacy');
    expect(v.ENERCC).toBe(15);
    expect(v.PROT625).toBe(1.1);
    // Available carbohydrate: by difference minus fibre, as BLS gives it.
    expect(v.CHO).toBeCloseTo(0.8);
    expect(v.FIBT).toBe(1.6);
    expect(v.NA).toBe(498);
    expect(v.VITB6).toBeCloseTo(213); // mg → µg
    expect(v.VITAA).toBe(5);
    expect(v.FOL).toBe(52); // natural folate (no folic acid added)
    expect(v.NIA).toBe(1.1);
    expect(v.NIAEQ).toBeUndefined(); // preformed niacin only, not equivalents
    expect(v['F18:2CN6']).toBe(0.104); // totals stand in when the cis isomers are missing
    expect(v.VITD).toBe(0); // a measured zero stays zero
    expect(v.ID).toBeUndefined(); // missing stays missing
  });

  it('uses DFE for folate when folic acid was added, and the cis isomers when present', () => {
    const v = parseUsdaNutrients([n('431', 'µg', 100), n('432', 'µg', 40), n('435', 'µg', 210), n('675', 'g', 1), n('618', 'g', 1.2)], 'SR Legacy');
    expect(v.FOLAC).toBe(100);
    expect(v.FOL).toBe(210);
    expect(v['F18:2CN6']).toBe(1);
  });

  it('falls back to Atwater energy or kJ, and drops implausible values', () => {
    expect(parseUsdaNutrients([n('958', 'kcal', 52)], 'Foundation').ENERCC).toBe(52);
    expect(parseUsdaNutrients([n('268', 'kJ', 418.4)], 'Foundation').ENERCC).toBeCloseTo(100);
    expect(parseUsdaNutrients([n('204', 'g', 140), n('208', 'kcal', 2000)], 'Branded')).toEqual({});
  });

  it('leaves carbohydrate unknown without fibre, except on US labels', () => {
    expect(parseUsdaNutrients([n('205', 'g', 10)], 'SR Legacy').CHO).toBeUndefined();
    expect(parseUsdaNutrients([n('205', 'g', 10)], 'Branded').CHO).toBe(10);
  });
});

describe('USDA foods', () => {
  it('parses food details of a generic food', () => {
    const f = parseUsdaFood(kimchi)!;
    expect(f).toMatchObject({ code: '170392', name: 'Cabbage, kimchi', usdaType: 'SR Legacy', serving: { label: '1 cup', grams: 150 } });
    expect(f.brand).toBeUndefined();
    // Category first, the food's own name last (the first query for a similar BLS food).
    expect(f.categories).toEqual(['Vegetables and Vegetable Products', 'Cabbage']);
    expect(usdaGroup(f.categories)).toBe('G');
  });

  it('parses a branded search result', () => {
    const f = parseUsdaFood(branded)!;
    expect(f).toMatchObject({ code: '2345678', name: 'Gochujang hot pepper paste', brand: 'Bibigo', usdaType: 'Branded', serving: { label: '1 Tbsp (19 g)', grams: 19 } });
    expect(f.per100).toMatchObject({ ENERCC: 211, PROT625: 5.26, CHO: 47.4, SUGAR: 21.1, NA: 2580, FE: 1.9 });
    expect(f.perMl).toBeUndefined();
    expect(parseUsdaFood({ ...branded, servingSizeUnit: 'MLT' })!.perMl).toBe(true);
  });

  it('rejects results without id, name or a known data type', () => {
    expect(parseUsdaFood({ ...kimchi, fdcId: undefined })).toBeNull();
    expect(parseUsdaFood({ ...kimchi, dataType: 'Experimental' })).toBeNull();
  });

  it('tidies all-caps names only', () => {
    expect(tidyName('KIMCHI')).toBe('Kimchi');
    expect(tidyName('Beef, short ribs')).toBe('Beef, short ribs');
  });

  it('sorts generic foods first', () => {
    const g = parseUsdaFood(kimchi)!;
    const b = parseUsdaFood(branded)!;
    expect(genericFirst([b, g]).map((f) => f.code)).toEqual(['170392', '2345678']);
  });
});

describe('searchUsda', () => {
  const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

  it('builds a GET request with the data types, and the demo key without an own key', () => {
    const url = new URL(searchUrl('kimchi', 'generic', 8, ''));
    expect(url.origin + url.pathname).toBe('https://api.nal.usda.gov/fdc/v1/foods/search');
    expect(url.searchParams.get('api_key')).toBe('DEMO_KEY');
    expect(url.searchParams.get('dataType')).toBe('Foundation,SR Legacy,Survey (FNDDS)');
    expect(url.searchParams.get('pageSize')).toBe('8');
    expect(new URL(searchUrl('x', 'branded', 5, 'abc')).searchParams.get('api_key')).toBe('abc');
  });

  it('returns parsed foods and classifies errors', async () => {
    const ok = await searchUsda('kimchi', { fetchImpl: respond(200, { foods: [kimchi, branded, { fdcId: 1 }] }) });
    expect(ok.kind === 'ok' && ok.foods.map((f) => f.code)).toEqual(['170392', '2345678']);
    expect(await searchUsda('x', { fetchImpl: respond(429, {}) })).toEqual({ kind: 'error', reason: 'rateLimit' });
    expect(await searchUsda('x', { fetchImpl: respond(403, {}) })).toEqual({ kind: 'error', reason: 'badKey' });
    expect(await searchUsda('x', { fetchImpl: respond(503, {}) })).toEqual({ kind: 'error', reason: 'busy' });
    const offline = await searchUsda('x', {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(offline).toEqual({ kind: 'error', reason: 'offline' });
  });
});
