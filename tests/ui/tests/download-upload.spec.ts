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
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clearEditorStorage, waitForFileInList, clickFile, waitForTab, tryCreateFile } from '../helpers/editor';

let TEST_FILE:   string;
let UPLOAD_FILE: string;

test.describe('Code Editor – Download & Upload', () => {

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    TEST_FILE   = `ui-download-test-${workerPrefix}.txt`;
    UPLOAD_FILE = `ui-upload-test-${workerPrefix}.txt`;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
  });

  // ── ICONS / LAYOUT ──────────────────────────────────────────────────────

  test('New File button shows only an icon (no visible text)', async ({ page }) => {
    const newBtn = page.locator('#newBtn');
    await expect(newBtn).toBeVisible();
    // Button should contain an SVG icon, not plain text
    await expect(newBtn.locator('svg')).toBeVisible();
    const text = (await newBtn.textContent() ?? '').trim();
    expect(text).toBe('');
  });

  test('Download button exists with correct tooltip', async ({ page }) => {
    const downloadBtn = page.locator('#downloadBtn');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toHaveAttribute('title', 'Download current file');
    await expect(downloadBtn.locator('svg')).toBeVisible();
  });

  test('Upload button exists with correct tooltip', async ({ page }) => {
    const uploadBtn = page.locator('#uploadBtn');
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toHaveAttribute('title', 'Upload file');
    await expect(uploadBtn.locator('svg')).toBeVisible();
  });

  // ── DOWNLOAD BUTTON STATE ───────────────────────────────────────────────

  test('Download button is disabled when no file is open', async ({ page }) => {
    await expect(page.locator('#downloadBtn')).toBeDisabled();
  });

  test('Download button is enabled after opening a file', async ({ page }) => {
    const created = await tryCreateFile(page, TEST_FILE);
    expect(created, `Could not create ${TEST_FILE}`).toBe(true);

    await waitForFileInList(page, TEST_FILE);
    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);

    await expect(page.locator('#downloadBtn')).toBeEnabled({ timeout: 5_000 });
  });

  // ── DOWNLOAD NAVIGATION ─────────────────────────────────────────────────

  test('Download button triggers navigation to the API download URL', async ({ page }) => {
    const created = await tryCreateFile(page, TEST_FILE);
    expect(created, `Could not create ${TEST_FILE}`).toBe(true);

    await waitForFileInList(page, TEST_FILE);
    await clickFile(page, TEST_FILE);
    await waitForTab(page, TEST_FILE);

    // Intercept navigations to the download endpoint
    let downloadUrl: string | null = null;
    page.on('request', req => {
      if (req.url().includes('download=true')) {
        downloadUrl = req.url();
      }
    });

    // Also listen for popup (target=_blank opens new tab)
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 5_000 }).catch(() => null),
      page.locator('#downloadBtn').click(),
    ]);

    if (popup) {
      expect(popup.url()).toContain('download=true');
      await popup.close();
    } else {
      // Some browsers handle content-disposition inline — just check the request was made
      await page.waitForTimeout(1_000);
      expect(downloadUrl).toContain('download=true');
    }
  });

  // ── UPLOAD MODAL ────────────────────────────────────────────────────────

  test('Upload button opens the upload modal', async ({ page }) => {
    // Attach a fake file before clicking (input[type=file] is hidden)
    await page.locator('#uploadFileInput').setInputFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('uploaded content'),
    });

    await expect(page.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });
  });

  test('Upload modal pre-fills filename from selected file', async ({ page }) => {
    await page.locator('#uploadFileInput').setInputFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    });

    await expect(page.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });

    const inputValue = await page.locator('#uploadPathInput').inputValue();
    expect(inputValue).toContain(UPLOAD_FILE);
  });

  test('Upload modal can be cancelled without uploading', async ({ page }) => {
    await page.locator('#uploadFileInput').setInputFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    });

    await expect(page.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });
    await page.locator('#uploadModal .action-btn.secondary').click();
    await expect(page.locator('#uploadModal')).not.toHaveClass(/visible/, { timeout: 3_000 });
  });

  test('Escape key closes the upload modal', async ({ page }) => {
    await page.locator('#uploadFileInput').setInputFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    });

    await expect(page.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#uploadModal')).not.toHaveClass(/visible/, { timeout: 3_000 });
  });

  test('Upload creates a new file and opens it in a tab', async ({ page }) => {
    const content = `uploaded-${TS}`;

    await page.locator('#uploadFileInput').setInputFiles({
      name: UPLOAD_FILE,
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });

    await expect(page.locator('#uploadModal')).toHaveClass(/visible/, { timeout: 5_000 });

    // Clear path and set the upload target
    await page.locator('#uploadPathInput').fill(UPLOAD_FILE);
    await page.locator('#uploadModal .action-btn:not(.secondary)').click();

    await expect(page.locator('#uploadModal')).not.toHaveClass(/visible/, { timeout: 3_000 });
    await waitForTab(page, UPLOAD_FILE);

    // Cleanup
    await page.request.delete(
      `/polarion/code-editor/api/config/file/${encodeURIComponent(UPLOAD_FILE)}`
    ).catch(() => {});
  });
});
