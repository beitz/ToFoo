import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

// Owner's ask 2026-11-13: track readings from an upper-arm cuff, two a minute apart, morning and evening.
test('blood pressure: two readings from Home, the average and its page, edit with undo', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  const toggle = page.getByRole('switch', { name: /^Blood pressure/ });
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.goto('./#/');
  const card = page.locator('[data-tour="home.bp"]');
  await expect(card).toContainText('No readings in the last 7 days');
  await card.getByRole('button', { name: 'Log blood pressure' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log blood pressure' });
  await sheet.getByRole('textbox', { name: /Systolic/ }).fill('132');
  await sheet.getByRole('textbox', { name: /Diastolic/ }).fill('86');
  await sheet.getByRole('textbox', { name: /Pulse/ }).fill('64');
  await sheet.getByRole('button', { name: 'Second reading' }).click();
  // Swapped numbers are caught before saving.
  await sheet.getByRole('textbox', { name: 'Systolic, mmHg 2' }).fill('80');
  await sheet.getByRole('textbox', { name: 'Diastolic, mmHg 2' }).fill('128');
  await expect(sheet.getByRole('alert')).toContainText('swapped');
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Systolic, mmHg 2' }).fill('128');
  await sheet.getByRole('textbox', { name: 'Diastolic, mmHg 2' }).fill('82');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Blood pressure 132/86, 128/82 saved.')).toBeVisible();

  // The average of the two, with its category in words; one day is too few to go by.
  await expect(card).toContainText('130/84');
  await expect(card).toContainText('Raised');
  await expect(card).toContainText('too few to go by yet');

  await card.getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/blood-pressure$/);
  await expect(page.locator('[data-tour="bp.average"]')).toContainText('130/84');
  await expect(page.locator('[data-tour="bp.average"]')).toContainText('pulse 64');
  await expect(page.locator('[data-tour="bp.lines"] .is-mine')).toContainText('Raised');

  // Change a reading, then undo.
  await page.locator('[data-tour="bp.readings"]').getByRole('button', { name: /128\/82/ }).click();
  const edit = page.getByRole('dialog', { name: 'Change reading' });
  await edit.getByRole('textbox', { name: /Systolic/ }).fill('124');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('[data-tour="bp.average"]')).toContainText('128/84');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-tour="bp.average"]')).toContainText('130/84');

  // A very high reading asks to measure again.
  await page.getByRole('button', { name: 'Add' }).first().click();
  const add = page.getByRole('dialog', { name: 'Log blood pressure' });
  await add.getByRole('textbox', { name: /Systolic/ }).fill('186');
  await add.getByRole('textbox', { name: /Diastolic/ }).fill('112');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Your last reading was very high: 186/112.')).toBeVisible();

  // On the Insights overview, with its strip.
  await page.goto('./#/overview');
  await expect(page.getByRole('link', { name: /Blood pressure/ })).toBeVisible();
  expect(errors).toEqual([]);
});
