import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

async function turnOnHabits(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  for (const name of ['Habits', 'Activity']) {
    const toggle = page.getByRole('switch', { name: new RegExp(`^${name}`) });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();
  }
}

async function addHabit(page: Page, name: string, kind?: 'Avoid' | 'Activity'): Promise<void> {
  await page.goto('./#/habits/new');
  await page.getByLabel('Name').fill(name);
  if (kind) await page.getByRole('radio', { name: kind }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('habits: add them, tick today on Home, answer a day on the habit page', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await turnOnHabits(page);
  // With none made yet, Home still shows the row, with a way to add the first one.
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Add your first habit' }).click();
  await expect(page).toHaveURL(/#\/habits\/new$/);
  await addHabit(page, 'Floss');
  await addHabit(page, 'Alcohol', 'Avoid');
  await addHabit(page, 'Exercise', 'Activity');

  // Home: one card per habit; a tap answers today, a second tap clears it.
  await page.goto('./#/');
  const row = page.getByRole('list', { name: 'Habits' });
  const floss = row.getByRole('listitem', { name: /^Floss:/ });
  await expect(floss).toHaveAccessibleName('Floss: not answered');
  await floss.click();
  await expect(floss).toHaveAccessibleName('Floss: done');
  await floss.click();
  await expect(floss).toHaveAccessibleName('Floss: not answered');
  await row.getByRole('listitem', { name: /^Alcohol:/ }).click();
  await expect(row.getByRole('listitem', { name: /^Alcohol:/ })).toHaveAccessibleName('Alcohol: had some');

  // A minutes habit opens the activity sheet with its minutes; saving it counts.
  await row.getByRole('listitem', { name: /^Exercise:/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(row.getByRole('listitem', { name: /^Exercise:/ })).toHaveAccessibleName('Exercise: reached');

  // The habits page lists them; a habit's page answers any past day.
  await page.getByRole('link', { name: 'All habits' }).click();
  await expect(page.getByRole('link', { name: /Floss/ })).toBeVisible();
  await page.getByRole('link', { name: /Floss/ }).click();
  await page.getByRole('gridcell', { name: /not answered$/ }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText(/^Floss: Done\.$/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('habits: one tap logs the preset activity, again and again, and long press changes it first', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await turnOnHabits(page);
  await page.goto('./#/habits/new');
  await page.getByLabel('Name').fill('Commute');
  await page.getByRole('radio', { name: 'Activity' }).click();
  await page.getByLabel('Minutes a day').fill('60');
  await page.getByRole('switch', { name: /^One tap on Home logs it/ }).click();
  await page.getByLabel('Minutes per tap').fill('30');
  // The form's picture of the Home card says what a tap will do.
  await expect(page.getByText('Tap: + Walk 30 min')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Log Walk 30 min' })).toBeVisible();

  // Home: each tap logs a 30-minute walk ending now; two make the day's 60.
  await page.goto('./#/');
  const card = page.getByRole('list', { name: 'Habits' }).getByRole('listitem', { name: /^Commute:/ });
  await expect(card).toHaveAccessibleName(/^Commute: 0 of 60 minutes today; tap logs Walk 30 min/);
  await card.click();
  await expect(page.getByText('Walk 30 min logged: 30 of 60 min today.')).toBeVisible();
  await expect(card).toHaveAccessibleName(/^Commute: 30 of 60 minutes today/);
  await card.click();
  await expect(card).toHaveAccessibleName(/^Commute: reached/);

  // A long press opens the activity sheet with the preset instead of logging.
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('How long')).toHaveValue('30');
  expect(errors).toEqual([]);
});
