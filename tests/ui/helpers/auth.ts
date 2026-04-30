import { Page, BrowserContext } from '@playwright/test';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const BASE_URL   = env.POLARION_URL  ?? 'http://localhost';
export const ADMIN_USER = env.POLARION_USER ?? 'admin';
export const ADMIN_PASS = env.POLARION_PASS ?? 'admin';

/** Credentials for the two parallel Playwright test workers. */
export const TEST_USERS = [
  { id: 'playwright_w1', name: 'Playwright Worker 1', password: 'Playwright@W1!' }, // NOSONAR – intentional test credential
  { id: 'playwright_w2', name: 'Playwright Worker 2', password: 'Playwright@W2!' }, // NOSONAR – intentional test credential
] as const;

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

/** Returns true if the login form (username input) is currently visible on the page. */
async function isLoginFormVisible(page: Page): Promise<boolean> {
  const sel = await firstVisibleSelector(page, USERNAME_SELECTORS);
  return sel !== null;
}

async function waitForLoginForm(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isLoginFormVisible(page)) {
      return true;
    }

    // If we are already authenticated (no login form and not on the login page), done.
    if (!page.url().endsWith('/polarion') && !page.url().endsWith('/polarion/')) {
      return false;
    }

    await page.waitForTimeout(2_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  return false;
}

/** Logs in to Polarion via the standard login form and waits for redirect. */
export async function loginAsPolarionAdmin(page: Page): Promise<void> {
  // The Polarion login page lives at /polarion (not /polarion/login)
  await page.goto(`${BASE_URL}/polarion`, { waitUntil: 'domcontentloaded' });

  // Fresh Polarion instances (e.g. in CI) show a trial-activation screen first.
  // Click "Start 30-Day Trial" so the login form becomes available.
  const trialButton = page.getByRole('button', { name: 'Start 30-Day Trial' });
  if (await trialButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await trialButton.click();
    await page.waitForLoadState('domcontentloaded');
  }

  // If the login form is not visible, we may already be authenticated.
  if (!await isLoginFormVisible(page)) {
    return;
  }

  const formReady = await waitForLoginForm(page, 20_000);

  if (!formReady) {
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

  // Wait for the login form to disappear – reliable across all Polarion redirect patterns.
  let loggedIn = await page
    .waitForFunction(() => !document.querySelector('#j_username, input[name="j_username"]'), { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  // Retry submit once (some CI runs occasionally miss the first click dispatch).
  if (!loggedIn) {
    await page.locator(passSelector).press('Enter').catch(() => {});
    await page.click(submitSelector).catch(() => {});
    loggedIn = await page
      .waitForFunction(() => !document.querySelector('#j_username, input[name="j_username"]'), { timeout: 10_000 })
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
