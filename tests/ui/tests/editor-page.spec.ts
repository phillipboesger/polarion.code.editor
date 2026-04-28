import { test, expect } from '../fixtures';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, EDITOR_URL } from '../helpers/editor';

test.describe('Code Editor – Page Load & Empty State', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
  });

  test('editor.html loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await openEditor(page);

    // Global boot loader must be gone
    await expect(page.locator('#globalBootLoader')).not.toHaveClass(/visible/, { timeout: 10_000 });
    // App container must NOT still be blurred
    await expect(page.locator('#app-container')).not.toHaveClass(/bootstrap-loading/);

    expect(jsErrors.filter(e =>
      // ignore known non-critical third-party noise
      !e.includes('ResizeObserver') && !e.includes('favicon')
    )).toHaveLength(0);
  });

  test('sidebar is visible and has "EXPLORER" header', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('.sidebar-title')).toContainText('EXPLORER');
  });

  test('"New File" button is present in sidebar header', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('#newBtn')).toBeVisible();
    await expect(page.locator('#newBtn')).toBeEnabled();
  });

  test('empty state overlay shown when no file is selected', async ({ page }) => {
    // Open editor with a fresh storage context so no tabs are restored
    await page.context().clearCookies();
    await loginAsPolarionAdmin(page);
    await page.evaluate(() => localStorage.clear());
    await openEditor(page);

    await expect(page.locator('#emptyState')).toBeVisible();
    await expect(page.locator('#emptyState')).toContainText('No File Selected');
  });

  test('save button is disabled when no file is selected', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('#saveBtn')).toBeDisabled();
  });

  test('toolbar shows "No File Selected" label when no file open', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await openEditor(page);
    await expect(page.locator('#currentFileLabel')).toContainText('No File Selected');
  });

  test('editor page title is "File Editor"', async ({ page }) => {
    await page.goto(EDITOR_URL);
    await expect(page).toHaveTitle('File Editor');
  });

});
