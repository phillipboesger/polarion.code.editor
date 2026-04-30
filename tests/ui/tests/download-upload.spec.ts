/**
 * Tests for Download and Upload functionality in the Code Editor:
 *  - Download button is disabled when no file is open
 *  - Download button is enabled when a file is open
 *  - Download triggers a file download via API (Content-Disposition)
 *  - Upload button opens the upload modal
 *  - Upload modal has correct pre-filled path and can be cancelled
 *  - New File button is an icon-only button (no text label)
 */
import { test, expect } from '../fixtures';
import type { Frame } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clearEditorStorage, waitForFileInList, clickFile, waitForTab, tryCreateFile, deleteFile, DEFAULT_PROJECT_ID } from '../helpers/editor';

let TEST_FILE:   string;
let UPLOAD_FILE: string;
let TS:          string;

test.describe('Code Editor – Download & Upload', () => {

  let frame: Frame;

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    TS          = workerPrefix;
    TEST_FILE   = `ui-download-test-${workerPrefix}.txt`;
    UPLOAD_FILE = `ui-upload-test-${workerPrefix}.txt`;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
  });
  test.afterEach(async ({ page }) => {
    for (const f of [TEST_FILE, UPLOAD_FILE]) {
      if (f) { await deleteFile(page, f, DEFAULT_PROJECT_ID); }
    }
  });
  // ── ICONS / LAYOUT ──────────────────────────────────────────────────────

  test('New File button shows only an icon (no visible text)', async ({ page: _ }) => {
    const newBtn = frame.locator('#newBtn');
    await expect(newBtn).toBeVisible();
    // Button should contain an SVG icon, not plain text
    await expect(newBtn.locator('svg')).toBeVisible();
    const text = (await newBtn.textContent() ?? '').trim();
    expect(text).toBe('');
  });

  test('Download button exists with correct tooltip', async ({ page: _ }) => {
    const downloadBtn = frame.locator('#downloadBtn');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toHaveAttribute('title', 'Download current file');
    await expect(downloadBtn.locator('svg')).toBeVisible();
  });

  test('Upload button exists with correct tooltip', async ({ page: _ }) => {
    const uploadBtn = frame.locator('#uploadBtn');
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toHaveAttribute('title', 'Upload file');
    await expect(uploadBtn.locator('svg')).toBeVisible();
  });

  // ── DOWNLOAD BUTTON STATE ───────────────────────────────────────────────

  test('Download button is disabled when no file is open', async ({ page: _ }) => {
    await expect(frame.locator('#downloadBtn')).toBeDisabled();
  });

  test('Download button is enabled after opening a file', async ({ page }) => {
    const created = await tryCreateFile(frame, TEST_FILE);
    expect(created, `Could not create ${TEST_FILE}`).toBe(true);

    await waitForFileInList(frame, TEST_FILE);
    await clickFile(frame, TEST_FILE);
    await waitForTab(frame, TEST_FILE);

    await expect(frame.locator('#downloadBtn')).toBeEnabled({ timeout: 5_000 });
  });

  // ── DOWNLOAD NAVIGATION ─────────────────────────────────────────────────

  test('Download button triggers navigation to the API download URL', async ({ page }) => {
    const created = await tryCreateFile(frame, TEST_FILE);
    expect(created, `Could not create ${TEST_FILE}`).toBe(true);

    await waitForFileInList(frame, TEST_FILE);
    await clickFile(frame, TEST_FILE);
    await waitForTab(frame, TEST_FILE);

    // <a download="..."> triggers a Playwright download event — not a navigation or popup
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      frame.locator('#downloadBtn').click(),
    ]);

    expect(download.suggestedFilename()).toBe(TEST_FILE);
    expect(download.url()).toContain('download=true');
  });

  // ── UPLOAD MODAL ────────────────────────────────────────────────────────

  test('Upload button opens the upload modal', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      frame.locator('#uploadBtn').click(),
    ]);
    await fileChooser.setFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('uploaded content'),
    });

    await expect(frame.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });
  });

  test('Upload modal pre-fills filename from selected file', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      frame.locator('#uploadBtn').click(),
    ]);
    await fileChooser.setFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    });

    await expect(frame.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });

    const inputValue = await frame.locator('#uploadPathInput').inputValue();
    expect(inputValue).toContain(UPLOAD_FILE);
  });

  test('Upload modal can be cancelled without uploading', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      frame.locator('#uploadBtn').click(),
    ]);
    await fileChooser.setFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    });

    await expect(frame.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });
    await frame.locator('#uploadModal .action-btn.secondary').click();
    await expect(frame.locator('#uploadModal')).not.toHaveClass(/visible/, { timeout: 3_000 });
  });

  test('Escape key closes the upload modal', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      frame.locator('#uploadBtn').click(),
    ]);
    await fileChooser.setFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    });

    await expect(frame.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(frame.locator('#uploadModal')).not.toHaveClass(/visible/, { timeout: 3_000 });
  });

  test('Upload creates a new file and opens it in a tab', async ({ page }) => {
    const content = `uploaded-${TS}`;

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      frame.locator('#uploadBtn').click(),
    ]);
    await fileChooser.setFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });

    await expect(frame.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });

    // Clear path and set the upload target
    await frame.locator('#uploadPathInput').fill(UPLOAD_FILE);
    await frame.locator('#uploadModal .action-btn:not(.secondary)').click();

    await expect(frame.locator('#uploadModal')).not.toHaveClass(/visible/, { timeout: 3_000 });
    await waitForTab(frame, UPLOAD_FILE);

    // Cleanup
    await page.request.delete(
      `/polarion/code-editor/api/config/file/${encodeURIComponent(UPLOAD_FILE)}`
    ).catch(() => {});
  });
});
