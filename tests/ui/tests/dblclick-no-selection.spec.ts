/**
 * Double-click behaviour tests:
 *  - Double-clicking a file opens it as a persistent tab (no preview)
 *  - Double-clicking a file does NOT produce a browser text selection
 *  - Single-click opens a preview tab; double-click promotes it to persistent
 */
import { test, expect } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clearEditorStorage, tryCreateFile, waitForTab } from '../helpers/editor';

const TS = Date.now();
const FILE_A = `dblclick-test-a-${TS}.txt`;

test.describe('Code Editor – Double-click on file', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
    const created = await tryCreateFile(page, FILE_A);
    test.skip(!created, 'Double-click tests require writable file creation');
  });

  test('double-clicking a file opens a tab', async ({ page }) => {
    const fileItem = page.locator('#fileList .file-item', { hasText: FILE_A });
    await fileItem.dblclick();
    await waitForTab(page, FILE_A);
    await expect(page.locator('#editorTabs .editor-tab', { hasText: FILE_A })).toBeVisible();
  });

  test('double-clicking a file does not produce a text selection', async ({ page }) => {
    const fileItem = page.locator('#fileList .file-item', { hasText: FILE_A });
    await fileItem.dblclick();

    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selectionText).toBe('');
  });

  test('double-clicking a file opens a persistent (non-preview) tab', async ({ page }) => {
    const fileItem = page.locator('#fileList .file-item', { hasText: FILE_A });

    // Single click → preview tab (italic style expected)
    await fileItem.click();
    await waitForTab(page, FILE_A);
    const tabAfterSingleClick = page.locator('#editorTabs .editor-tab', { hasText: FILE_A });
    await expect(tabAfterSingleClick).toBeVisible();

    // Double click → tab should no longer carry the preview class
    await fileItem.dblclick();
    await waitForTab(page, FILE_A);
    const tabAfterDblClick = page.locator('#editorTabs .editor-tab', { hasText: FILE_A });
    await expect(tabAfterDblClick).not.toHaveClass(/preview/, { timeout: 5_000 });
  });

  test('after double-click the file name is visible and not highlighted', async ({ page }) => {
    const fileItem = page.locator('#fileList .file-item', { hasText: FILE_A });
    await fileItem.dblclick();

    // The file item itself should still be visible and selected (active class) —
    // but no browser selection range should be set.
    await expect(fileItem).toBeVisible();

    const hasSelection = await page.evaluate(() => {
      const sel = window.getSelection();
      return sel !== null && sel.rangeCount > 0 && sel.toString().length > 0;
    });
    expect(hasSelection).toBe(false);
  });

});
