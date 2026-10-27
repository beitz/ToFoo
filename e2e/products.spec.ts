import { expect, test } from '@playwright/test';
import { firstLaunch, logFood, todayKcal, watchErrors } from './helpers';

// What Open Food Facts answers for PiCK UP! Choco minis (trimmed from a real response, 2026-10-23).
const PICK_UP = {
  code: '4017100406218',
  status: 'success',
  product: {
    code: '4017100406218',
    product_name: 'PiCK UP ! Choco minis - 127g',
    brands: 'Leibniz, PiCK UP !',
    quantity: '127 g',
    categories_tags_en: ['Snacks', 'Sweet snacks', 'Biscuits', 'Chocolate biscuits'],
    nutriments: { 'energy-kcal_100g': 510, fat_100g: 25, 'saturated-fat_100g': 14, carbohydrates_100g: 63, sugars_100g: 33, fiber_100g: 3.1, proteins_100g: 6.6, salt_100g: 0.48 },
    last_modified_t: 1787068844,
  },
};

test('a packaged product is found by name and logged after its barcode lookup', async ({ page }) => {
  const errors = watchErrors(page);
  // The search itself runs on the phone; only picking a product asks Open Food Facts, by barcode.
  const lookups: string[] = [];
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => {
    lookups.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: PICK_UP });
  });
  await firstLaunch(page);

  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  // The setting is saved first and shown after, so click and wait rather than check(). USDA too: its
  // button once shared a key with the product list, and old lists piled up while typing.
  for (const name of [/^Open Food Facts lookup/, /^USDA FoodData Central/]) {
    const toggle = page.getByRole('switch', { name });
    await toggle.click();
    await expect(toggle).toBeChecked();
  }

  await page.goto('./#/log');
  // A search typed, cleared and typed again, as the owner did: only the new results show.
  const box = page.getByPlaceholder('Search foods');
  await box.pressSequentially('wrigley', { delay: 50 });
  await expect(page.locator('.off-results')).toContainText(/wrigley/i);
  await box.clear();
  await box.pressSequentially('pick up', { delay: 50 });
  await expect(page.getByRole('heading', { name: 'Packaged products · Open Food Facts' })).toBeVisible();
  await expect(page.locator('.off-results')).toHaveCount(1);
  await expect(page.locator('.off-results')).not.toContainText(/wrigley/i);
  expect(lookups).toEqual([]);

  // The most-scanned Pick Up comes first; whichever it is, the fake answer above is the Choco minis.
  const first = page.locator('.off-results').getByRole('button').first();
  await expect(first).toHaveText(/pick ?up/i);
  await first.click();
  await expect.poll(() => lookups).toHaveLength(1);
  await page.getByRole('button', { name: '100 g' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => todayKcal(page)).toBe(510);
  expect(errors).toEqual([]);
});

// YOUCOOK Butter Chicken (trimmed from a real response, 2026-10-26): a ready meal the app once paired with "Chicken fat".
const BUTTER_CHICKEN = { code: '4260334165158', status: 'success', product: {
    "code": "4260334165158",
    "product_name": "Indian Style Butter Chicken mit Huhn",
    "brands": "YOUCOOK",
    "quantity": "420 g",
    "categories_tags_en": [
      "Meals",
      "Meats and their products",
      "Meals with meat",
      "poultry-meals",
      "Meals with chicken",
      "Butter chicken"
    ],
    "nutriments": {
      "carbohydrates_100g": 14.1,
      "energy-kcal_100g": 144.05,
      "fat_100g": 7.1,
      "fiber_100g": 1.2,
      "iron_100g": 0,
      "proteins_100g": 5.3,
      "salt_100g": 0.55,
      "saturated-fat_100g": 3.9,
      "sugars_100g": 1.7,
      "zinc_100g": 0
    },
    "ingredients": [
      {
        "id": "en:rice",
        "text": "Reis",
        "percent": 42,
        "percent_estimate": 41.99
      },
      {
        "id": "en:chicken-breast-fillet",
        "text": "Hähnchenbrustfilet",
        "percent": 14,
        "percent_estimate": 14.5
      },
      {
        "id": "de:gegart",
        "text": "gegart",
        "percent_estimate": 9.5
      },
      {
        "id": "en:tomato",
        "text": "Tomaten",
        "percent": 10,
        "percent_estimate": 9.5
      },
      {
        "id": "en:tomato-puree",
        "text": "Tomatenmark",
        "percent_estimate": 3.35
      },
      {
        "id": "en:paprika-or-bell-pepper",
        "text": "Paprika",
        "percent_estimate": 2.44
      },
      {
        "id": "en:onion",
        "text": "Zwiebeln",
        "percent_estimate": 1.87
      },
      {
        "id": "en:cream",
        "text": "Sahne",
        "percent_estimate": 1.48
      },
      {
        "id": "en:coconut-milk",
        "text": "Kokosnussmilch",
        "percent_estimate": 1.1
      },
      {
        "id": "en:butter",
        "text": "Butter",
        "percent_estimate": 1
      },
      {
        "id": "en:creme-fraiche",
        "text": "Crème Fraîche",
        "percent_estimate": 0.84
      },
      {
        "id": "de:Geflügelbrühe",
        "text": "Geflügelbrühe",
        "percent_estimate": 0.63
      },
      {
        "id": "en:chicken-fat",
        "text": "Hühnerfett",
        "percent_estimate": 0.62
      },
      {
        "id": "en:spice",
        "text": "Gewürze",
        "percent_estimate": 0.54
      },
      {
        "id": "en:sugar",
        "text": "Zucker",
        "percent_estimate": 0.48
      },
      {
        "id": "en:starch",
        "text": "Stärke",
        "percent_estimate": 0.42
      },
      {
        "id": "en:salt",
        "text": "Salz",
        "percent_estimate": 0.37
      },
      {
        "id": "en:herb",
        "text": "Kräuter",
        "percent_estimate": 0.34
      }
    ]
  } };

test('a ready meal is built from its ingredient list, shown on its page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => route.fulfill({ json: BUTTER_CHICKEN }));
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  const toggle = page.getByRole('switch', { name: /^Open Food Facts lookup/ });
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.goto('./#/log');
  await page.getByPlaceholder('Search foods').pressSequentially('youcook butter chicken', { delay: 30 });
  await page.locator('.off-results').getByRole('button').first().click();
  // The sheet starts with the mix, picked by the app: rice cooked (the label says 144 kcal), chicken, tomatoes…
  await expect(page.getByText('its ingredients', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.mix-list')).toContainText('White rice boiled');
  await page.getByRole('button', { name: /^All \d+/ }).click();
  await expect(page.locator('.mix-list')).toContainText('Left out');
  await page.getByRole('button', { name: '200 g' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => todayKcal(page)).toBe(288);

  // Its page shows the same, and "Looks right" keeps it.
  await page.goto('./#/food/OFF:4260334165158');
  await expect(page.locator('.mix-list')).toContainText('Chicken breast fillet, raw');
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByText('Picked by the app')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the check list puts the app\'s unchecked pick first, and "Looks right" moves it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('https://world.openfoodfacts.org/api/v3/product/**', (route) => route.fulfill({ json: BUTTER_CHICKEN }));
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('Food sources').click();
  const toggle = page.getByRole('switch', { name: /^Open Food Facts lookup/ });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  await page.goto('./#/log');
  await page.getByPlaceholder('Search foods').pressSequentially('youcook butter chicken', { delay: 30 });
  await page.locator('.off-results').getByRole('button').first().click();
  await page.getByRole('button', { name: '200 g' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => todayKcal(page)).toBeGreaterThan(288);

  await page.goto('./#/settings');
  await expect(page.getByText('Last 7 days: 1 worth a look')).toBeVisible();
  await page.getByRole('link', { name: /Check logged foods/ }).click();
  await expect(page.getByRole('heading', { name: 'Worth a look (1)' })).toBeVisible();
  await expect(page.getByText('Picked by the app, not checked yet')).toBeVisible();
  await expect(page.getByText('from its ingredients (14 BLS foods)')).toBeVisible();
  await expect(page.getByText('Oat flakes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByRole('heading', { name: 'Looks fine (2)' })).toBeVisible();
  expect(errors).toEqual([]);
});
