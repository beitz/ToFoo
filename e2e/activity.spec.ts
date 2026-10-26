import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

async function openActivitySheet(page: Page) {
  await page.goto('./#/');
  await page.locator('[data-tour="round-button"]').click();
  await page.getByRole('group', { name: 'Quick actions' }).getByRole('button', { name: 'Log activity' }).click();
  return page.getByRole('dialog', { name: 'Add activity' });
}

// Owner's ask 2026-10-26: the same activity logged again and again.
test('activities logged before come back as Recent, and a star keeps one as a favourite', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  const toggle = page.getByRole('switch', { name: /^Activity/ });
  if (!(await toggle.isChecked())) await toggle.click();
  await expect(toggle).toBeChecked();

  // Nothing logged yet: no section.
  let sheet = await openActivitySheet(page);
  await expect(sheet.getByText('Favourites and recent')).toHaveCount(0);
  await sheet.getByRole('radio', { name: 'Cycling' }).click();
  await sheet.getByLabel('Name (optional)').fill('Commute');
  await sheet.getByLabel('How long').fill('25');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);

  // Next time it is one tap away, with its minutes.
  sheet = await openActivitySheet(page);
  const row = sheet.getByRole('button', { name: /^Commute/ });
  await expect(row).toContainText('25 min · Moderate · outside · 1× in 4 weeks');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByLabel('Name (optional)')).toHaveValue('Commute');
  await expect(sheet.getByLabel('How long')).toHaveValue('25');
  await expect(sheet.getByRole('radio', { name: 'Cycling' })).toBeChecked();

  // The star keeps it as a favourite, which leaves Recent.
  await sheet.getByRole('button', { name: 'Add to favourites: Commute' }).click();
  await expect(sheet.getByRole('button', { name: 'Remove from favourites: Commute' })).toBeVisible();
  await expect(row).toContainText('25 min · Moderate · outside');
  await expect(row).not.toContainText('in 4 weeks');
  expect(errors).toEqual([]);
});
