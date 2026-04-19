import { test, expect, Page } from '@playwright/test';
import { BASE_URL, loginAsPolarionAdmin } from '../helpers/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigates to the Repository (Global) Administration in Polarion.
 * Polarion uses hash-based routing: /#/administration
 */
async function navigateToRepositoryAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/#/administration`);
  await page.waitForLoadState('domcontentloaded');
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
    await expect
      .poll(async () => page.getByText(/Code Editor/i).count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const codeEditorEntry = page.getByText(/Code Editor/i).first();
    await expect(codeEditorEntry).toBeVisible({ timeout: 20_000 });
  });

});
