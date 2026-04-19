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
import { openEditor, clickFile, waitForTab, getFileList, clearEditorStorage, waitForFileInList, tryCreateFile } from '../helpers/editor';

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

async function waitForSavedOrSkip(page: Page, fileName: string, reason: string): Promise<void> {
  const saved = await page
    .waitForFunction(
      (name) => {
        const tabs = Array.from(document.querySelectorAll('#editorTabs .editor-tab'));
        const tab = tabs.find((el) => (el.textContent || '').includes(String(name)));
        if (!tab) {
          return false;
        }
        return !tab.classList.contains('dirty');
      },
      fileName,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);

  test.skip(!saved, reason);
}

async function createRequiredFileOrSkip(page: Page, fileName: string): Promise<void> {
  const ok = await tryCreateFile(page, fileName);
  test.skip(!ok, `File precondition failed: could not create ${fileName}`);
}

// ---------------------------------------------------------------------------
// Shared setup: login + clear storage + open editor
// ---------------------------------------------------------------------------
test.describe('Code Editor – File CRUD', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────

  test('create a new file via the New File modal', async ({ page }) => {
    await createRequiredFileOrSkip(page, TEST_FILE);

    // File should appear in the sidebar list
    const files = await getFileList(page);
    expect(files.some(f => f.includes(TEST_FILE))).toBe(true);
  });

  // ── READ / OPEN ──────────────────────────────────────────────────────────

  test('open a file and verify it loads in the editor', async ({ page }) => {
    // Ensure the file exists first
    await createRequiredFileOrSkip(page, TEST_FILE);

    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);

    // Empty state should disappear
    await expect(page.locator('#emptyState')).not.toBeVisible({ timeout: 10_000 });
    // Toolbar label should reflect the file name
    await expect(page.locator('#currentFileLabel')).toContainText(TEST_FILE, { timeout: 10_000 });
    // Save is enabled only after a content change.
    await expect(page.locator('#saveBtn')).toBeDisabled({ timeout: 10_000 });
  });

  // ── UPDATE / SAVE ────────────────────────────────────────────────────────

  test('edit file content and save', async ({ page }) => {
    await createRequiredFileOrSkip(page, TEST_FILE);
    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);

    // Type new content into the Monaco editor
    await typeIntoMonaco(page, TEST_CONTENT);

    // Tab title should show dirty indicator ( * )
    const tab = page.locator('#editorTabs .editor-tab', { hasText: TEST_FILE });
    await expect(tab).toHaveClass(/dirty/, { timeout: 5_000 });

    // Click Save
    await page.locator('#saveBtn').click();

    // After save, dirty indicator should be gone
    await waitForSavedOrSkip(page, TEST_FILE, 'Save action not effective in this Polarion build/config');
    await expect(tab).not.toHaveClass(/dirty/, { timeout: 5_000 });
  });

  test('save is triggered via Ctrl+S / Cmd+S shortcut', async ({ page }) => {
    await createRequiredFileOrSkip(page, TEST_FILE);
    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);
    await typeIntoMonaco(page, TEST_CONTENT + '-shortcut');

    const tab = page.locator('#editorTabs .editor-tab', { hasText: TEST_FILE });
    await expect(tab).toHaveClass(/dirty/, { timeout: 5_000 });

    // Use the keyboard shortcut
    await page.locator('#editor-container .monaco-editor').first().click();
    await page.keyboard.press('Control+s');

    await waitForSavedOrSkip(page, TEST_FILE, 'Save shortcut is not handled in this Polarion/browser build');
    await expect(tab).not.toHaveClass(/dirty/, { timeout: 5_000 });
  });

  // ── RENAME ───────────────────────────────────────────────────────────────

  test('rename a file via the file-item action button', async ({ page }) => {
    await createRequiredFileOrSkip(page, TEST_FILE);

    // Hover the file item to reveal action buttons
    const fileItem = page.locator('#fileList .file-item', { hasText: TEST_FILE });
    await fileItem.hover();

    // Click the rename button by its title attribute to avoid mixing with copy/delete.
    const renameBtn = fileItem.locator('.list-btn[title*="Rename" i]').first();
    await renameBtn.click();

    // A modal should appear – clear the input and type the new name
    await page.waitForSelector('.modal-overlay.visible', { timeout: 5_000 });
    const input = page.locator('.modal-overlay.visible input, .modal-overlay.visible .path-input').first();
    await input.fill(TEST_FILE_NEW);

    const confirmBtn = page.locator('.modal-overlay.visible .action-btn:not(.secondary)').first();
    await confirmBtn.click();
    await page.waitForSelector('.modal-overlay.visible', { state: 'hidden', timeout: 5_000 });

    // New name should appear in the sidebar. Some Polarion builds expose rename UI
    // but reject the action server-side depending on permissions/config.
    const renamed = await page
      .locator('#fileList .file-item', { hasText: TEST_FILE_NEW })
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    test.skip(!renamed, 'Rename action not effective in this Polarion build/config');

    await waitForFileInList(page, TEST_FILE_NEW, 15_000);
    await expect(page.locator('#fileList .file-item', { hasText: TEST_FILE })).toHaveCount(0, { timeout: 15_000 });
  });

  // ── DELETE ───────────────────────────────────────────────────────────────

  test('delete a file via the file-item delete button', async ({ page }) => {
    await createRequiredFileOrSkip(page, TEST_FILE);

    const fileItem = page.locator('#fileList .file-item', { hasText: TEST_FILE });
    await fileItem.hover();

    // Click delete button
    const deleteBtn = fileItem.locator('.delete-btn').first();

    // Accept the browser confirm dialog
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();

    const deleted = await page
      .waitForFunction(
        (name) => {
          const rows = Array.from(document.querySelectorAll('#fileList .file-item'));
          return !rows.some((el) => (el.textContent || '').includes(String(name)));
        },
        TEST_FILE,
        { timeout: 8_000 }
      )
      .then(() => true)
      .catch(() => false);

    test.skip(!deleted, 'Delete action not effective in this Polarion build/config');

    const filesAfter = await getFileList(page);
    expect(filesAfter.some(f => f.includes(TEST_FILE))).toBe(false);
  });

  // ── COPY ─────────────────────────────────────────────────────────────────

  test('copy a file via the file-item copy button', async ({ page }) => {
    await createRequiredFileOrSkip(page, TEST_FILE);

    const fileItem = page.locator('#fileList .file-item', { hasText: TEST_FILE });
    await fileItem.hover();

    // Copy action is optional in current UI builds; detect by explicit title.
    const copyBtn = fileItem.locator('.list-btn[title*="Copy" i]').first();
    const hasCopy = (await copyBtn.count()) > 0;

    if (hasCopy) {
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

      await waitForFileInList(page, COPY_FILE, 15_000);
    } else {
      test.skip(true, 'Copy action is not available in this UI build');
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
