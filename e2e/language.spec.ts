import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test.describe('on a German phone', () => {
  test.use({ locale: 'de-DE' });

  test('a new install starts in German, tab bar included, and can switch to English', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    const picker = page.getByRole('radiogroup', { name: 'Sprache' });
    await expect(picker.getByRole('radio', { name: 'Automatisch' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Automatisch folgt deinem Handy: jetzt Deutsch.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const tabs = page.locator('nav.bottom-nav');
    await expect(tabs.getByRole('link', { name: 'Start' })).toBeVisible();

    await picker.getByRole('radio', { name: 'English' }).click();
    const english = page.getByRole('radiogroup', { name: 'Language' });
    await expect(english.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(tabs.getByRole('link', { name: 'Home' })).toBeVisible();

    // Back to German, then through first launch: Home and the tabs in German.
    await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Automatic' }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await page.getByRole('button', { name: 'Überspringen' }).click();
    await page.getByRole('button', { name: 'Keine Rundgänge, danke' }).click();
    await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Einblicke' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
