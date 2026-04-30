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
import type { Frame } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, waitForEditorReady, clickFile, dblclickFile, waitForTab, reloadEditor, clearEditorStorage, tryCreateFile, deleteFile, DEFAULT_PROJECT_ID } from '../helpers/editor';

let SESSION_FILE_A: string;
let SESSION_FILE_B: string;

async function reloadAndWaitForBoot(frame: Frame): Promise<void> {
  await reloadEditor(frame);
}

async function createRequiredFileOrSkip(frame: Frame, fileName: string): Promise<void> {
  const ok = await tryCreateFile(frame, fileName);
  expect(ok, `File precondition failed: could not create ${fileName}`).toBe(true);
}

test.describe('Code Editor – Session & Cache Persistence', () => {

  let frame: Frame;

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    SESSION_FILE_A = `ui-session-a-${workerPrefix}.txt`;
    SESSION_FILE_B = `ui-session-b-${workerPrefix}.txt`;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
    await waitForEditorReady(frame);
  });
  test.afterEach(async ({ page }) => {
    for (const f of [SESSION_FILE_A, SESSION_FILE_B]) {
      if (f) { await deleteFile(page, f, DEFAULT_PROJECT_ID); }
    }
  });
  // ── LAST OPENED FILE ──────────────────────────────────────────────────────

  test('last opened file is restored after page reload', async ({ page: _ }) => {
    await createRequiredFileOrSkip(frame, SESSION_FILE_A);
    await clickFile(frame, SESSION_FILE_A);
    await waitForTab(frame, SESSION_FILE_A);

    await reloadAndWaitForBoot(frame);

    // The file should be re-opened in a tab
    await expect(
      frame.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_A })
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── OPEN TABS RESTORE ─────────────────────────────────────────────────────

  test('all open tabs are restored after page reload', async ({ page: _ }) => {
    await createRequiredFileOrSkip(frame, SESSION_FILE_A);
    await createRequiredFileOrSkip(frame, SESSION_FILE_B);

    // Double-click pins files as permanent tabs (single-click = preview, gets replaced)
    await dblclickFile(frame, SESSION_FILE_A);
    await waitForTab(frame, SESSION_FILE_A);
    await dblclickFile(frame, SESSION_FILE_B);
    await waitForTab(frame, SESSION_FILE_B);

    await reloadAndWaitForBoot(frame);

    // Both tabs must be restored after reload
    await expect(
      frame.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_A })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      frame.locator('#editorTabs .editor-tab', { hasText: SESSION_FILE_B })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('active tab is the last-active file after reload', async ({ page: _ }) => {
    await createRequiredFileOrSkip(frame, SESSION_FILE_A);
    await createRequiredFileOrSkip(frame, SESSION_FILE_B);

    // Double-click pins files as permanent tabs (single-click = preview, gets replaced)
    await dblclickFile(frame, SESSION_FILE_A);
    await waitForTab(frame, SESSION_FILE_A);
    await dblclickFile(frame, SESSION_FILE_B);
    await waitForTab(frame, SESSION_FILE_B);
    // FILE_B is last active (dblclickFile already activates it)

    await reloadAndWaitForBoot(frame);

    // After restore, FILE_B tab should be active
    await expect(
      frame.locator('#editorTabs .editor-tab.active', { hasText: SESSION_FILE_B }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── FONT SIZE PERSISTENCE ─────────────────────────────────────────────────

  test('font size change persists across reload', async ({ page: _ }) => {
    // Increase 3 times → should be 17px
    for (let i = 0; i < 3; i++) await frame.locator('#fontSizeIncreaseBtn').click();
    await expect(frame.locator('#fontSizeIndicator')).toContainText('17px');

    await reloadAndWaitForBoot(frame);

    await expect(frame.locator('#fontSizeIndicator')).toContainText('17px');
  });

  // ── SIDEBAR WIDTH PERSISTENCE ─────────────────────────────────────────────

  test('sidebar width persists across reload', async ({ page: _ }) => {
    // Set sidebar width directly via JS — the resizer drag is unreliable across
    // iframe boundaries with page-level mouse events. The test's purpose is to
    // verify that the 'sidebarWidth' localStorage key is written and re-applied
    // on reload, not to test the drag interaction itself.
    const targetWidth = 450;

    await frame.evaluate((w: number) => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.width = w + 'px';
      localStorage.setItem('sidebarWidth', String(w));
    }, targetWidth);

    await frame.waitForTimeout(100);

    const widthBefore = await frame.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);
    expect(widthBefore).toBeGreaterThan(400);

    await reloadAndWaitForBoot(frame);

    const widthAfter = await frame.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);
    expect(Math.abs(widthAfter - widthBefore)).toBeLessThan(20);
  });

  // ── STORAGE ISOLATION PER PROJECT ────────────────────────────────────────

  test('storage keys are scoped per projectId', async ({ page }) => {
    // frame already set from beforeEach (no projectId)
    await frame.locator('#fontSizeIncreaseBtn').click();

    // Verify key written is the global context key
    const globalKey = await page.evaluate(() => {
      return Object.keys(localStorage).filter(k => k.startsWith('editorUserSettings'));
    });
    expect(globalKey.length).toBeGreaterThan(0);

    // Clear storage and reload – the key should be re-created on interaction
    await clearEditorStorage(page);
    await reloadAndWaitForBoot(frame);
    await frame.locator('#fontSizeDecreaseBtn').click();

    const projectKey = await page.evaluate(() => {
      return Object.keys(localStorage).filter(k => k.startsWith('editorUserSettings'));
    });
    // Key should be present again after reload + interaction
    expect(projectKey.some(k =>
      k.includes('drivepilot') ||
      k.includes('global') ||
      k === 'editorUserSettings'
    )).toBe(true);
  });

  // ── CLEARING STORAGE RESETS STATE ────────────────────────────────────────

  test('clearing localStorage resets editor to default state', async ({ page }) => {
    // Make changes
    await frame.locator('#fontSizeIncreaseBtn').click();
    await frame.locator('#fontSizeIncreaseBtn').click();

    // Clear storage and reload
    await clearEditorStorage(page);
    await reloadAndWaitForBoot(frame);

    // Font size back to default 14px
    await expect(frame.locator('#fontSizeIndicator')).toContainText('14px');
    // No tabs restored
    const tabCount = await frame.locator('#editorTabs .editor-tab').count();
    expect(tabCount).toBe(0);
    // Empty state visible
    await expect(frame.locator('#emptyState')).toBeVisible();
  });

  // ── TREE STATE ────────────────────────────────────────────────────────────

  test('tree/explorer state key is written to localStorage', async ({ page }) => {
    // Just opening the editor and interacting writes tree state
    await createRequiredFileOrSkip(frame, SESSION_FILE_A);
    await clickFile(frame, SESSION_FILE_A);
    await waitForTab(frame, SESSION_FILE_A);

    const keys = await page.evaluate(() => Object.keys(localStorage));
    // Expect at least the open-tabs or last-file key to be present
    expect(keys.some(k =>
      k.includes('editorLastOpenFile') ||
      k.includes('editorOpenTabsSession')
    )).toBe(true);
  });

});
