import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Global timeout per test
  timeout: 60_000,

  // Retry once on CI to tolerate transient slowness
  retries: process.env.CI ? 1 : 0,

  // Run fully sequential to avoid load-related interference on the shared Polarion instance.
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost',
    headless: true,
    // Keep screenshots and traces on failure for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // CI runners are often slower than local Docker; use slightly higher limits there.
    navigationTimeout: process.env.CI ? 60_000 : 30_000,
    actionTimeout: process.env.CI ? 30_000 : 15_000,
    // On GitHub Actions (Linux) /dev/shm is only 64 MB; Chromium can crash without these flags.
    // --no-sandbox is required when running as root (default in GitHub Actions).
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
});
