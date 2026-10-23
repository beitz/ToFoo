import { expect, type Page } from '@playwright/test';

/** Fails the test on any uncaught error in the page. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** First launch as a new user: keep the look, skip "About you", no tours. */
export async function firstLaunch(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'No tours, thanks' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

/** Logs a BLS food from the Log meal screen: the first search result for `query`, with a quick amount. */
export async function logFood(page: Page, query: string, food: RegExp, amount: '50 g' | '100 g' | '200 g'): Promise<void> {
  await page.goto('./#/log');
  await page.getByPlaceholder('Search foods').fill(query);
  await page.getByRole('button', { name: food }).first().click();
  await page.getByRole('button', { name: amount }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

/** The energy eaten today, from the big ring on Home. */
export async function todayKcal(page: Page): Promise<number> {
  await page.goto('./#/');
  const text = await page.locator('[data-tour="home.today"]').innerText();
  const m = /([\d,]+)\s*of [\d,]+ kcal/.exec(text);
  return m ? Number(m[1]!.replace(/,/g, '')) : NaN;
}
