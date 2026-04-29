/**
 * Double-click behaviour tests:
 *  - Double-clicking a file opens it as a persistent tab (no preview)
 *  - Double-clicking a file does NOT produce a browser text selection
 *  - Single-click opens a preview tab; double-click promotes it to persistent
 */
import { test, expect } from '../fixtures';
import type { Frame } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clearEditorStorage, reloadEditor, tryCreateFile, waitForTab } from '../helpers/editor';

let FILE_A: string;

test.describe('Code Editor – Double-click on file', () => {

  let frame: Frame;

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    FILE_A = `dblclick-test-a-${workerPrefix}.txt`;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    frame = await openEditor(page);
    await clearEditorStorage(page);
    await reloadEditor(frame);
    const created = await tryCreateFile(frame, FILE_A);
    expect(created, 'Double-click tests require writable file creation').toBe(true);
  });

  test('double-clicking a file opens a tab', async ({ page: _ }) => {
    const fileItem = frame.locator('#fileList .file-item', { hasText: FILE_A });
    await fileItem.dblclick();
    await waitForTab(frame, FILE_A);
    await expect(frame.locator('#editorTabs .editor-tab', { hasText: FILE_A }).first()).toBeVisible();
  });

  test('double-clicking a file does not produce a text selection', async ({ page: _ }) => {
    const fileItem = frame.locator('#fileList .file-item', { hasText: FILE_A });
    await fileItem.dblclick();

    const selectionText = await frame.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selectionText).toBe('');
  });

  test('double-clicking a file opens a persistent (non-preview) tab', async ({ page: _ }) => {
    const fileItem = frame.locator('#fileList .file-item', { hasText: FILE_A });

    // Single click → preview tab (italic style expected)
    await fileItem.click();
    await waitForTab(frame, FILE_A);
    const tabAfterSingleClick = frame.locator('#editorTabs .editor-tab', { hasText: FILE_A }).first();
    await expect(tabAfterSingleClick).toBeVisible();

    // Double click → tab should no longer carry the preview class
    await fileItem.dblclick();
    await waitForTab(frame, FILE_A);
    const tabAfterDblClick = frame.locator('#editorTabs .editor-tab', { hasText: FILE_A }).first();
    await expect(tabAfterDblClick).not.toHaveClass(/preview/, { timeout: 5_000 });
  });

  test('after double-click the file name is visible and not highlighted', async ({ page: _ }) => {
    const fileItem = frame.locator('#fileList .file-item', { hasText: FILE_A });
    await fileItem.dblclick();

    // The file item itself should still be visible and selected (active class) —
    // but no browser selection range should be set.
    await expect(fileItem).toBeVisible();

    const hasSelection = await frame.evaluate(() => {
      const sel = window.getSelection();
      return sel !== null && sel.rangeCount > 0 && sel.toString().length > 0;
    });
    expect(hasSelection).toBe(false);
  });

});
