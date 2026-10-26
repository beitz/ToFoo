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
