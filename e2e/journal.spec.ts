import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

test('a private journal entry is marked and its words stay off the overview', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  const journal = page.getByRole('switch', { name: /^Journal/ });
  if (!(await journal.isChecked())) await journal.click();
  await expect(journal).toBeChecked();

  await page.goto('./#/journal/new');
  await page.getByRole('textbox', { name: /Write anything/ }).fill('Something only for me');
  await page.getByRole('switch', { name: /^Private/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.getByRole('button', { name: /Something only for me/ });
  await expect(row).toContainText('Private');

  // Editing keeps the mark until it is switched off.
  await row.click();
  await expect(page.getByRole('dialog').getByRole('switch', { name: /^Private/ })).toBeChecked();
  await page.getByRole('dialog').getByRole('switch', { name: /^Private/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row).not.toContainText('Private');

  await row.click();
  await page.getByRole('dialog').getByRole('switch', { name: /^Private/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.goto('./#/overview');
  await expect(page.getByText('1 this week', { exact: true })).toBeVisible();
  await expect(page.getByText('Something only for me')).toHaveCount(0);
  expect(errors).toEqual([]);
});
