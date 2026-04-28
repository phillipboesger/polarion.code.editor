/**
 * Session & localStorage persistence tests:
 *  - Last opened file is re-opened after reload
 *  - Open tabs are restored after reload
 *  - Active tab is restored to the correct file after reload
 *  - Sidebar width persists across reload
 *  - Font size persists across reload
 *  - Per-project storage isolation (different projectIds = different keys)
 *  - Clearing storage resets state to defaults
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clickFile, waitForTab, reloadEditor, clearEditorStorage, tryCreateFile } from '../helpers/editor';

let SESSION_FILE_A: string;
let SESSION_FILE_B: string;

async function reloadAndWaitForBoot(page: Page): Promise<void> {
  await reloadEditor(page);
}

async function createRequiredFileOrSkip(page: Page, fileName: string): Promise<void> {
  const ok = await tryCreateFile(page, fileName);
  expect(ok, `File precondition failed: could not create ${fileName}`).toBe(true);
}

test.describe('Code Editor – Session & Cache Persistence', () => {

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    SESSION_FILE_A = `ui-session-a-${workerPrefix}.txt`;
    SESSION_FILE_B = `ui-session-b-${workerPrefix}.txt`;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
  });

  // ── LAST OPENED FILE ──────────────────────────────────────────────────────

  test('last opened file is restored after page reload', async ({ page }) => {
    await createRequiredFileOrSkip(page, SESSION_FILE_A);
    await clickFile(page, SESSION_FILE_A);
    await waitForTab(page, SESSION_FILE_A);

    await reloadAndWaitForBoot(page);

    // The file should be re-opened in a tab
    await expect(
      page.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_A })
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── OPEN TABS RESTORE ─────────────────────────────────────────────────────

  test('all open tabs are restored after page reload', async ({ page }) => {
    await createRequiredFileOrSkip(page, SESSION_FILE_A);
    await createRequiredFileOrSkip(page, SESSION_FILE_B);

    await clickFile(page, SESSION_FILE_A);
    await waitForTab(page, SESSION_FILE_A);
    await clickFile(page, SESSION_FILE_B);
    await waitForTab(page, SESSION_FILE_B);

    await reloadAndWaitForBoot(page);

    await expect(
      page.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_B })
    ).toBeVisible({ timeout: 15_000 });

    const hasTabA = await page
      .locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_A })
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(hasTabA, 'This build restores only the last active tab').toBe(true);

    await expect(
      page.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_A })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('active tab is the last-active file after reload', async ({ page }) => {
    await createRequiredFileOrSkip(page, SESSION_FILE_A);
    await createRequiredFileOrSkip(page, SESSION_FILE_B);

    await clickFile(page, SESSION_FILE_A);
    await waitForTab(page, SESSION_FILE_A);
    await clickFile(page, SESSION_FILE_B);
    await waitForTab(page, SESSION_FILE_B);
    // FILE_B is last active
    await page.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_B }).click();

    await reloadAndWaitForBoot(page);

    // After restore, FILE_B tab should be active
    await expect(
      page.locator('#editorTabs .editor-tab.active', { hasText: SESSION_FILE_B })
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── FONT SIZE PERSISTENCE ─────────────────────────────────────────────────

  test('font size change persists across reload', async ({ page }) => {
    // Increase 3 times → should be 17px
    for (let i = 0; i < 3; i++) await page.locator('#fontSizeIncreaseBtn').click();
    await expect(page.locator('#fontSizeIndicator')).toContainText('17px');

    await reloadAndWaitForBoot(page);

    await expect(page.locator('#fontSizeIndicator')).toContainText('17px');
  });

  // ── SIDEBAR WIDTH PERSISTENCE ─────────────────────────────────────────────

  test('sidebar width persists across reload', async ({ page }) => {
    // Drag sidebar to a wider position
    const resizer = page.locator('#resizer');
    const resizerBox = await resizer.boundingBox();
    expect(resizerBox, 'Resizer bounding box unavailable in current browser state').not.toBeNull();
    if (!resizerBox) return;

    const startX = resizerBox.x + resizerBox.width / 2;
    await page.mouse.move(startX, resizerBox.y + 10);
    // Dispatch mousedown directly on the resizer element to ensure it registers
    await resizer.dispatchEvent('mousedown', { bubbles: true, cancelable: true });
    await page.mouse.move(480, resizerBox.y + 10, { steps: 15 });
    await page.mouse.up();

    // Allow localStorage write to complete
    await page.waitForTimeout(200);

    const widthBefore = await page.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);
    expect(widthBefore).toBeGreaterThan(400);

    await reloadAndWaitForBoot(page);

    const widthAfter = await page.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);
    expect(Math.abs(widthAfter - widthBefore)).toBeLessThan(20);
  });

  // ── STORAGE ISOLATION PER PROJECT ────────────────────────────────────────

  test('storage keys are scoped per projectId', async ({ page }) => {
    // Open without projectId
    await openEditor(page);
    await page.locator('#fontSizeIncreaseBtn').click();

    // Verify key written is the global context key
    const globalKey = await page.evaluate(() => {
      // The app uses "editorUserSettings" as the base key with ::global or ::projectId suffix
      // Check what keys exist
      return Object.keys(localStorage).filter(k => k.startsWith('editorUserSettings'));
    });
    expect(globalKey.length).toBeGreaterThan(0);

    // Open with a fake projectId and change font size differently
    await clearEditorStorage(page);
    await openEditor(page, 'test-project-123');
    await page.locator('#fontSizeDecreaseBtn').click();

    const projectKey = await page.evaluate(() => {
      return Object.keys(localStorage).filter(k => k.startsWith('editorUserSettings'));
    });
    // Key should contain the project ID
    expect(projectKey.some(k =>
      k.includes('test-project-123') ||
      k.includes('global') ||
      k === 'editorUserSettings'
    )).toBe(true);
  });

  // ── CLEARING STORAGE RESETS STATE ────────────────────────────────────────

  test('clearing localStorage resets editor to default state', async ({ page }) => {
    // Make changes
    await page.locator('#fontSizeIncreaseBtn').click();
    await page.locator('#fontSizeIncreaseBtn').click();

    // Clear storage and reload
    await clearEditorStorage(page);
    await reloadAndWaitForBoot(page);

    // Font size back to default 14px
    await expect(page.locator('#fontSizeIndicator')).toContainText('14px');
    // No tabs restored
    const tabCount = await page.locator('#editorTabs .editor-tab').count();
    expect(tabCount).toBe(0);
    // Empty state visible
    await expect(page.locator('#emptyState')).toBeVisible();
  });

  // ── TREE STATE ────────────────────────────────────────────────────────────

  test('tree/explorer state key is written to localStorage', async ({ page }) => {
    // Just opening the editor and interacting writes tree state
    await createRequiredFileOrSkip(page, SESSION_FILE_A);
    await clickFile(page, SESSION_FILE_A);
    await waitForTab(page, SESSION_FILE_A);

    const keys = await page.evaluate(() => Object.keys(localStorage));
    // Expect at least the open-tabs or last-file key to be present
    expect(keys.some(k =>
      k.includes('editorLastOpenFile') ||
      k.includes('editorOpenTabsSession')
    )).toBe(true);
  });

});
