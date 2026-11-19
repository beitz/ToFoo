import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test.describe('on a German phone', () => {
  test.use({ locale: 'de-DE' });

  test('a new install starts in German and can switch to English', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    const picker = page.getByRole('radiogroup', { name: 'Sprache' });
    await expect(picker.getByRole('radio', { name: 'Automatisch' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Automatisch folgt deinem Handy: jetzt Deutsch.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');

    await picker.getByRole('radio', { name: 'English' }).click();
    const english = page.getByRole('radiogroup', { name: 'Language' });
    await expect(english.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(errors).toEqual([]);
  });
});
