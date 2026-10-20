import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
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

    // Step 2 + 3: Open Repository Administration and assert the "Code Editor" navigation entry.
    // The plugin registers itself via hivemodule.xml:
    //   com.polarion.xray.webui.administrationPageExtenders  id="code-editor"  name="Code Editor"
    // Polarion renders these as links / list items in the left admin nav.
    // This is the first test of the run and runs against a cold Polarion: the admin SPA
    // sometimes has not rendered its navigation after the first load (the entry count stays 0).
    // Reloading the admin page and checking again is what a user does and makes the check
    // independent of that cold start.
    await expect(async () => {
      await navigateToRepositoryAdmin(page);
      // Diagnostic screenshot – captured on success as well as failure in CI
      await page.screenshot({ path: 'playwright-report/admin-page.png', fullPage: true });
      await expect
        .poll(async () => page.getByText(/Code Editor/i).count(), { timeout: 12_000 })
        .toBeGreaterThan(0);
    }).toPass({ timeout: 60_000 });

    const codeEditorEntry = page.getByText(/Code Editor/i).first();
    await expect(codeEditorEntry).toBeVisible({ timeout: 20_000 });
  });

});
