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
  'nutrient/PROT625/foods',
  'food/C133000',
  'fasting',
  'settings',
  'settings/profile',
  'settings/backup',
  'settings/nutrients',
  'settings/assistant',
  'settings/diagnostics',
  'about',
  'about/sent',
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
