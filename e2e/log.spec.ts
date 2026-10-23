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

  await page.goto('./#/diary');
  await expect(page.getByText('Oat flakes').first()).toBeVisible();

  await page.goto('./#/');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => todayKcal(page)).toBe(0);
  expect(errors).toEqual([]);
});
