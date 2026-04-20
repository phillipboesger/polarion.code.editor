import { Page, BrowserContext } from '@playwright/test';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const BASE_URL = env.POLARION_URL ?? 'http://localhost';
export const ADMIN_USER = env.POLARION_USER ?? 'admin';
export const ADMIN_PASS = env.POLARION_PASS ?? 'admin';

const USERNAME_SELECTORS = ['#j_username', 'input[name="j_username"]', 'input.j_username'];
const PASSWORD_SELECTORS = ['#j_password', 'input[name="j_password"]', 'input.j_password'];
const SUBMIT_SELECTORS = ['#submitButton', 'button[type="submit"]', 'input[type="submit"]'];

async function firstVisibleSelector(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (visible) {
      return selector;
    }
  }
  return null;
}

async function waitForLoginForm(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const userSelector = await firstVisibleSelector(page, USERNAME_SELECTORS);
    const hasUserInput = userSelector !== null;

    if (hasUserInput) {
      return true;
    }

    // If we are already past login, treat as authenticated session.
    if (!/\/polarion\/login/i.test(page.url())) {
      return false;
    }

    await page.waitForTimeout(2_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  return false;
}

/** Logs in to Polarion via the standard login form and waits for redirect. */
export async function loginAsPolarionAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');

  const formReady = await waitForLoginForm(page, 45_000);

  // Some Polarion environments may already carry an authenticated session.
  if (!formReady) {
    if (!/\/polarion\/login/i.test(page.url())) {
      return;
    }
    throw new Error(`Polarion login form not available (url: ${page.url()})`);
  }

  const userSelector = await firstVisibleSelector(page, USERNAME_SELECTORS);
  const passSelector = await firstVisibleSelector(page, PASSWORD_SELECTORS);
  const submitSelector = await firstVisibleSelector(page, SUBMIT_SELECTORS);

  if (!userSelector || !passSelector || !submitSelector) {
    throw new Error(`Polarion login controls not found (url: ${page.url()})`);
  }

  await page.fill(userSelector, ADMIN_USER);
  await page.fill(passSelector, ADMIN_PASS);
  await page.click(submitSelector);

  // Polarion may keep background network activity alive; avoid relying on networkidle.
  let loggedIn = await page
    .waitForURL((url) => !url.href.includes('/polarion/login'), { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  // Retry submit once (some CI runs occasionally miss the first click dispatch).
  if (!loggedIn) {
    await page.locator(passSelector).press('Enter').catch(() => {});
    await page.click(submitSelector).catch(() => {});
    loggedIn = await page
      .waitForURL((url) => !url.href.includes('/polarion/login'), { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!loggedIn) {
    throw new Error(`Polarion login failed or stuck on login page (url: ${page.url()})`);
  }
}

/**
 * Stores the authenticated Polarion session cookies into the given context so
 * subsequent pages do not need to re-login.
 */
export async function saveSession(context: BrowserContext, page: Page): Promise<void> {
  await loginAsPolarionAdmin(page);
  // Cookies are automatically stored in the context – nothing extra to do.
}
