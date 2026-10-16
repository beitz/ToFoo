import { describe, expect, it } from 'vitest';
import { lookupBarcode, normalizeBarcode, parseNutriments, parseProduct, validGtin } from './openFoodFacts';

// Trimmed from the real v3 response for Giotto Haselnuss (fetched 2026-10-16).
const giotto = {
  code: '4008400121925',
  product_name: 'Giotto Haselnuss (9 Stück)',
  brands: 'Ferrero, Giotto',
  quantity: '38,7 g',
  serving_size: '3 balls (13 g)',
  serving_quantity: 13,
  nutrition_data_per: '100g',
  product_quantity_unit: 'g',
  categories_tags_en: ['Snacks', 'Sweet snacks', 'Chocolate candies', 'Nut confectioneries'],
  last_modified_t: 1785693745,
  nutriments: {
    'energy-kcal_100g': 632,
    'energy-kj_100g': 2600.5,
    fat_100g: 48,
    'saturated-fat_100g': 14.2,
    carbohydrates_100g: 38.4,
    sugars_100g: 32.3,
    proteins_100g: 10.1,
    salt_100g: 0.31,
    sodium_100g: 0.124,
    'added-sugars_100g': 26.08,
    'nova-group_100g': 4,
  },
};

describe('barcodes', () => {
  it('checks GTIN check digits', () => {
    expect(validGtin('4008400121925')).toBe(true);
    expect(validGtin('4008400121926')).toBe(false);
    expect(validGtin('90020841')).toBe(true); // EAN-8
  });

  it('normalises typed barcodes and rejects typos', () => {
    expect(normalizeBarcode(' 4 008400 121925 ')).toBe('4008400121925');
    expect(normalizeBarcode('4008400121926')).toBeNull();
    expect(normalizeBarcode('abc')).toBeNull();
    expect(normalizeBarcode('809494')).toBe('809494'); // store-internal codes have no check digit
  });
});

describe('parsing Open Food Facts products', () => {
  it('maps label values to BLS ids and units', () => {
    const p = parseProduct(giotto)!;
    expect(p).toMatchObject({ code: '4008400121925', name: 'Giotto Haselnuss (9 Stück)', brand: 'Ferrero, Giotto', quantity: '38,7 g', serving: { label: '3 balls (13 g)', grams: 13 }, lastModified: 1785693745000 });
    expect(p.per100).toEqual({ ENERCC: 632, FAT: 48, FASAT: 14.2, CHO: 38.4, SUGAR: 32.3, PROT625: 10.1, NA: 124 });
    expect(p.categories.at(-1)).toBe('Nut confectioneries');
    expect(p.perMl).toBeUndefined();
  });

  it('converts vitamins and minerals from grams to BLS units', () => {
    // A fortified soy drink: OFF reports every _100g value in grams.
    const n = parseNutriments({ 'calcium_100g': 0.12, 'vitamin-b12_100g': 3.8e-7, 'vitamin-b6_100g': 0.00021, 'iodine_100g': 2.25e-5, 'vitamin-d_100g': 7.5e-7 });
    expect(n.CA).toBeCloseTo(120);
    expect(n.VITB12).toBeCloseTo(0.38);
    expect(n.VITB6).toBeCloseTo(210); // BLS gives B6 in µg
    expect(n.ID).toBeCloseTo(22.5);
    expect(n.VITD).toBeCloseTo(0.75);
  });

  it('keeps missing values missing and drops impossible ones', () => {
    expect(parseNutriments({ 'energy-kcal_100g': 6320, fat_100g: 480, proteins_100g: -1, fiber_100g: '2,5' })).toEqual({ FIBT: 2.5 });
    expect(parseNutriments(undefined)).toEqual({});
  });

  it('uses kJ when kcal is missing', () => {
    expect(parseNutriments({ 'energy-kj_100g': 418.4 }).ENERCC).toBeCloseTo(100);
  });

  it('marks drinks and needs a name', () => {
    expect(parseProduct({ code: '1', product_name: 'Apfelschorle', product_quantity_unit: 'ml' })!.perMl).toBe(true);
    expect(parseProduct({ code: '1234567890128' })).toBeNull();
  });
});

describe('lookupBarcode', () => {
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('finds a product and sends only the barcode', async () => {
    let url = '';
    const r = await lookupBarcode('4008400121925', (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ product: giotto }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(r.kind === 'found' && r.product.name).toBe('Giotto Haselnuss (9 Stück)');
    expect(url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\/4008400121925\?fields=/);
  });

  it('reports unknown products, busy servers and no connection', async () => {
    expect(await lookupBarcode('4000000000013', respond(404, { result: { id: 'product_not_found' } }))).toEqual({ kind: 'notFound' });
    expect(await lookupBarcode('1234567890128', respond(200, { product: { code: '1234567890128' } }))).toEqual({ kind: 'notFound' });
    expect(await lookupBarcode('1', respond(503, {}))).toEqual({ kind: 'error', reason: 'busy' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await lookupBarcode('1', offline)).toEqual({ kind: 'error', reason: 'offline' });
  });
});
