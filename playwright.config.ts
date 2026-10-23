import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the main flows in a real browser (owner's pick 2026-10-23: so a new feature can't
 * quietly break an old one). They run against the production build, served by `vite preview`; build
 * first (`npm run build`, or `npx vite build` once the data exists).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173/ToFoo/',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'phone', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/ToFoo/',
    reuseExistingServer: !process.env.CI,
  },
});
