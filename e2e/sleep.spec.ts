import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

// Owner's ask 2026-11-03: "When you slept" opens every day with the times of each sleep and the total.
test('When you slept opens a day-by-day page with the times of each sleep', async ({ page }) => {
  const errors = watchErrors(page);
  // In the morning: a sleep ending from 18:00 on belongs to the next day, which the page doesn't show yet.
  const morning = new Date();
  morning.setHours(9, 0, 0, 0);
  await page.clock.install({ time: morning });
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  const toggle = page.getByRole('switch', { name: /^Sleep/ });
  if (!(await toggle.isChecked())) await toggle.click();
  await expect(toggle).toBeChecked();

  // A night ending now (the sheet's default: the last 8 hours).
  await page.goto('./#/diary');
  await page.getByRole('button', { name: 'Sleep', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add sleep' });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);

  await page.goto('./#/nights');
  // Owner's ask 2026-11-13: the hours read as plain numbers ("22", "0", "6") over guide lines, with the hours the sun is up shaded.
  const ticks = await page.locator('.nights-axis-ticks > span').allInnerTexts();
  expect(ticks.length).toBeGreaterThanOrEqual(6);
  for (const tick of ticks) expect(tick).toMatch(/^\d{1,2}$/);
  expect(ticks).toContain('0');
  await expect(page.locator('.nights-row').first().locator('.nights-daylight').first()).toBeVisible();
  await expect(page.locator('.nights-row').first().locator('.nights-grid.is-midnight')).toHaveCount(1);
  // Owner's ask 2026-11-13: a normal night to compare with, off until tapped.
  await expect(page.locator('.nights-normal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare with a normal night' }).click();
  await expect(page.getByRole('img', { name: /^A normal night: 7 to 9 hours in one stretch/ })).toBeVisible();
  await page.getByRole('link', { name: 'When you slept' }).click();
  await expect(page).toHaveURL(/#\/nights\/days$/);
  await expect(page.getByRole('heading', { name: 'When you slept', level: 1 })).toBeVisible();
  const row = page.locator('.nights-row').first();
  await expect(row.locator('.nights-times')).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/);
  await expect(row.locator('.nights-total')).toContainText('8 h');

  // Back returns to the sleep page.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/nights$/);
  expect(errors).toEqual([]);
});
