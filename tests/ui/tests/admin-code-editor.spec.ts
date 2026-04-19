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
 * Polarion uses j_username / j_password / #submitButton.
 */
async function loginAsPolarionAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/`);
  await page.waitForLoadState('networkidle');

  await page.fill('#j_username', ADMIN_USER);
  await page.fill('#j_password', ADMIN_PASS);
  await page.click('#submitButton');

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
