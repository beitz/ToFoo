import { expect, test } from '@playwright/test';
import { firstLaunch, todayKcal, watchErrors } from './helpers';

test('a recipe is saved, cooked as a batch, eaten and stored', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);

  await page.goto('./#/recipes/new');
  await page.getByPlaceholder('Linsencurry').fill('Test dal');
  await page.getByPlaceholder('Add ingredient').fill('lentils');
  await page.getByRole('button', { name: /^Lentil mature/ }).first().click();
  await page.getByLabel('Amount').fill('250');
  await page.getByRole('button', { name: 'Save' }).click();
  // The recipe page: four portions of 250 g dried lentils, about 200 kcal each.
  await expect(page.getByRole('link', { name: /^kcal/ })).toBeVisible();

  await page.getByRole('button', { name: 'Cook a batch' }).click();
  await page.getByRole('button', { name: 'Next: Cook' }).click();
  await page.getByRole('button', { name: 'Next: Weigh & split' }).click();
  await page.getByRole('button', { name: 'Next: Store' }).click();
  await page.getByRole('button', { name: /^Done · eat 1 now, store 3/ }).click();
  await expect(page.getByRole('button', { name: /3 of 4 left/ })).toBeVisible();

  const kcal = await todayKcal(page);
  expect(kcal).toBeGreaterThan(150);
  expect(kcal).toBeLessThan(250);

  await page.goto('./#/kitchen');
  const main = page.locator('main');
  await expect(main).toContainText('Fridge');
  await expect(main.getByText('Test dal')).toHaveCount(2); // one portion in the fridge, two in the freezer
  expect(errors).toEqual([]);
});

// What Open Food Facts answers for a small spice jar (made up in the shape of a real response).
const PAPRIKA = {
  code: '4002674044201',
  status: 'success',
  product: {
    code: '4002674044201',
    product_name: 'Paprika edelsüß',
    brands: 'Ostmann',
    quantity: '12,5 g',
    categories_tags_en: ['Condiments', 'Spices', 'Paprika'],
    nutriments: { 'energy-kcal_100g': 330, fat_100g: 13, 'saturated-fat_100g': 2, carbohydrates_100g: 19, sugars_100g: 10, fiber_100g: 35, proteins_100g: 14, salt_100g: 0.1 },
    last_modified_t: 1787068844,
  },
};

test('a scanned spice jar is counted in exact grams', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => route.fulfill({ json: PAPRIKA }));
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  const toggle = page.getByRole('switch', { name: /^Open Food Facts lookup/ });
  await toggle.click();
  await expect(toggle).toBeChecked();

  // Scanned into the spices: it starts at the jar's weight, not at one piece.
  await page.goto('./#/kitchen');
  await page.getByRole('button', { name: 'Add to Spices and herbs' }).click();
  await page.locator('.card-add-box').getByRole('button', { name: 'Scan a barcode' }).click();
  await page.getByLabel('Barcode number').fill(PAPRIKA.code);
  await page.getByRole('button', { name: 'Look up' }).click();
  const row = page.locator('.home-row', { hasText: 'Paprika edelsüß' });
  await expect(row).toContainText('12.5 g');
  // A small tag says it is an Open Food Facts product, paired with a BLS food or by its label alone.
  await expect(row).toContainText(/OFF (\+ BLS|· label only)/);

  // Counted again as one jar, then back to grams with one tap, then what is really left.
  await row.click();
  const amount = page.getByLabel('How much is left');
  await expect(amount).toHaveValue('12.5 g');
  await amount.fill('1');
  await page.getByRole('button', { name: 'Count in grams: 12.5 g' }).click();
  await expect(amount).toHaveValue('12.5 g');
  await amount.fill('8,5 g');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(row).toContainText('8.5 g');
  expect(errors).toEqual([]);
});

// Bay leaves are not in the BLS (owner's search for "Lorbeerblatt", 2026-10-26); Open Food Facts has jars of them.
const BAY = {
  code: '4002674102215',
  status: 'success',
  product: {
    code: '4002674102215',
    product_name: 'Lorbeerblätter',
    brands: 'Ostmann',
    quantity: '5 g',
    categories_tags_en: ['Condiments', 'Spices', 'Bay leaves'],
    nutriments: { 'energy-kcal_100g': 313, fat_100g: 8.4, carbohydrates_100g: 48.7, proteins_100g: 7.6, salt_100g: 0.06 },
    last_modified_t: 1787068844,
  },
};

test('a spice missing from the food database is found as a product, or kept by its name', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => route.fulfill({ json: BAY }));
  await firstLaunch(page);

  // Without Open Food Facts: nothing matches, the app says the name works on its own, and it goes with the spices.
  await page.goto('./#/kitchen');
  const add = page.getByPlaceholder('Add what you bought');
  await add.fill('Wacholderbeeren');
  await expect(page.getByText(/Not in the food lists/)).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const main = page.locator('main');
  await expect(main.locator('.home-row', { hasText: 'Wacholderbeeren' })).toContainText('No food linked');

  // With it: the bundled product list offers the jar, and picking it counts the jar's grams.
  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  await page.getByRole('switch', { name: /^Open Food Facts lookup/ }).click();
  await page.goto('./#/kitchen');
  await add.fill('Lorbeerblatt');
  await page.getByRole('button', { name: /^Lorbeerblätter.*Ostmann/ }).click();
  await expect(main.locator('.home-row', { hasText: 'Lorbeerblätter' })).toContainText('5 g');
  expect(errors).toEqual([]);
});

test('marking something used up leaves the shopping list to the user', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);

  await page.goto('./#/kitchen');
  await page.getByPlaceholder('Add what you bought').fill('Wacholderbeeren');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const main = page.locator('main');
  await main.locator('.home-row', { hasText: 'Wacholderbeeren' }).click();
  await page.getByRole('radio', { name: 'Used up' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  // Used up shows in the kitchen, and nothing went on the list by itself (owner, 2026-10-26).
  await expect(main.getByRole('heading', { name: 'Used up (1)' })).toBeVisible();
  await page.goto('./#/shopping');
  await expect(page.locator('main').getByText('Wacholderbeeren')).toHaveCount(0);

  // One tap in its sheet puts it on the list.
  await page.goto('./#/kitchen');
  await main.locator('.home-row', { hasText: 'Wacholderbeeren' }).click();
  await page.getByRole('button', { name: 'Add to shopping list' }).click();
  await expect(page.getByText('On the shopping list', { exact: true })).toBeVisible();
  await page.goto('./#/shopping');
  await expect(page.locator('main').getByText('Wacholderbeeren')).toBeVisible();

  // The bin on the Used up card clears it, with undo.
  await page.goto('./#/kitchen');
  await page.getByRole('button', { name: 'Remove everything used up' }).click();
  await expect(main.getByRole('heading', { name: /^Used up/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(main.getByRole('heading', { name: 'Used up (1)' })).toBeVisible();
  expect(errors).toEqual([]);
});
