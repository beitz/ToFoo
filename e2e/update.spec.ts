import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

// The page itself fetches its files here, so a file "gone after a deploy" can be faked.
test.use({ serviceWorkers: 'block' });

test('an assistant message sent from an app left open across an update asks for a reload and keeps the text', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings/assistant');
  await page.getByRole('switch', { name: /^Use the AI assistant/ }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('API key saved.')).toBeVisible();

  // A new version was deployed: this version's files that were not loaded yet are gone.
  await page.route('**/assets/*.js', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('./#/assistant');
  const box = page.getByRole('textbox', { name: /oats at 8/ });
  await box.fill('Check all foods I logged');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/A new version of the app was installed while it was open/)).toBeVisible();
  await expect(box).toHaveValue('Check all foods I logged');

  await page.unroute('**/assets/*.js');
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /oats at 8/ })).toHaveValue('Check all foods I logged');
  expect(errors.filter((e) => !/dynamically imported module|404/i.test(e))).toEqual([]);
});
