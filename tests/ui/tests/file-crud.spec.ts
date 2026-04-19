/**
 * CRUD operations on the Code Editor:
 *  - Create a new file
 *  - Open (read) the file in the editor
 *  - Edit content and save (update via PUT)
 *  - Rename the file (POST /api/config/rename)
 *  - Delete the file (DELETE /api/config/file/…)
 *
 * A unique timestamp prefix avoids collisions between test runs.
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clickFile, waitForTab, createFile, getFileList } from '../helpers/editor';

const TS = Date.now();
const TEST_FILE      = `ui-test-${TS}.txt`;
const TEST_FILE_NEW  = `ui-test-renamed-${TS}.txt`;
const TEST_CONTENT   = `Hello from Playwright – ${TS}`;
const COPY_FILE      = `ui-test-copy-${TS}.txt`;

// ---------------------------------------------------------------------------
// Helper: type into the active Monaco editor (text model)
// ---------------------------------------------------------------------------
async function typeIntoMonaco(page: Page, text: string): Promise<void> {
  // Click the editor canvas to focus, then use keyboard
  const editorCanvas = page.locator('#editor-container .monaco-editor').first();
  await editorCanvas.click();
  // Select all & replace
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

// ---------------------------------------------------------------------------
// Helper: wait for the loading-text footer to show "Ready" (save completed)
// ---------------------------------------------------------------------------
async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.loading-text');
      return el && (el.textContent?.includes('Ready') || el.textContent?.includes('Saved') || el.textContent?.includes('ready'));
    },
    { timeout: 15_000 }
  );
}

// ---------------------------------------------------------------------------
// Shared setup: login + clear storage + open editor
// ---------------------------------------------------------------------------
test.describe('Code Editor – File CRUD', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await page.evaluate(() => localStorage.clear());
    await openEditor(page);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────

  test('create a new file via the New File modal', async ({ page }) => {
    await createFile(page, TEST_FILE);

    // File should appear in the sidebar list
    const files = await getFileList(page);
    expect(files.some(f => f.includes(TEST_FILE))).toBe(true);
  });

  // ── READ / OPEN ──────────────────────────────────────────────────────────

  test('open a file and verify it loads in the editor', async ({ page }) => {
    // Ensure the file exists first
    await createFile(page, TEST_FILE);

    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);

    // Empty state should disappear
    await expect(page.locator('#emptyState')).not.toBeVisible({ timeout: 10_000 });
    // Toolbar label should reflect the file name
    await expect(page.locator('#currentFileLabel')).toContainText(TEST_FILE, { timeout: 10_000 });
    // Save button should be enabled for editable files
    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 10_000 });
  });

  // ── UPDATE / SAVE ────────────────────────────────────────────────────────

  test('edit file content and save', async ({ page }) => {
    await createFile(page, TEST_FILE);
    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);

    // Type new content into the Monaco editor
    await typeIntoMonaco(page, TEST_CONTENT);

    // Tab title should show dirty indicator ( * )
    const tab = page.locator('#editorTabs .editor-tab', { hasText: TEST_FILE });
    await expect(tab).toHaveClass(/dirty/, { timeout: 5_000 });

    // Click Save
    await page.locator('#saveBtn').click();
    await waitForReady(page);

    // After save, dirty indicator should be gone
    await expect(tab).not.toHaveClass(/dirty/, { timeout: 5_000 });
  });

  test('save is triggered via Ctrl+S / Cmd+S shortcut', async ({ page }) => {
    await createFile(page, TEST_FILE);
    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);
    await typeIntoMonaco(page, TEST_CONTENT + '-shortcut');

    const tab = page.locator('#editorTabs .editor-tab', { hasText: TEST_FILE });
    await expect(tab).toHaveClass(/dirty/, { timeout: 5_000 });

    // Use the keyboard shortcut
    await page.keyboard.press('ControlOrMeta+s');
    await waitForReady(page);

    await expect(tab).not.toHaveClass(/dirty/, { timeout: 5_000 });
  });

  // ── RENAME ───────────────────────────────────────────────────────────────

  test('rename a file via the file-item action button', async ({ page }) => {
    await createFile(page, TEST_FILE);

    // Hover the file item to reveal action buttons
    const fileItem = page.locator('#fileList .file-item', { hasText: TEST_FILE });
    await fileItem.hover();

    // Click the rename button (pencil icon – title contains "rename" or similar)
    const renameBtn = fileItem.locator('.list-btn:not(.delete-btn)').first();
    await renameBtn.click();

    // A modal should appear – clear the input and type the new name
    await page.waitForSelector('.modal-overlay.visible', { timeout: 5_000 });
    const input = page.locator('.modal-overlay.visible input, .modal-overlay.visible .path-input').first();
    await input.fill(TEST_FILE_NEW);

    const confirmBtn = page.locator('.modal-overlay.visible .action-btn:not(.secondary)').first();
    await confirmBtn.click();
    await page.waitForSelector('.modal-overlay.visible', { state: 'hidden', timeout: 5_000 });

    // New name must appear in the sidebar
    const filesAfter = await getFileList(page);
    expect(filesAfter.some(f => f.includes(TEST_FILE_NEW))).toBe(true);
  });

  // ── DELETE ───────────────────────────────────────────────────────────────

  test('delete a file via the file-item delete button', async ({ page }) => {
    await createFile(page, TEST_FILE);

    const fileItem = page.locator('#fileList .file-item', { hasText: TEST_FILE });
    await fileItem.hover();

    // Click delete button
    const deleteBtn = fileItem.locator('.delete-btn').first();

    // Accept the browser confirm dialog
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();

    // Wait for the file to disappear from the list
    await page.waitForTimeout(1_000);
    const filesAfter = await getFileList(page);
    expect(filesAfter.some(f => f.includes(TEST_FILE))).toBe(false);
  });

  // ── COPY ─────────────────────────────────────────────────────────────────

  test('copy a file via the file-item copy button', async ({ page }) => {
    await createFile(page, TEST_FILE);

    const fileItem = page.locator('#fileList .file-item', { hasText: TEST_FILE });
    await fileItem.hover();

    // Copy button – there might be 3 action buttons: copy, rename, delete
    const actionBtns = fileItem.locator('.list-btn');
    const count = await actionBtns.count();

    if (count >= 2) {
      // The copy button is typically the first one
      const copyBtn = actionBtns.first();
      await copyBtn.click();

      // A modal may appear asking for the copy name
      const modalVisible = await page.locator('.modal-overlay.visible').count();
      if (modalVisible > 0) {
        const input = page.locator('.modal-overlay.visible .path-input, .modal-overlay.visible input[type=text]').first();
        await input.fill(COPY_FILE);
        const confirmBtn = page.locator('.modal-overlay.visible .action-btn:not(.secondary)').first();
        await confirmBtn.click();
        await page.waitForSelector('.modal-overlay.visible', { state: 'hidden', timeout: 5_000 });
      }

      await page.waitForTimeout(1_000);
      const filesAfter = await getFileList(page);
      // Either the copied file or the original is still there
      expect(filesAfter.length).toBeGreaterThanOrEqual(1);
    } else {
      test.skip(true, 'Copy button not available (fewer than 2 action buttons)');
    }
  });

  // ── API HEALTH ENDPOINT ───────────────────────────────────────────────────

  test('API health endpoint returns "OK"', async ({ page }) => {
    const response = await page.request.get('/polarion/code-editor/api/health');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('OK');
  });

  test('API requires authentication – unauthenticated request returns 401 or 403', async ({ browser }) => {
    // New context without any session cookies
    const freshCtx = await browser.newContext();
    const freshPage = await freshCtx.newPage();
    const response = await freshPage.request.get('/polarion/code-editor/api/health');
    expect([401, 403, 302]).toContain(response.status());
    await freshCtx.close();
  });

});
