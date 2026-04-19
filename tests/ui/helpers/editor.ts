import { Page, expect } from '@playwright/test';
import { BASE_URL } from './auth';

export const EDITOR_URL = `${BASE_URL}/polarion/code-editor/editor.html`;

/**
 * Navigates to the Code Editor and waits until the Monaco boot loader is gone
 * (i.e. the #globalBootLoader is no longer visible).
 */
export async function openEditor(page: Page, projectId?: string): Promise<void> {
  const url = projectId ? `${EDITOR_URL}?projectId=${encodeURIComponent(projectId)}` : EDITOR_URL;
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  // Wait until the boot-loader overlay disappears
  await page.waitForSelector('#globalBootLoader:not(.visible)', { timeout: 30_000 });
}

/** Returns the visible text of the file-list items in the sidebar. */
export async function getFileList(page: Page): Promise<string[]> {
  const items = page.locator('#fileList .file-item .file-name');
  await items.first().waitFor({ timeout: 15_000 }).catch(() => {/* empty list is fine */});
  return items.allTextContents();
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
}
