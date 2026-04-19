import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Global timeout per test – Polarion pages can be slow
  timeout: 120_000,

  // Retry once on CI to tolerate transient slowness
  retries: process.env.CI ? 1 : 0,

  // Spec files run in parallel across workers; tests within each file run serially.
  // This is safe because each spec uses a unique filename prefix (ui-test-*, ui-session-*,
  // ui-tab-*) and each worker gets its own isolated browser context.
  workers: process.env.CI ? 2 : 4,

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
    // Generous navigation timeout for Polarion's SSR pages
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },
});
