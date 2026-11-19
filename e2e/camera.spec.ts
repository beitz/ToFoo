import { expect, test } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

/** A 1×1 PNG: no EXIF, like a camera shot whose data the browser dropped. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('a photo taken with the camera from the chat is dated now and sent with that time', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings/assistant');
  await page.getByRole('switch', { name: /^Use the AI assistant/ }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 500, body: '{"type":"error","error":{"type":"api_error","message":"test"}}' });
  });

  await page.goto('./#/assistant');
  // Take photo opens the phone's camera (capture), Choose photos the gallery.
  await expect(page.getByRole('button', { name: 'Take photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photos' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take photo' }).click();
  await (await chooser).setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  // Plain time under the thumbnail (no ≈), and no "without a capture time" note.
  await expect(page.locator('.composer-photo-time')).toHaveText(/^\w{3} \d{1,2}:\d{2}$/);
  await expect(page.getByText(/without a capture time/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  expect(bodies[0]).toContain('just taken with the camera in the app');
  expect(errors).toEqual([]);
});
