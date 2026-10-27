import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product } from '../storage/types';
import type { BlsFile } from './blsTypes';
import { buildFoodDb, groupSearchBoost } from './foodDb';
import { autoMatches, bestMatch, bestPairing, ingredientMix, initialChoice, kindMismatch, kindOf, macroSimilarity, mixDetail, withChoice, wantsAutoMatch } from './productMatch';
import { buildIndex } from './search';

const product = (name: string, brand: string, categories: string[], extra: Partial<Product> = {}): Product => ({
  id: `OFF:${name}`,
  schemaVersion: 1,
  source: 'OFF',
  code: '1',
  name,
  brand,
  per100: {},
  categories,
  fetchedAt: 0,
  ...extra,
});

const file = resolve(__dirname, '../../public/data/bls-4.0.json');
describe.runIf(existsSync(file))('pairing products with a similar BLS food', () => {
  const db = buildFoodDb(JSON.parse(readFileSync(file, 'utf8')) as BlsFile);
  const index = buildIndex(db.foods.map((f) => ({ key: f.code, nameEn: f.nameEn, nameDe: f.nameDe })));
  const boost = (key: string) => groupSearchBoost(key.charAt(0));
  const best = (p: Product) => {
    const code = bestMatch(p, index, db, boost);
    return code ? db.byCode.get(code)!.nameEn : undefined;
  };

  it('finds the plain food from categories and the product name, in English or German', () => {
    expect(best(product('GiOTTO Haselnuss', 'Ferrero', ['Snacks', 'Sweet snacks', 'Confectioneries', 'Chocolate candies', 'Filled chocolates', 'Pralines']))).toMatch(/^Pralines/);
    // "Rolled oats" alone has no BLS name; with "Haferflocken" it lands on oat flakes, not sweetened cereal flakes.
    expect(best(product('Bio Haferflocken zart', 'Alnatura', ['Cereals and their products', 'Breakfast cereals', 'Flakes', 'Rolled flakes', 'Cereal flakes', 'Rolled oats']))).toBe('Oat flakes');
    expect(best(product('Milch 1,5%', 'Weihenstephan', ['Dairies', 'Milks', 'Semi-skimmed milks', 'Pasteurised milks']))).toMatch(/1\.5 % fat/);
    expect(best(product('Räucherlachs', 'Gut Bio', ['Seafood', 'Fishes', 'Salmons', 'Smoked fishes', 'Smoked salmons']))).toBe('Salmon smoked');
    expect(best(product('Erdnussbutter Crunchy', 'Ültje', ['Plant-based foods', 'Spreads', 'Nut butters', 'Peanut butters']))).toBe('Peanut butter');
    expect(best(product('Tofu natur', 'Taifun', ['Plant-based foods', 'Legumes', 'Meat alternatives', 'Tofu']))).toBe('Tofu');
  });

  it('checks the label against the candidates, so ready meals get a dish, not chicken fat', () => {
    // Real Open Food Facts products (fetched 2026-10-26); before, the first three got "Chicken fat".
    const meal = (name: string, categories: string[], per100: Product['per100']) => best(product(name, '', categories, { per100 }));
    const chicken = ['Meals', 'Meats and their products', 'Meals with meat', 'poultry-meals', 'Meals with chicken'];
    expect(meal('Indian Style Butter Chicken mit Huhn', [...chicken, 'Butter chicken'], { ENERCC: 144, FAT: 7.1, PROT625: 5.3, CHO: 14.1 })).not.toMatch(/fat/i);
    expect(meal('Mildes Hähnchen Curry', [...chicken, 'Chicken curry'], { FAT: 5.7, PROT625: 7.7, CHO: 8.5 })).toMatch(/curry/i);
    expect(meal('Culinea Nasi Goreng', ['Frozen foods', 'Meals', 'Rice dishes', 'poultry-meals', 'Meals with chicken', 'Microwave meals', 'Nasi goreng'], { FAT: 2.5, PROT625: 5.5, CHO: 13.5 })).toMatch(/^Nasi Goreng/);
    expect(meal('Chili Con Carne', ['Meals', 'Meats and their products', 'Meals with meat', 'Chili con carne'], { FAT: 2.3, PROT625: 6.3, CHO: 10.2 })).toMatch(/^Chilli con carne/);
    expect(meal('Linseneintopf', ['Canned foods', 'Meals', 'Soups', 'Canned meals', 'Canned soups'], { FAT: 0.8, PROT625: 3.4, CHO: 8.6 })).toMatch(/^Lentil stew/);
    expect(meal('Erbsensuppe', ['Meals', 'Soups'], { FAT: 1.6, PROT625: 2.5, CHO: 7.4 })).toMatch(/^Pea soup/);
    // Plain foods keep their match when the label fits.
    expect(meal('Thunfisch im eigenen Saft', ['Seafood', 'Fishes', 'Canned fishes', 'Tunas', 'Canned tunas'], { FAT: 0.9, PROT625: 27.8, CHO: 0 })).toBe('Tuna canned, drained');
  });

  // YOUCOOK Indian Style Butter Chicken (4260334165158), as Open Food Facts read its list on 2026-10-26.
  const butterChicken = product('Indian Style Butter Chicken mit Huhn', 'YOUCOOK', ['Meals', 'Meats and their products', 'Meals with meat', 'poultry-meals', 'Meals with chicken', 'Butter chicken'], {
    per100: { ENERCC: 144, FAT: 7.1, FASAT: 3.9, PROT625: 5.3, CHO: 14.1, SUGAR: 1.7, FIBT: 1.2, NA: 216 },
    ingredients: [
      ['en:rice', 'gegarter Reis', 42],
      ['en:chicken-breast-fillet', 'Hähnchenbrustfilet mariniert', 14.5],
      ['de:gegart', 'gegart', 9.5],
      ['en:tomato', 'Tomaten', 9.5],
      ['en:tomato-puree', 'Tomatenmark', 3.35],
      ['en:paprika-or-bell-pepper', 'Paprika', 2.44],
      ['en:onion', 'Zwiebeln', 1.87],
      ['en:cream', 'Sahne', 1.48],
      ['en:coconut-milk', 'Kokosnussmilchpulver', 1.1],
      ['en:butter', 'Butter', 1],
      ['en:creme-fraiche', 'Crème Fraîche', 0.84],
      ['de:Geflügelbrühe', 'Geflügelbrühe', 0.63],
      ['en:chicken-fat', 'Hühnerfett', 0.62],
      ['en:spice', 'Gewürze', 0.54],
      ['en:sugar', 'Zucker', 0.48],
      ['en:starch', 'Stärke', 0.42],
      ['en:salt', 'Salz', 0.37],
    ].map(([id, text, percent]) => ({ id: id as string, text: text as string, percent: percent as number })),
  });

  it('builds a ready meal from its ingredient list, with cooked rice because the label says 144 kcal', () => {
    const parts = ingredientMix(butterChicken, db)!;
    expect(parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(100, 0);
    const name = (code: string) => db.byCode.get(code)!.nameEn;
    expect(name(parts[0]!.code)).toBe('White rice boiled');
    expect(parts[0]!.share).toBeGreaterThan(45);
    expect(parts.map((p) => name(p.code))).toContain('Chicken breast fillet, raw');
    const detail = mixDetail(butterChicken, parts);
    expect(detail.rows[0]!.texts).toEqual(['gegarter Reis']);
    expect(detail.leftOut.texts).toEqual(['gegart', 'Geflügelbrühe', 'Gewürze']);
    // A dish with an ingredient list gets the mix rather than one similar food.
    expect(bestPairing(butterChicken, index, db, boost)).toEqual({ code: parts[0]!.code, parts });
    // Too little known, or no list: no mix.
    expect(ingredientMix({ ...butterChicken, ingredients: butterChicken.ingredients!.filter((i) => i.id !== 'en:rice') }, db)).toBeUndefined();
    expect(ingredientMix({ ...butterChicken, ingredients: undefined }, db)).toBeUndefined();
    // A mix whose make-up does not fit the label (all rice, labelled as pure fat) is no mix.
    expect(ingredientMix({ per100: { FAT: 100, PROT625: 0, CHO: 0 }, ingredients: [{ id: 'en:rice', text: 'Reis', percent: 100 }] }, db)).toBeUndefined();
  });

  it('keeps a single food for plain products whose one food fits better, and saves a mix as the choice', () => {
    const tuna = product('Thunfisch im eigenen Saft', '', ['Seafood', 'Fishes', 'Canned fishes', 'Tunas', 'Canned tunas'], {
      per100: { ENERCC: 119, FAT: 0.9, PROT625: 27.8, CHO: 0 },
      ingredients: [{ id: 'en:tuna', text: 'Thunfisch', percent: 77, declared: true }, { id: 'en:water', text: 'Wasser', percent: 0.6 }, { id: 'en:salt', text: 'Speisesalz', percent: 0.6 }],
    });
    expect(bestPairing(tuna, index, db, boost)?.parts).toBeUndefined();
    const choice = initialChoice(butterChicken, db, index, boost);
    expect(choice.parts).toBeDefined();
    const saved = withChoice(butterChicken, choice, '4.0');
    expect(saved.match).toMatchObject({ code: choice.food!.code, parts: choice.parts, auto: true });
    expect(initialChoice(saved, db, index, boost)).toEqual(choice);
    // An earlier single pick of the app's is replaced by the mix; the same mix again changes nothing.
    const old = { ...butterChicken, match: { version: '4.0', code: 'Q830000', auto: true as const } };
    expect(autoMatches([old], index, db, boost)[0]!.match.parts).toEqual(choice.parts);
    expect(autoMatches([saved], index, db, boost)).toEqual([]);
  });

  it('compares fat, protein and carbohydrate', () => {
    expect(macroSimilarity({ FAT: 7.1, PROT625: 5.3, CHO: 14.1 }, { FAT: 100, PROT625: 't', CHO: 0 })).toBeCloseTo(1 - 112.3 / 126.5);
    expect(macroSimilarity({ FAT: 1, PROT625: 2, CHO: 3 }, { FAT: 1, PROT625: 2, CHO: 3 })).toBe(1);
    // Too few of them on the label: energy decides, else no say.
    expect(macroSimilarity({ ENERCC: 42, CHO: 3 }, { ENERCC: 250, FAT: 20, PROT625: 15, CHO: 0 })).toBeCloseTo(1 - 208 / 292);
    expect(macroSimilarity({ CHO: 3 }, { FAT: 1, PROT625: 2 })).toBe(1);
  });

  it('pairs beer with a BLS beer, never with beer ham or Bierwurst', () => {
    // Real Open Food Facts products (fetched 2026-10-27); "Helles" first got light pork tongue sausage.
    const beer = (name: string, brand: string, categories: string[], per100: Product['per100']) => best(product(name, brand, categories, { per100 }));
    const german = ['Beverages', 'Alcoholic beverages', 'Beers', 'Country specific beers', 'Beers from Germany'];
    expect(beer('Oettinger Helles', 'Oettinger', [...german, 'Bavarian beers'], { ENERCC: 42, CHO: 3 })).toBe('Pale beer');
    expect(beer('Pils', "Beck's", german, { ENERCC: 38, FAT: 0.01, PROT625: 0.37, CHO: 2.2 })).toBe('Pilsner beer');
    expect(beer('Sternburg Export', 'Sternburg', german, { ENERCC: 41, FAT: 0, PROT625: 0.5, CHO: 2.1 })).toBe('Pale export beer');
    expect(beer('Paulaner Weissbier', 'Paulaner', ['Beverages', 'Alcoholic beverages', 'Beers', 'Lagers', 'Wheat beers', 'Beers from Germany'], { ENERCC: 42, CHO: 3.2 })).toMatch(/^Wheat beer/);
    // No beer fits: nothing, rather than something else with "beer" in its name.
    expect(beer('Beers', '', ['Beverages', 'Alcoholic beverages', 'Beers'], { ENERCC: 250, FAT: 20, PROT625: 15, CHO: 0 })).toBeUndefined();
  });

  it('pairs a product only with the same kind of food: drinks with drinks, fish and meat only with fish and meat', () => {
    // Real Open Food Facts products (fetched 2026-10-27), each first paired with another kind of food (in the comment).
    const pick = (name: string, brand: string, categories: string[], per100: Product['per100']) => best(product(name, brand, categories, { per100 }));
    const plant = ['Plant-based foods and beverages', 'Plant-based foods'];
    const tomato = [...plant, 'Fruits and vegetables based foods', 'Vegetable-based foods and beverages', 'Condiments', 'Vegetables based foods', 'Tomatoes and their products', 'Sauces'];
    // Smoked carp.
    expect(pick('Räuchertofu Black Forest', 'Taifun', [...plant, 'Legumes and their products', 'Meat alternatives', 'Meat analogues', 'Tofu', 'Smoked tofu'], { ENERCC: 170, FAT: 8.4, PROT625: 19, CHO: 3.8 }) ?? '').not.toMatch(/carp|fish|beef|pork/i);
    // Mackerel in tomato sauce, then common mussel in tomato sauce.
    expect(pick("Caviar de Tomates à l'Ail", 'Saclà', [...tomato, 'Canned foods', 'Tomato sauces', 'Tomato purées', 'Tomato caviar', 'Groceries'], { ENERCC: 189, FAT: 15.9, PROT625: 2.2, CHO: 7.5 }) ?? '').not.toMatch(/mackerel/i);
    expect(pick('Marinara', "Rao's Homemade", [...tomato, 'Pasta sauces', 'Tomato sauces', 'Groceries'], { ENERCC: 80, FAT: 5.6, PROT625: 1.6, CHO: 4.8 })).toMatch(/^Tomato sauce/);
    // Ginger ale.
    expect(pick('Gingembre confit', 'Seeberger', [...plant, 'Snacks', 'Condiments', 'Sweet snacks', 'Confectioneries', 'Dried products', 'Herbs and spices', 'Spices', 'Candied fruits', 'Dried fruits', 'Ginger', 'Crystallized ginger'], { ENERCC: 32, FAT: 0, PROT625: 0, CHO: 8 })).toMatch(/^Ginger root/);
    // Multi-fruit juice: a supplement's label is all there is.
    expect(pick('Multivitamin', 'Mivolis', ['Dietary supplements', 'Mineral supplements', 'Vitamin supplements', 'Flavoured dietary supplements', 'Multivitamin and mineral supplements'], { ENERCC: 214, FAT: 0.5, PROT625: 0.5, CHO: 17 })).toBeUndefined();
    // Drinks keep their drinks, in whatever BLS group; instant coffee and milk (not filed as drinks) too.
    const drinks = ['Beverages and beverages preparations', 'Beverages'];
    expect(pick('Bio Hafermilch', 'Lidl', [...drinks, ...plant, 'Dairy substitutes', 'Milk substitutes', 'Plant-based beverages', 'Cereal-based drinks', 'Oat-based drinks'], { ENERCC: 33, FAT: 1.5, PROT625: 0.6, CHO: 3.7 })).toBe('Oat drink unsweetened');
    expect(pick('Coca-Cola Original', 'Coca-Cola', [...drinks, 'Carbonated drinks', 'Sodas', 'Colas', 'Sweetened beverages'], { ENERCC: 42, FAT: 0, PROT625: 0, CHO: 10.6 })).toBe('Cola beverage caffeinated');
    expect(pick('Nescafé classic natural', 'Nestlé', ['Beverages and beverages preparations', ...plant, 'Beverage preparations', 'Instant beverages', 'Coffees', 'Instant coffees'], { ENERCC: 2, FAT: 0, PROT625: 0.2, CHO: 0.1 })).toMatch(/^Coffee/);
    expect(pick('Latte parzialmente scremato', 'Arborea', ['Dairies', 'Milks (liquid and powder)', 'Milks'], { ENERCC: 47, FAT: 1.55, PROT625: 3.3, CHO: 4.9 })).toMatch(/milk/i);
  });

  it('tells why a BLS food is another kind of food', () => {
    const food = (code: string) => db.byCode.get(code)!;
    const drink = kindOf(product('Hafer Drink', '', ['Beverages', 'Plant-based beverages', 'Oat-based drinks']));
    expect(drink.drink).toBe('drink');
    expect(kindMismatch(drink, food('C660000'))).toBeUndefined(); // Oat drink
    expect(kindMismatch(drink, food('G950900'))).toBe('drink'); // Vegetarian goulash
    const tofu = kindOf(product('Räuchertofu', '', ['Plant-based foods', 'Meat alternatives', 'Tofu', 'Smoked tofu']));
    expect(kindMismatch(tofu, food('T501600'))).toBe('fish'); // Carp smoked
    expect(kindMismatch(tofu, food('H861000'))).toBeUndefined(); // Tofu
    const sausage = kindOf(product('Leberwurst fein', '', ['Meats', 'Prepared meats', 'Sausages']));
    expect(kindMismatch(sausage, food('W327000'))).toBeUndefined();
    expect(kindMismatch(sausage, food('P161000'))).toBe('food'); // Pale beer
    expect(kindMismatch(kindOf(product('Pesto', '', ['Sauces', 'Pestos'])), food('T832900'))).toBe('fish'); // Common mussel in tomato sauce
    expect(kindMismatch(kindOf(product('Pesto', '', ['Sauces', 'Pestos'])), food('E901000'))).toBe('meat'); // Ravioli (meat filling)
    // No categories: nothing is known, nothing is ruled out.
    expect(kindMismatch(kindOf(product('Thing', '', [])), food('T501600'))).toBeUndefined();
  });

  it('picks nothing when nothing fits well enough', () => {
    expect(best(product('Whey Protein Vanilla', 'ESN', ['Dietary supplements', 'Bodybuilding supplements', 'Protein powders']))).toBeUndefined();
    expect(best(product('Protein Pudding Schoko', 'Ehrmann', []))).toBeUndefined();
  });

  it('pairs only products that have no similar food and no "label only"', () => {
    const giotto = product('GiOTTO Haselnuss', 'Ferrero', ['Pralines']);
    const chosen = product('Pralinen', '', ['Pralines'], { id: 'OFF:2', match: { version: '4.0', code: 'S610000' } });
    const labelOnly = product('Pralinen', '', ['Pralines'], { id: 'OFF:3', labelOnly: true });
    const usda = product('Pralines', '', ['Pralines'], { id: 'USDA:4', source: 'USDA', usdaType: 'SR Legacy' });
    // The app's own unchecked pick is looked at again (a better matcher replaces old guesses), but only changes when the pick does.
    const oldGuess = product('GiOTTO Haselnuss', 'Ferrero', ['Pralines'], { id: 'OFF:5', match: { version: '4.0', code: 'Q830000', auto: true } });
    const sameGuess = { ...giotto, id: 'OFF:6', match: { version: '4.0', code: bestMatch(giotto, index, db, boost)!, auto: true as const } };
    expect([giotto, chosen, labelOnly, usda, oldGuess].map(wantsAutoMatch)).toEqual([true, false, false, false, true]);
    const picks = autoMatches([giotto, chosen, labelOnly, usda, oldGuess, sameGuess], index, db, boost);
    expect(picks.map((p) => p.id)).toEqual([giotto.id, oldGuess.id]);
    expect(picks[0]).toMatchObject({ id: giotto.id, match: { version: '4.0' } });
  });

  it('starts sheets from the saved choice, else the app pick, and saves the choice back', () => {
    const giotto = product('GiOTTO Haselnuss', 'Ferrero', ['Pralines']);
    const pick = initialChoice(giotto, db, index, boost);
    expect(pick.auto).toBe(true);
    expect(pick.food?.nameEn).toMatch(/^Pralines/);
    expect(withChoice(giotto, pick, '4.0').match).toEqual({ version: '4.0', code: pick.food!.code, auto: true });
    // The user picks one: no longer the app's guess.
    expect(withChoice(giotto, { food: pick.food!, auto: false }, '4.0').match).toEqual({ version: '4.0', code: pick.food!.code });
    // The user chooses none: remembered, so the app does not pair it again.
    const none = withChoice(giotto, { auto: false }, '4.0');
    expect(none.match).toBeUndefined();
    expect(none.labelOnly).toBe(true);
    expect(initialChoice(none, db, index, boost)).toEqual({ auto: false });
    const saved = withChoice(giotto, { food: db.byCode.get('S361000')!, auto: false }, '4.0');
    expect(initialChoice(saved, db, index, boost)).toEqual({ food: db.byCode.get('S361000'), auto: false });
  });
});
