import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

// Owner's ask 2026-11-19: "I usually drink only from my Teekanne or a water bottle" and never weighs drinks.
test('water: own teapot and bottle, one tap for a full one, half a pot from the sheet, undo', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  const toggle = page.getByRole('switch', { name: /^Water/ });
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.goto('./#/');
  const card = page.locator('.water-card');
  await expect(card.getByRole('button', { name: /Add a glass of water/ })).toBeVisible();
  await card.locator('.water-main').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toHaveAccessibleName('Add a drink');
  await sheet.getByRole('button', { name: 'Add your cup or bottle' }).click();
  await expect(sheet).toHaveAccessibleName('New cup or bottle');
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Teekanne');
  await sheet.getByRole('textbox', { name: 'Holds when full' }).fill('1200');
  await sheet.getByRole('button', { name: 'Black tea' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();

  // Back to adding a drink, with the new teapot picked; then a second container from the list.
  await expect(sheet).toHaveAccessibleName('Add a drink');
  await expect(sheet.getByRole('button', { name: 'Teekanne · 1.2 l' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Your cups and bottles' }).click();
  await sheet.getByRole('button', { name: 'Add one' }).click();
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Flasche');
  await sheet.getByRole('textbox', { name: 'Holds when full' }).fill('750');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveAccessibleName('Your cups and bottles');
  await expect(sheet.getByRole('button', { name: 'Change Flasche' })).toContainText('water');
  await sheet.getByRole('button', { name: 'Back' }).click();

  // Half the teapot: 600 ml of black tea, logged as the BLS food (99.5 % water, so 597 ml counts).
  await sheet.getByRole('button', { name: '½', exact: true }).click();
  await expect(sheet.getByText('600 ml black tea')).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Teekanne: 600 ml black tea added.')).toBeVisible();
  await expect(card).toContainText(/59\d ml of/);

  // One tap on the card: a full bottle of plain water, then undo.
  await card.getByRole('button', { name: 'Add a full Flasche (750 ml water)' }).click();
  await expect(page.getByText('Flasche: 750 ml water added.')).toBeVisible();
  await expect(card).toContainText(/1\.3 l of/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toContainText(/59\d ml of/);

  // The tea is in the diary as a food.
  await page.goto('./#/diary');
  await expect(page.getByText('Black tea (infusion)').first()).toBeVisible();
  expect(errors).toEqual([]);
});
