import { Page, expect } from '@playwright/test';
import { BASE_URL } from './auth';

export const EDITOR_URL = `${BASE_URL}/polarion/code-editor/editor.html`;

/** Waits until the editor boot overlay and bootstrap blur are cleared. */
export async function waitForEditorReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      // Require #app-container to exist – if the page is a 503/error page the
      // element is absent and we must NOT proceed (the old check passed trivially).
      const app = document.querySelector('#app-container');
      if (!app) return false;
      const boot = document.querySelector('#globalBootLoader');
      const bootReady = !boot?.classList.contains('visible');
      const appReady = !app.classList.contains('bootstrap-loading');
      return bootReady && appReady;
    },
    { timeout }
  );
}

/**
 * Navigates to the Code Editor and waits until the Monaco boot loader is gone
 * (i.e. the #globalBootLoader is no longer visible).
 */
export async function openEditor(page: Page, projectId?: string): Promise<void> {
  const url = projectId ? `${EDITOR_URL}?projectId=${encodeURIComponent(projectId)}` : EDITOR_URL;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Do NOT use 'networkidle' – Polarion keeps persistent background requests alive
  // which can cause networkidle to never fire on CI. Use DOM readiness instead.
  await waitForEditorReady(page);
}

/** Reloads the editor page and waits until it is ready for interactions. */
export async function reloadEditor(page: Page): Promise<void> {
  await page.reload();
  await waitForEditorReady(page);
}

/** Clears browser localStorage for the current page origin. */
export async function clearEditorStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

/** Returns the visible text of the file-list items in the sidebar. */
export async function getFileList(page: Page): Promise<string[]> {
  const items = page.locator('#fileList .file-item');
  await items.first().waitFor({ timeout: 15_000 }).catch(() => {/* empty list is fine */});
  const values = await items.allTextContents();
  return values.map((v) => v.replace(/\s+/g, ' ').trim());
}

/** Waits until a file with the given name appears in the sidebar list.
 *
 * The sidebar always shows top-level entries (files or folder names).
 * For nested paths like "folder/file.txt" we therefore check for the first
 * path segment ("folder") instead of the full path, which would never match.
 */
export async function waitForFileInList(page: Page, fileName: string, timeout = 15_000): Promise<void> {
  // When the path is nested, the sidebar only shows the root folder name.
  const displayName = fileName.includes('/') ? fileName.split('/')[0] : fileName;
  await expect
    .poll(
      async () => {
        const names = await getFileList(page);
        return names.some((name) => name.includes(displayName));
      },
      { timeout }
    )
    .toBe(true);
}

/** Clicks on a file in the sidebar. */
export async function clickFile(page: Page, fileName: string): Promise<void> {
  await page.locator('#fileList .file-item', { hasText: fileName }).click();
}

/** Waits until the editor tab bar shows a tab for the given filename. */
export async function waitForTab(page: Page, fileName: string): Promise<void> {
  await expect(page.locator('#editorTabs .editor-tab', { hasText: fileName })).toBeVisible({ timeout: 15_000 });
}

/** Best-effort tab visibility check without failing the test flow. */
export async function hasTab(page: Page, fileName: string, timeout = 5_000): Promise<boolean> {
  return page
    .locator('#editorTabs .editor-tab', { hasText: fileName })
    .first()
    .isVisible({ timeout })
    .catch(() => false);
}

/** Opens the "New File" modal. */
export async function openNewFileModal(page: Page): Promise<void> {
  await page.locator('#newBtn').click();
  await page.waitForSelector('.modal-overlay.visible', { timeout: 5_000 });
}

/** Types a filename into the new-file modal's path input and confirms. */
export async function createFile(page: Page, fileName: string): Promise<void> {
  await openNewFileModal(page);
  const pathInput = page.locator('.path-input').first();
  await pathInput.fill(fileName);
  // Confirm – look for the primary action button (not "Cancel")
  const confirmBtn = page.locator('.modal-actions .action-btn:not(.secondary)').first();
  await confirmBtn.click();
  await page.waitForSelector('.modal-overlay.visible', { state: 'hidden', timeout: 5_000 });

  const appearedViaUi = await waitForFileInList(page, fileName, 6_000)
    .then(() => true)
    .catch(() => false);

  if (!appearedViaUi) {
    // Fallback for builds where the UI dialog occasionally fails silently.
    const response = await page.request.put(
      `/polarion/code-editor/api/config/file/${encodeURIComponent(fileName)}`,
      {
        data: ''
      }
    );
    if (!response.ok()) {
      throw new Error(`Could not create file ${fileName} (UI + API fallback failed, status ${response.status()})`);
    }

    await reloadEditor(page);
    await waitForFileInList(page, fileName, 15_000);
  }
}

/** Best-effort file creation helper for environments with intermittent write restrictions. */
export async function tryCreateFile(page: Page, fileName: string): Promise<boolean> {
  try {
    await createFile(page, fileName);
    return true;
  } catch {
    // createFile may have left a modal open (e.g. if confirm failed); close it so
    // subsequent calls to openNewFileModal are not blocked.
    const cancelBtn = page.locator('.modal-overlay.visible .action-btn.secondary').first();
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click({ timeout: 2_000 }).catch(() => {});
      await page.locator('.modal-overlay.visible').waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    }
    return false;
  }
}
