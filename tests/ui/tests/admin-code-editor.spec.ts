import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants – override via environment variables if needed
// ---------------------------------------------------------------------------
const BASE_URL  = process.env.POLARION_URL  ?? 'http://localhost';
const ADMIN_USER = process.env.POLARION_USER ?? 'admin';
const ADMIN_PASS = process.env.POLARION_PASS ?? 'admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Logs in to Polarion via the standard login form.
 * Works for both the classic JSP form and the Angular-wrapper login page.
 */
async function loginAsPolarionAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/`);
  await page.waitForLoadState('networkidle');

  // Polarion login form – try common selector variants
  const usernameSelectors = ['input[name="loginName"]', 'input[name="username"]', '#loginName'];
  const passwordSelectors = ['input[name="password"]', '#password'];

  let filledUser = false;
  for (const sel of usernameSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0) {
      await loc.fill(ADMIN_USER);
      filledUser = true;
      break;
    }
  }
  if (!filledUser) {
    throw new Error('Could not find Polarion username input. Check the login page selectors.');
  }

  for (const sel of passwordSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0) {
      await loc.fill(ADMIN_PASS);
      break;
    }
  }

  // Submit the form
  const submitSelectors = [
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("Log In")',
    'button:has-text("Login")',
  ];
  for (const sel of submitSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0) {
      await loc.click();
      break;
    }
  }

  await page.waitForLoadState('networkidle');
}

/**
 * Navigates to the Repository (Global) Administration in Polarion.
 * Polarion uses hash-based routing: /#/administration
 */
async function navigateToRepositoryAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/#/administration`);
  await page.waitForLoadState('networkidle');
  // Give the Angular/Dojo router time to render the admin navigation
  await page.waitForTimeout(3_000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Polarion Administration – Code Editor Plugin', () => {

  test('Code Editor entry is visible in Repository Administration', async ({ page }) => {
    // Step 1: Log in
    await loginAsPolarionAdmin(page);

    // Sanity-check: we should be past the login page
    await expect(page).not.toHaveURL(/login/i, { timeout: 10_000 });

    // Step 2: Open Repository Administration
    await navigateToRepositoryAdmin(page);

    // Diagnostic screenshot – captured on success as well as failure in CI
    await page.screenshot({ path: 'playwright-report/admin-page.png', fullPage: true });

    // Step 3: Assert the "Code Editor" navigation entry is present.
    // The plugin registers itself via:
    //   com.polarion.xray.webui.administrationPageExtenders  id="code-editor"  name="Code Editor"
    // Polarion renders these as links / list items in the left admin nav.
    const codeEditorEntry = page.getByText('Code Editor', { exact: false });
    await expect(codeEditorEntry).toBeVisible({ timeout: 20_000 });
  });

});
