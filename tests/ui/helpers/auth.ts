import { Page, BrowserContext } from '@playwright/test';

export const BASE_URL  = process.env.POLARION_URL  ?? 'http://localhost';
export const ADMIN_USER = process.env.POLARION_USER ?? 'admin';
export const ADMIN_PASS = process.env.POLARION_PASS ?? 'admin';

/** Logs in to Polarion via the standard login form and waits for redirect. */
export async function loginAsPolarionAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/`);
  await page.waitForLoadState('networkidle');

  await page.fill('#j_username', ADMIN_USER);
  await page.fill('#j_password', ADMIN_PASS);
  await page.click('#submitButton');

  await page.waitForLoadState('networkidle');
}

/**
 * Stores the authenticated Polarion session cookies into the given context so
 * subsequent pages do not need to re-login.
 */
export async function saveSession(context: BrowserContext, page: Page): Promise<void> {
  await loginAsPolarionAdmin(page);
  // Cookies are automatically stored in the context – nothing extra to do.
}
