import { Page, BrowserContext } from '@playwright/test';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const BASE_URL = env.POLARION_URL ?? 'http://localhost';
export const ADMIN_USER = env.POLARION_USER ?? 'admin';
export const ADMIN_PASS = env.POLARION_PASS ?? 'admin';

/** Logs in to Polarion via the standard login form and waits for redirect. */
export async function loginAsPolarionAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/`);
  await page.waitForLoadState('domcontentloaded');

  await page.fill('#j_username', ADMIN_USER);
  await page.fill('#j_password', ADMIN_PASS);
  await page.click('#submitButton');

  // Polarion may keep background network activity alive; avoid relying on networkidle.
  await Promise.race([
    page.waitForURL((url) => !url.href.includes('/polarion/login'), { timeout: 30_000 }),
    page.locator('#j_username').waitFor({ state: 'detached', timeout: 30_000 })
  ]);
}

/**
 * Stores the authenticated Polarion session cookies into the given context so
 * subsequent pages do not need to re-login.
 */
export async function saveSession(context: BrowserContext, page: Page): Promise<void> {
  await loginAsPolarionAdmin(page);
  // Cookies are automatically stored in the context – nothing extra to do.
}
