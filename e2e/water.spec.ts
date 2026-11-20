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

  // Both containers side by side on Home, each with its size (owner's ask 2026-11-20).
  const buttons = card.locator('.water-containers .water-glass');
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toContainText('Teekanne1.2 l');
  await expect(buttons.nth(1)).toContainText('Flasche750 ml');
  const [a, b] = [await buttons.nth(0).boundingBox(), await buttons.nth(1).boundingBox()];
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);

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

// Owner's ask 2026-11-20: a 2 l teapot lasts two or three days, and he logs it only when it is empty.
test('water: a teapot logged when empty is spread over the days since it was filled', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  await page.getByRole('switch', { name: /^Water/ }).click();

  await page.goto('./#/');
  const card = page.locator('.water-card');
  await card.locator('.water-main').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Add your cup or bottle' }).click();
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Teekanne');
  await sheet.getByRole('textbox', { name: 'Holds when full' }).fill('2000');
  await sheet.getByRole('button', { name: 'Black tea' }).click();
  await sheet.getByRole('button', { name: 'When it is empty' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();

  // Never logged before: the sheet asks since when; two days ago gives about a litre a day.
  await expect(sheet).toHaveAccessibleName('Add a drink');
  await expect(sheet.getByRole('alert')).toHaveText('Say since when you have been drinking from it.');
  await sheet.getByRole('button', { name: '2 days ago' }).click();
  await expect(sheet.getByText(/Over 2 days: about 1 l a day\./)).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Teekanne empty: 2 l black tea since .* \(2 days\)\./)).toBeVisible();

  // Yesterday lies wholly inside: half the pot counts there.
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  await page.goto(`./#/diary/${yesterday}`);
  await expect(page.getByText(/Teekanne: 1 l of 2 l · /)).toBeVisible();
  await expect(page.locator('.water-card')).toContainText(/99\d ml of/);

  // The next time, one tap on Home: since the last time it was emptied, with undo.
  await page.goto('./#/');
  await expect(card.locator('.water-glass')).toContainText('Teekanne2 l · when empty');
  await card.getByRole('button', { name: /Teekanne is empty/ }).click();
  await expect(page.getByText(/Teekanne empty: 2 l black tea since /)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(errors).toEqual([]);
});

// Owner's ask 2026-11-20: a work bottle of mineral water, about 1 l a day, 240 mg calcium and 109 mg magnesium a litre.
test("water: a bottle of mineral water from its label counts its minerals; tap water stays plain", async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  await page.getByRole('switch', { name: /^Water/ }).click();

  await page.goto('./#/diary');
  const card = page.locator('.water-card');
  await card.locator('.water-main').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Add your cup or bottle' }).click();
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Arbeitsflasche');
  await sheet.getByRole('textbox', { name: 'Holds when full' }).fill('1000');
  await expect(sheet.getByText(/Minerals not counted/)).toBeVisible();
  await sheet.getByRole('button', { name: 'From the label' }).click();
  await sheet.getByRole('textbox', { name: 'Name of the water' }).fill('klar Medium');
  await sheet.getByRole('textbox', { name: 'Calcium' }).fill('240');
  await sheet.getByRole('textbox', { name: 'Magnesium' }).fill('109');
  await sheet.getByRole('textbox', { name: 'Sodium' }).fill('63.9');
  await sheet.getByRole('button', { name: 'Use these values' }).click();
  await expect(sheet.locator('.water-kind')).toContainText('klar Medium · 240 mg Calcium · 109 mg Magnesium a litre');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveAccessibleName('Add a drink');
  await page.keyboard.press('Escape');

  // One tap: a full bottle, its minerals on the card; plain water adds none.
  await card.getByRole('button', { name: 'Add a full Arbeitsflasche (1 l klar Medium)' }).click();
  await expect(page.getByText('Arbeitsflasche: 1 l klar Medium added.')).toBeVisible();
  await expect(card.locator('.water-minerals')).toHaveText('From water:240 mg Calcium109 mg Magnesium');
  await card.locator('.water-main').click();
  await sheet.getByRole('button', { name: 'Other amount' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(card).toContainText(/1\.3 l of/);
  await expect(card.locator('.water-minerals')).toHaveText('From water:240 mg Calcium109 mg Magnesium');

  // The label is no saved item to log.
  await page.goto('./#/settings/saved');
  await expect(page.getByText('klar Medium')).toHaveCount(0);
  expect(errors).toEqual([]);
});
