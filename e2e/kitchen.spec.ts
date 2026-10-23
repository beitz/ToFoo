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
