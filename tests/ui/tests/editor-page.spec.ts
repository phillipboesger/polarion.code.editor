import { test, expect } from '../fixtures';
import type { Frame } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, EDITOR_URL } from '../helpers/editor';

test.describe('Code Editor – Page Load & Empty State', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
  });

  test('editor.html loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    const frame: Frame = await openEditor(page);

    // Global boot loader must be gone
    await expect(frame.locator('#globalBootLoader')).not.toHaveClass(/visible/, { timeout: 10_000 });
    // App container must NOT still be blurred
    await expect(frame.locator('#app-container')).not.toHaveClass(/bootstrap-loading/);

    expect(jsErrors.filter(e =>
      // ignore known non-critical third-party noise
      !e.includes('ResizeObserver') && !e.includes('favicon')
    )).toHaveLength(0);
  });

  test('sidebar is visible and has "EXPLORER" header', async ({ page }) => {
    const frame: Frame = await openEditor(page);
    await expect(frame.locator('#sidebar')).toBeVisible();
    await expect(frame.locator('.sidebar-title')).toContainText('EXPLORER');
  });

  test('"New File" button is present in sidebar header', async ({ page }) => {
    const frame: Frame = await openEditor(page);
    await expect(frame.locator('#newBtn')).toBeVisible();
    await expect(frame.locator('#newBtn')).toBeEnabled();
  });

  test('empty state overlay shown when no file is selected', async ({ page }) => {
    // Open editor with a fresh storage context so no tabs are restored
    await page.context().clearCookies();
    await loginAsPolarionAdmin(page);
    await page.evaluate(() => localStorage.clear());
    const frame: Frame = await openEditor(page);

    await expect(frame.locator('#emptyState')).toBeVisible();
    await expect(frame.locator('#emptyState')).toContainText('No File Selected');
  });

  test('save button is disabled when no file is selected', async ({ page }) => {
    const frame: Frame = await openEditor(page);
    await expect(frame.locator('#saveBtn')).toBeDisabled();
  });

  test('save button has tooltip with keyboard shortcut', async ({ page }) => {
    const frame: Frame = await openEditor(page);
    await expect(frame.locator('#saveBtn')).toHaveAttribute('title', 'Save current file (Ctrl+S)');
  });

  test('toolbar buttons have tooltips', async ({ page }) => {
    const frame: Frame = await openEditor(page);
    await expect(frame.locator('#newBtn')).toHaveAttribute('title', 'New File');
    await expect(frame.locator('#uploadBtn')).toHaveAttribute('title', 'Upload file');
    await expect(frame.locator('#downloadBtn')).toHaveAttribute('title', 'Download current file');
    await expect(frame.locator('#collapseSidebar')).toHaveAttribute('title', 'Collapse Sidebar');
    await expect(frame.locator('#expandSidebar')).toHaveAttribute('title', 'Show Explorer');
    await expect(frame.locator('#fontSizeDecreaseBtn')).toHaveAttribute('title', 'Editor Font Size -');
    await expect(frame.locator('#fontSizeResetBtn')).toHaveAttribute('title', 'Editor Font Size Reset');
    await expect(frame.locator('#fontSizeIncreaseBtn')).toHaveAttribute('title', 'Editor Font Size +');
  });

  test('toolbar shows "No File Selected" label when no file open', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    const frame: Frame = await openEditor(page);
    await expect(frame.locator('#currentFileLabel')).toContainText('No File Selected');
  });

  test('editor page title is "File Editor"', async ({ page }) => {
    await page.goto(EDITOR_URL);
    await expect(page).toHaveTitle('File Editor');
  });

});
