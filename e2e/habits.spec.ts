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

async function addHabit(page: Page, name: string, kind?: 'Avoid' | 'Minutes'): Promise<void> {
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
  await addHabit(page, 'Floss');
  await addHabit(page, 'Alcohol', 'Avoid');
  await addHabit(page, 'Exercise', 'Minutes');

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
