import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Global timeout per test – keep lower locally so failures are reported quickly
  timeout: process.env.CI ? 120_000 : 45_000,

  // Retry up to 2 times to tolerate transient slowness
  retries: 2,

  // 1 worker in CI (stable, no user provisioning needed) and locally.
  workers: 1,

  // globalSetup/Teardown only needed when running with multiple workers.
  // Disabled until multi-worker provisioning is stable in CI.

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],

  use: {
    baseURL: 'http://localhost',
    headless: true,
    // Keep screenshots and traces on failure for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // CI runners are often slower than local Docker; use slightly higher limits there.
    navigationTimeout: process.env.CI ? 90_000 : 30_000,
    actionTimeout: process.env.CI ? 45_000 : 15_000,
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
