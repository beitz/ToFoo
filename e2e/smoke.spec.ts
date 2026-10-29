import { expect, test } from '@playwright/test';
import { firstLaunch, logFood, watchErrors } from './helpers';

/** Every main screen opens without crashing, with one meal in the log so the screens have something to show. */
const ROUTES = [
  '',
  'log',
  'diary',
  'insights',
  'overview',
  'calendar',
  'week',
  'kitchen',
  'recipes',
  'athome',
  'shopping',
  'nutrient/FE',
  'nutrient/K',
  'nutrient/K/why',
  'nutrient/PROT625/today',
  'nutrient/PROT625/foods',
  'food/C133000',
  'fasting',
  'weight',
  'habits',
  'habits/new',
  'settings',
  'settings/profile',
  'settings/backup',
  'settings/check',
  'settings/nutrients',
  'settings/assistant',
  'settings/diagnostics',
  'about',
  'about/sent',
  'about/versions',
];

test('every main screen opens without an error', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  for (const route of ROUTES) {
    await test.step(route || 'home', async () => {
      await page.goto(`./#/${route}`);
      await expect(page.locator('main, .app').first()).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: /went wrong|error/i })).toHaveCount(0);
      expect(errors, `uncaught errors on #/${route}`).toEqual([]);
    });
  }
});

test('the round button fans out, and a second tap opens Log meal and stays there', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  const round = page.locator('[data-tour="round-button"]');
  await round.click();
  await expect(round).toHaveAttribute('aria-expanded', 'true');
  await round.click();
  await expect(page.getByPlaceholder('Search foods')).toBeVisible();
  // The fan's history entry must not take the user back to Home once Log meal is open.
  await page.waitForTimeout(300);
  expect(new URL(page.url()).hash).toBe('#/log');
  expect(errors).toEqual([]);
});

test('Home shows the app version, and About can check for a newer one', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  const version = page.getByRole('link', { name: /^ToFoo \d+\.\d+\.(\d+|dev)$/ });
  await expect(version).toBeVisible();
  await version.click();
  await expect(page.getByText(/^App version:/)).toBeVisible();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByRole('status')).toHaveText(/newest version|only be checked/);
  expect(errors).toEqual([]);
});
