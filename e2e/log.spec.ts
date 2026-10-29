import { expect, test } from '@playwright/test';
import { firstLaunch, logFood, todayKcal, watchErrors } from './helpers';

test('a new user logs a food, sees it on Home and in the diary, and can undo it', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  expect(await todayKcal(page)).toBe(0);

  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  // BLS 4.0 oat flakes: about 350 kcal per 100 g.
  const kcal = await todayKcal(page);
  expect(kcal).toBeGreaterThan(300);
  expect(kcal).toBeLessThan(400);

  // Home's energy is today so far, and a tap on it opens today only, not the last days' average.
  await page.locator('.today-big').click();
  await expect(page).toHaveURL(/#\/nutrient\/ENERCC\/today$/);
  await expect(page.getByText('Today only, so far')).toBeVisible();

  await page.goto('./#/diary');
  await expect(page.getByText('Oat flakes').first()).toBeVisible();

  await page.goto('./#/');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => todayKcal(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('a food is logged in pieces once its piece weight is known, and the diary shows the count', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/log');
  await page.getByPlaceholder('Search foods').fill('oat flakes');
  await page.getByRole('button', { name: /^Oat flakes/ }).first().click();
  await page.getByRole('radio', { name: 'Pieces' }).click();
  // No weight known yet: the sheet asks for it, here from a pack of 500 g with 50 pieces.
  await page.getByLabel('Whole pack').fill('500');
  await page.getByLabel('Pieces in it').fill('50');
  await expect(page.getByLabel('One piece weighs')).toHaveValue('10');
  await page.getByRole('button', { name: 'Save piece weight' }).click();
  await expect(page.getByText('1 piece = 10 g (yours)')).toBeVisible();
  await page.getByRole('button', { name: '3 pieces' }).click();
  await expect(page.getByText('30 g in all')).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await page.goto('./#/diary');
  await expect(page.getByText('3 pieces · 30 g').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a food logged earlier is pinned and put in the freezer from its diary item', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');

  await page.goto('./#/diary');
  await page.getByRole('link', { name: /Oat flakes/ }).first().click();
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Favourite', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to kitchen' }).click();
  await page.getByRole('radio', { name: 'Freezer' }).click();
  await page.getByLabel('How much (optional)').fill('500 g');
  await page.getByRole('button', { name: 'Add to kitchen' }).last().click();
  // The button now says it is at home, and how much.
  await expect(page.getByRole('button', { name: /^At home · 500 g/ })).toBeVisible();

  await page.goto('./#/log');
  await expect(page.locator('#log-favourites').getByText(/^Oat flakes/).first()).toBeVisible();
  await page.goto('./#/kitchen');
  await expect(page.getByText(/Oat flakes/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
