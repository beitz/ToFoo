import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

// Owner's report 2026-10-24: in "Write in journal" the text box's focus frame was cut off at the top by the
// sheet's title bar, and the round button sat over the sheet and hid "Change" next to the time.

/** Focus rings (outline 3 px + offset 2 px) inside the open sheet that its title bar paints over. */
async function ringsUnderHead(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    const head = sheet?.querySelector('.sheet-head');
    if (!sheet || !head) return ['no sheet open'];
    const headBottom = head.getBoundingClientRect().bottom;
    const ring = 5;
    const hits: string[] = [];
    for (const el of sheet.querySelectorAll<HTMLElement>('.sheet-body :is(input, textarea, select, button, a)')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.top - ring < headBottom - 0.5) hits.push(el.getAttribute('aria-label') ?? el.textContent ?? el.tagName);
    }
    return hits;
  });
}

/** Turns on the given trackers under Settings → What you track. */
async function turnOn(page: Page, names: string[]): Promise<void> {
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  for (const name of names) {
    const toggle = page.getByRole('switch', { name: new RegExp(`^${name}`) });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();
  }
}

test('the journal sheet shows its whole focus frame and nothing covers it', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await turnOn(page, ['Journal']);

  await page.goto('./#/journal');
  const round = page.locator('[data-tour="round-button"]');
  await expect(round).toBeVisible();
  await page.getByRole('button', { name: /^Write/ }).first().click();

  const sheet = page.getByRole('dialog', { name: 'Write in journal' });
  await expect(sheet.getByRole('textbox')).toBeFocused();
  expect(await ringsUnderHead(page)).toEqual([]);

  // The round button steps aside while the sheet is open, so "Change" next to the time can be tapped.
  await expect(round).toBeHidden();
  await sheet.getByRole('button', { name: /^Change/ }).click({ trial: true });

  // And comes back once the sheet is closed.
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(round).toBeVisible();
  expect(errors).toEqual([]);
});

test("a sheet opened from the round button's own menu hides the button too", async ({ page }) => {
  await firstLaunch(page);
  await turnOn(page, ['Activity']);
  await page.goto('./#/');
  const round = page.locator('[data-tour="round-button"]');
  await round.click();
  await page.getByRole('group', { name: 'Quick actions' }).getByRole('button', { name: 'Log activity' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(round).toBeHidden();
  expect(await ringsUnderHead(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(round).toBeVisible();
});

// Owner's report 2026-10-26: on the Kitchen tab the phone's back button left a thing's sheet open and went
// back behind it. The app had been reloaded with a sheet open (Android does that to an app in the background),
// so the page's entry still carried the old sheet's mark and the first back press closed nothing.
test("the phone's back button closes a kitchen sheet, also after the app was reloaded with one open", async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/kitchen');
  const add = page.getByPlaceholder('Add what you bought');
  await add.fill('oats 500 g');
  await add.press('Enter');
  const row = page.locator('.home-row', { hasText: 'oats' });
  const sheet = page.getByRole('dialog', { name: 'oats' });
  // The sheet's history entry is added just after it opens; a person is never that quick.
  const entryAdded = () => expect.poll(() => page.evaluate(() => (history.state as { tofooLayer?: number } | null)?.tofooLayer)).toBe(1);

  await row.click();
  await expect(sheet).toBeVisible();
  await entryAdded();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/#\/kitchen$/);

  await row.click();
  await expect(sheet).toBeVisible();
  await page.reload();
  await expect(sheet).toBeHidden();
  await row.click();
  await expect(sheet).toBeVisible();
  await entryAdded();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/#\/kitchen$/);
  expect(errors).toEqual([]);
});
