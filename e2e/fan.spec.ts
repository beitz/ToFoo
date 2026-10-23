import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

// Afternoon in Germany: the sleep action once showed only from 18:00 to 4:00, and looked missing by day.
test.use({ timezoneId: 'Europe/Berlin' });

/** Turns on the given trackers under Settings → What you track. */
async function turnOn(page: import('@playwright/test').Page, names: string[]): Promise<void> {
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  for (const name of names) {
    const toggle = page.getByRole('switch', { name: new RegExp(`^${name}`) });
    // Saved first and shown after, so click and wait rather than check().
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();
  }
}

test('the round button lists every tracker that is on, at any hour', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T14:40:00+02:00'));
  const errors = watchErrors(page);
  await firstLaunch(page);
  await turnOn(page, ['Journal', 'Sleep', 'Activity', 'Fasting']);

  await page.goto('./#/');
  await page.locator('[data-tour="round-button"]').click();
  const fan = page.getByRole('group', { name: 'Quick actions' });
  for (const label of ['Write in journal', 'Going to sleep', 'Log activity', 'Start fast', /^Assistant/]) {
    await expect(fan.getByRole('button', { name: label })).toBeVisible();
  }

  // Going to sleep turns into I'm up while the sleep runs.
  await fan.getByRole('button', { name: 'Going to sleep' }).click();
  await page.locator('[data-tour="round-button"]').click();
  await expect(fan.getByRole('button', { name: "I'm up" })).toBeVisible();
  expect(errors).toEqual([]);
});

test('trackers that are off stay out of the round button', async ({ page }) => {
  await firstLaunch(page);
  await page.locator('[data-tour="round-button"]').click();
  const fan = page.getByRole('group', { name: 'Quick actions' });
  await expect(fan.getByRole('button', { name: /^Assistant/ })).toBeVisible();
  for (const label of ['Going to sleep', 'Log activity', 'Start fast']) {
    await expect(fan.getByRole('button', { name: label })).toHaveCount(0);
  }
});
