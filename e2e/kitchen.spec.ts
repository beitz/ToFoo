import { expect, test } from '@playwright/test';
import { firstLaunch, loggedKcal, watchErrors } from './helpers';

test('a recipe is saved, cooked as a batch, eaten and stored', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);

  await page.goto('./#/recipes/new');
  await page.getByPlaceholder('Linsencurry').fill('Test dal');
  await page.getByPlaceholder('Add ingredient').fill('lentils');
  await page.getByRole('button', { name: /^Lentil mature/ }).first().click();
  await page.getByLabel('Amount').fill('250');
  await page.getByRole('button', { name: 'Save' }).click();
  // The recipe page: four portions of 250 g dried lentils, about 200 kcal each.
  await expect(page.getByRole('link', { name: /^kcal/ })).toBeVisible();

  await page.getByRole('button', { name: 'Cook a batch' }).click();
  await page.getByRole('button', { name: 'Next: Cook' }).click();
  await page.getByRole('button', { name: 'Next: Weigh & split' }).click();
  await page.getByRole('button', { name: 'Next: Store' }).click();
  await page.getByRole('button', { name: /^Done · eat 1 now, store 3/ }).click();
  await expect(page.getByRole('button', { name: /3 of 4 left/ })).toBeVisible();

  const kcal = await loggedKcal(page);
  expect(kcal).toBeGreaterThan(150);
  expect(kcal).toBeLessThan(250);

  await page.goto('./#/kitchen');
  const main = page.locator('main');
  await expect(main).toContainText('Fridge');
  await expect(main.getByText('Test dal')).toHaveCount(2); // one portion in the fridge, two in the freezer
  expect(errors).toEqual([]);
});

// What Open Food Facts answers for a small spice jar (made up in the shape of a real response).
const PAPRIKA = {
  code: '4002674044201',
  status: 'success',
  product: {
    code: '4002674044201',
    product_name: 'Paprika edelsüß',
    brands: 'Ostmann',
    quantity: '12,5 g',
    categories_tags_en: ['Condiments', 'Spices', 'Paprika'],
    nutriments: { 'energy-kcal_100g': 330, fat_100g: 13, 'saturated-fat_100g': 2, carbohydrates_100g: 19, sugars_100g: 10, fiber_100g: 35, proteins_100g: 14, salt_100g: 0.1 },
    last_modified_t: 1787068844,
  },
};

test('a scanned spice jar is counted in exact grams', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => route.fulfill({ json: PAPRIKA }));
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  const toggle = page.getByRole('switch', { name: /^Open Food Facts lookup/ });
  await toggle.click();
  await expect(toggle).toBeChecked();

  // Scanned into the spices: it starts at the jar's weight, not at one piece.
  await page.goto('./#/kitchen');
  await page.getByRole('button', { name: 'Add to Spices and herbs' }).click();
  await page.locator('.card-add-box').getByRole('button', { name: 'Scan a barcode' }).click();
  await page.getByLabel('Barcode number').fill(PAPRIKA.code);
  await page.getByRole('button', { name: 'Look up' }).click();
  // Shown as an icon first; the list has its amount and where its numbers come from in words.
  await expect(page.locator('main').getByRole('button', { name: /^Paprika edelsüß.*12.5 g/ })).toBeVisible();
  await page.getByRole('radio', { name: 'List' }).click();
  const row = page.locator('.home-row', { hasText: 'Paprika edelsüß' });
  await expect(row).toContainText('12.5 g');
  // A small tag says it is an Open Food Facts product, paired with a BLS food or by its label alone.
  await expect(row).toContainText(/OFF (\+ BLS|· label only)/);

  // Counted again as one jar, then back to grams with one tap, then what is really left.
  await row.click();
  const amount = page.getByLabel('How much is left');
  await expect(amount).toHaveValue('12.5 g');
  await amount.fill('1');
  await page.getByRole('button', { name: 'Count in grams: 12.5 g' }).click();
  await expect(amount).toHaveValue('12.5 g');
  await amount.fill('8,5 g');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(row).toContainText('8.5 g');
  expect(errors).toEqual([]);
});

// Bay leaves are not in the BLS (owner's search for "Lorbeerblatt", 2026-10-26); Open Food Facts has jars of them.
const BAY = {
  code: '4002674102215',
  status: 'success',
  product: {
    code: '4002674102215',
    product_name: 'Lorbeerblätter',
    brands: 'Ostmann',
    quantity: '5 g',
    categories_tags_en: ['Condiments', 'Spices', 'Bay leaves'],
    nutriments: { 'energy-kcal_100g': 313, fat_100g: 8.4, carbohydrates_100g: 48.7, proteins_100g: 7.6, salt_100g: 0.06 },
    last_modified_t: 1787068844,
  },
};

test('a spice missing from the food database is found as a product, or kept by its name', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => route.fulfill({ json: BAY }));
  await firstLaunch(page);

  // Without Open Food Facts: nothing matches, the app says the name works on its own, and it goes with the spices.
  await page.goto('./#/kitchen');
  const add = page.getByPlaceholder('Add what you bought');
  await add.fill('Wacholderbeeren');
  await expect(page.getByText(/Not in the food lists/)).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const main = page.locator('main');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(main.locator('.home-row', { hasText: 'Wacholderbeeren' })).toContainText('No food linked');

  // With it: the bundled product list offers the jar, and picking it counts the jar's grams.
  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  await page.getByRole('switch', { name: /^Open Food Facts lookup/ }).click();
  await page.goto('./#/kitchen');
  await add.fill('Lorbeerblatt');
  await page.getByRole('button', { name: /^Lorbeerblätter.*Ostmann/ }).click();
  await expect(main.locator('.home-row', { hasText: 'Lorbeerblätter' })).toContainText('5 g');
  expect(errors).toEqual([]);
});

test('marking something used up leaves the shopping list to the user', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);

  await page.goto('./#/kitchen');
  await page.getByPlaceholder('Add what you bought').fill('Wacholderbeeren');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const main = page.locator('main');
  await main.getByRole('button', { name: /^Wacholderbeeren/ }).click();
  await page.getByRole('radio', { name: 'Used up' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  // Used up shows in the kitchen, and nothing went on the list by itself (owner, 2026-10-26).
  await expect(main.getByRole('heading', { name: 'Used up (1)' })).toBeVisible();
  await page.goto('./#/shopping');
  await expect(page.locator('main').getByText('Wacholderbeeren')).toHaveCount(0);

  // One tap in its sheet puts it on the list.
  await page.goto('./#/kitchen');
  await main.getByRole('button', { name: /^Wacholderbeeren/ }).click();
  await page.getByRole('button', { name: 'Add to shopping list' }).click();
  await expect(page.getByText('On the shopping list', { exact: true })).toBeVisible();
  await page.goto('./#/shopping');
  await expect(page.locator('main').getByText('Wacholderbeeren')).toBeVisible();

  // The bin on the Used up card clears it, with undo.
  await page.goto('./#/kitchen');
  await page.getByRole('button', { name: 'Remove everything used up' }).click();
  await expect(main.getByRole('heading', { name: /^Used up/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(main.getByRole('heading', { name: 'Used up (1)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('things at home show as icons with short names, which can be changed, or as a list', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/kitchen');
  const add = page.getByPlaceholder('Add what you bought');
  for (const name of ['Pizza Diavola', 'Pizza Margherita']) {
    await add.fill(name);
    await add.press('Enter');
  }
  // Two pizzas: the icon says pizza, the short names tell them apart.
  const names = page.locator('main .home-tile-name');
  await expect(names.filter({ hasText: /^Diavola$/ })).toBeVisible();
  await expect(names.filter({ hasText: /^Margherita$/ })).toBeVisible();

  // Its own short name, from the item's sheet.
  await page.locator('main').getByRole('button', { name: /^Pizza Diavola/ }).click();
  await page.getByLabel('Short name').fill('Spicy');
  await page.getByRole('button', { name: 'Choose an icon' }).first().click();
  await page.getByRole('button', { name: 'hot pepper' }).click();
  // Its kind (the ring's colour): picked by the app, changed here.
  await page.getByLabel('Kind').selectOption('ready');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('main').getByRole('button', { name: /^Pizza Diavola.*Ready meals/ })).toBeVisible();
  await expect(names.filter({ hasText: /^Spicy$/ })).toBeVisible();
  // The other pizza has no look-alike left, so it is just the pizza.
  await expect(names.filter({ hasText: /^Pizza$/ })).toBeVisible();

  // The list, remembered.
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('main .home-row', { hasText: 'Pizza Margherita' })).toBeVisible();
  await page.reload();
  await expect(page.locator('main .home-row', { hasText: 'Pizza Diavola' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the shopping list keeps its order, hides what is ticked and acts on it in one tap', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);

  await page.goto('./#/shopping');
  const main = page.locator('main');
  const box = page.getByPlaceholder('Add an item, e.g. "milk 2 l"');
  for (const name of ['frozen peas', 'Bread', 'Rolls', 'Toilet paper']) {
    await box.fill(name);
    await box.press('Enter');
    await expect(main.getByRole('checkbox', { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  // A ticked line stays a moment, then hides; the switch shows it again in its place.
  await main.getByRole('checkbox', { name: /^Bread/ }).click();
  await expect(main.getByRole('checkbox', { name: /^Bread/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show ticked (1)' }).click();
  await expect(main.getByRole('checkbox', { name: /^Bread/ })).toHaveAttribute('aria-checked', 'true');
  const names = await main.locator('.shop-name').allTextContents();
  expect(names.indexOf('Bread')).toBeLessThan(names.indexOf('Rolls'));

  // The place on a ticked line puts it away there (it used to only untick it).
  await main.getByRole('checkbox', { name: /^frozen peas/ }).click();
  await main.getByRole('button', { name: 'Put frozen peas away: Freezer' }).click();
  await expect(page.getByText('frozen peas put away: Freezer.')).toBeVisible();
  await expect(main.getByRole('checkbox', { name: /^frozen peas/ })).toHaveCount(0);

  // A heading ticks everything under it; Untick puts it all back.
  await main.getByRole('checkbox', { name: 'Tick off everything under Bread and baked goods' }).click();
  await expect(main.getByRole('checkbox', { name: /^Rolls/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Untick' }).click();
  await expect(page.getByText('2 back on the list.')).toBeVisible();
  await expect(main.getByRole('checkbox', { name: /^Bread/ })).toHaveAttribute('aria-checked', 'false');

  // Swiping a line to the left deletes it, with undo.
  const row = main.locator('.swipe-front', { hasText: 'Toilet paper' });
  const r = (await row.boundingBox())!;
  await page.mouse.move(r.x + r.width - 30, r.y + r.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(r.x + r.width - 30 - i * 25, r.y + r.height / 2);
  await page.mouse.up();
  await expect(page.getByText('Toilet paper removed from the list.')).toBeVisible();
  await expect(main.getByText('Toilet paper')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(main.getByRole('checkbox', { name: /^Toilet paper/ })).toBeVisible();

  // Tick the rest and put it all away: food goes home, toilet paper just leaves the list.
  await main.getByRole('checkbox', { name: /^Toilet paper/ }).click();
  await main.getByRole('checkbox', { name: 'Tick off everything under Bread and baked goods' }).click();
  await page.getByRole('button', { name: 'Put away' }).click();
  await expect(page.getByText('2 put away at home, 1 off the list.')).toBeVisible();
  await expect(main.locator('.shop-name')).toHaveCount(0);

  await page.goto('./#/kitchen');
  for (const name of ['frozen peas', 'Bread', 'Rolls']) await expect(main.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await expect(main.getByRole('button', { name: /^Toilet paper/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
