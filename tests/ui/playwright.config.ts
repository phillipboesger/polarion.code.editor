import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Global timeout per test – keep lower locally so failures are reported quickly
  timeout: process.env.CI ? 120_000 : 45_000,

  // Retry once on CI to tolerate transient slowness
  retries: process.env.CI ? 1 : 0,

  // 3 parallel workers on CI (each with its own Polarion admin user),
  // 1 worker locally to keep the dev loop simple.
  // Worker 0 → admin, Worker 1 → playwright_w1, Worker 2 → playwright_w2.
  // All users are Polarion admins; see global-setup.ts for user provisioning.
  workers: process.env.CI ? 3 : 1,

  // Creates test users + saves per-worker auth states before the suite runs.
  // Only needed on CI where 3 workers run in parallel.
  ...(process.env.CI ? {
    globalSetup:    './global-setup.ts',
    globalTeardown: './global-teardown.ts',
  } : {}),

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
