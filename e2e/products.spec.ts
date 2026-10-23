import { expect, test } from '@playwright/test';
import { firstLaunch, todayKcal, watchErrors } from './helpers';

// What Open Food Facts answers for PiCK UP! Choco minis (trimmed from a real response, 2026-10-23).
const PICK_UP = {
  code: '4017100406218',
  status: 'success',
  product: {
    code: '4017100406218',
    product_name: 'PiCK UP ! Choco minis - 127g',
    brands: 'Leibniz, PiCK UP !',
    quantity: '127 g',
    categories_tags_en: ['Snacks', 'Sweet snacks', 'Biscuits', 'Chocolate biscuits'],
    nutriments: { 'energy-kcal_100g': 510, fat_100g: 25, 'saturated-fat_100g': 14, carbohydrates_100g: 63, sugars_100g: 33, fiber_100g: 3.1, proteins_100g: 6.6, salt_100g: 0.48 },
    last_modified_t: 1787068844,
  },
};

test('a packaged product is found by name and logged after its barcode lookup', async ({ page }) => {
  const errors = watchErrors(page);
  // The search itself runs on the phone; only picking a product asks Open Food Facts, by barcode.
  const lookups: string[] = [];
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => {
    lookups.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: PICK_UP });
  });
  await firstLaunch(page);

  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  // The setting is saved first and shown after, so click and wait rather than check(). USDA too: its
  // button once shared a key with the product list, and old lists piled up while typing.
  for (const name of [/^Open Food Facts lookup/, /^USDA FoodData Central/]) {
    const toggle = page.getByRole('switch', { name });
    await toggle.click();
    await expect(toggle).toBeChecked();
  }

  await page.goto('./#/log');
  await page.getByPlaceholder('Search foods').pressSequentially('pick up', { delay: 50 });
  await expect(page.getByRole('heading', { name: 'Packaged products · Open Food Facts' })).toBeVisible();
  await expect(page.locator('.off-results')).toHaveCount(1);
  expect(lookups).toEqual([]);

  // The most-scanned Pick Up comes first; whichever it is, the fake answer above is the Choco minis.
  const first = page.locator('.off-results').getByRole('button').first();
  await expect(first).toHaveText(/pick ?up/i);
  await first.click();
  await expect.poll(() => lookups).toHaveLength(1);
  await page.getByRole('button', { name: '100 g' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => todayKcal(page)).toBe(510);
  expect(errors).toEqual([]);
});
