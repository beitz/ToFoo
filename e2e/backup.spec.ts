import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { firstLaunch, logFood, todayKcal, watchErrors } from './helpers';

test('a backup file restores the log on a fresh install', async ({ browser }, testInfo) => {
  // Phone one: log a meal and export everything.
  const one = await browser.newContext();
  const page = await one.newPage();
  const errors = watchErrors(page);
  await firstLaunch(page);
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  const kcal = await todayKcal(page);
  expect(kcal).toBeGreaterThan(0);
  await page.goto('./#/settings/backup');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export everything' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await download).saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8')) as { format: string; type: string };
  expect(backup).toMatchObject({ format: 'tofoo', type: 'backup' });
  expect(errors).toEqual([]);
  await one.close();

  // Phone two: a new install restores it.
  const two = await browser.newContext();
  const page2 = await two.newPage();
  const errors2 = watchErrors(page2);
  await firstLaunch(page2);
  expect(await todayKcal(page2)).toBe(0);
  await page2.goto('./#/settings/backup');
  await page2.locator('input[type=file]').setInputFiles(file);
  await page2.getByRole('button', { name: /^Restore/ }).last().click();
  await expect.poll(() => todayKcal(page2)).toBe(kcal);
  expect(errors2).toEqual([]);
  await two.close();
});
