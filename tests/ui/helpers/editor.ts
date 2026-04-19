import { Page, expect } from '@playwright/test';
import { BASE_URL } from './auth';

export const EDITOR_URL = `${BASE_URL}/polarion/code-editor/editor.html`;

/** Waits until the editor boot overlay and bootstrap blur are cleared. */
export async function waitForEditorReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const boot = document.querySelector('#globalBootLoader');
      const app = document.querySelector('#app-container');
      const bootReady = !boot || !boot.classList.contains('visible');
      const appReady = !app || !app.classList.contains('bootstrap-loading');
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
  await page.goto(url);
  await page.waitForLoadState('networkidle');
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

/** Waits until a file with the given name appears in the sidebar list. */
export async function waitForFileInList(page: Page, fileName: string, timeout = 15_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const names = await getFileList(page);
        return names.some((name) => name.includes(fileName));
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
  await waitForFileInList(page, fileName);
}
