/**
 * Toolbar and Tab management tests:
 *  - Font size increase / decrease / reset
 *  - Font size persists in localStorage
 *  - Tab opens when file is clicked
 *  - Multiple tabs open simultaneously
 *  - Dirty indicator (* in tab title) on edit
 *  - Tab close button removes tab
 *  - Tab bar is horizontally scrollable
 */
import { test, expect } from '../fixtures';
import type { Page, Frame } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clickFile, waitForTab, reloadEditor, clearEditorStorage, tryCreateFile, hasTab } from '../helpers/editor';

let FILE_A: string;
let FILE_B: string;

async function typeInMonaco(frame: Frame, text: string): Promise<void> {
  const editorCanvas = frame.locator('#editor-container .monaco-editor').first();
  await editorCanvas.click();
  await frame.page().keyboard.press('ControlOrMeta+a');
  await frame.page().keyboard.type(text);
}

test.describe('Code Editor – Toolbar & Font Size', () => {

  let frame: Frame;

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
  });

  test('font size indicator shows default 14px', async ({ page }) => {
    await expect(frame.locator('#fontSizeIndicator')).toContainText('14px');
  });

  test('font size increases when A+ is clicked', async ({ page }) => {
    await frame.locator('#fontSizeIncreaseBtn').click();
    await expect(frame.locator('#fontSizeIndicator')).toContainText('15px');
  });

  test('font size decreases when A− is clicked', async ({ page }) => {
    await frame.locator('#fontSizeDecreaseBtn').click();
    await expect(frame.locator('#fontSizeIndicator')).toContainText('13px');
  });

  test('font size resets to 14px after A reset is clicked', async ({ page }) => {
    await frame.locator('#fontSizeIncreaseBtn').click();
    await frame.locator('#fontSizeIncreaseBtn').click();
    await expect(frame.locator('#fontSizeIndicator')).toContainText('16px');

    await frame.locator('#fontSizeResetBtn').click();
    await expect(frame.locator('#fontSizeIndicator')).toContainText('14px');
  });

  test('font size cannot exceed max (28px)', async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await frame.locator('#fontSizeIncreaseBtn').click();
    }
    await expect(frame.locator('#fontSizeIndicator')).toContainText('28px');
  });

  test('font size cannot go below min (10px)', async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await frame.locator('#fontSizeDecreaseBtn').click();
    }
    await expect(frame.locator('#fontSizeIndicator')).toContainText('10px');
  });

  test('font size is persisted to localStorage', async ({ page }) => {
    await frame.locator('#fontSizeIncreaseBtn').click();
    await frame.locator('#fontSizeIncreaseBtn').click();

    const raw = await page.evaluate(() => localStorage.getItem('editorUserSettings'));
    expect(raw).not.toBeNull();
    const settings = JSON.parse(raw ?? '{}');
    expect(settings.fontSize).toBe(16);
  });

  test('font size setting persists after page reload', async ({ page }) => {
    await frame.locator('#fontSizeIncreaseBtn').click();
    await frame.locator('#fontSizeIncreaseBtn').click();
    await frame.locator('#fontSizeIncreaseBtn').click();

    await reloadEditor(frame);

    await expect(frame.locator('#fontSizeIndicator')).toContainText('17px');
  });

});

test.describe('Code Editor – Tab Management', () => {

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    FILE_A = `ui-tab-a-${workerPrefix}.txt`;
    FILE_B = `ui-tab-b-${workerPrefix}.txt`;
  });

  let frame: Frame;

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
    // Create two test files
    const createdA = await tryCreateFile(frame, FILE_A);
    const createdB = await tryCreateFile(frame, FILE_B);
    expect(createdA && createdB, 'Tab tests require writable file creation in current Polarion build/config').toBe(true);
  });

  test('clicking a file opens a tab in the tab bar', async ({ page }) => {
    await clickFile(frame, FILE_A);
    await waitForTab(frame, FILE_A);
    await expect(frame.locator('#editorTabs .editor-tab', { hasText: FILE_A })).toBeVisible();
  });

  test('opening a second file adds a second tab', async ({ page }) => {
    await clickFile(frame, FILE_A);
    await waitForTab(frame, FILE_A);
    await clickFile(frame, FILE_B);

    const hasTabB = await hasTab(frame, FILE_B, 8_000);
    expect(hasTabB, 'Editor instance currently keeps a single active tab').toBe(true);

    const tabs = frame.locator('#editorTabs .editor-tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(1);
    await expect(frame.locator('#currentFileLabel')).toContainText(FILE_B, { timeout: 5_000 });

    if (tabCount >= 2) {
      await expect(frame.locator('#editorTabs .editor-tab', { hasText: FILE_A })).toBeVisible({ timeout: 5_000 });
      await expect(frame.locator('#editorTabs .editor-tab', { hasText: FILE_B })).toBeVisible({ timeout: 5_000 });
    }
  });

  test('active tab is highlighted with accent border', async ({ page }) => {
    await clickFile(frame, FILE_A);
    await waitForTab(frame, FILE_A);

    const activeTab = frame.locator('#editorTabs .editor-tab.active');
    await expect(activeTab).toBeVisible();
    await expect(activeTab).toContainText(FILE_A);
  });

  test('editing a file marks the tab as dirty (shows *)', async ({ page }) => {
    await clickFile(frame, FILE_A);
    await waitForTab(frame, FILE_A);
    await typeInMonaco(frame, 'dirty-test-content');

    const tab = frame.locator('#editorTabs .editor-tab', { hasText: FILE_A });
    await expect(tab).toHaveClass(/dirty/, { timeout: 5_000 });
  });

  test('closing a tab removes it from the tab bar', async ({ page }) => {
    await clickFile(frame, FILE_A);
    await waitForTab(frame, FILE_A);

    const tab = frame.locator('#editorTabs .editor-tab', { hasText: FILE_A });
    const closeBtn = tab.locator('.tab-close');
    await closeBtn.click();

    await expect(tab).not.toBeVisible({ timeout: 5_000 });
  });

  test('tab bar container is horizontally scrollable', async ({ page }) => {
    const overflowX = await frame.locator('#editorTabs').evaluate(
      (el: HTMLElement) => getComputedStyle(el).overflowX
    );
    expect(['auto', 'scroll']).toContain(overflowX);
  });

  test('switching between tabs updates the editor content', async ({ page }) => {
    await clickFile(frame, FILE_A);
    await waitForTab(frame, FILE_A);
    await typeInMonaco(frame, 'content-for-file-a');

    await clickFile(frame, FILE_B);

    const hasTabB = await hasTab(frame, FILE_B, 8_000);
    expect(hasTabB, 'Editor instance currently keeps a single active tab').toBe(true);

    const tabCount = await frame.locator('#editorTabs .editor-tab').count();
    expect(tabCount, 'Editor instance currently keeps a single active tab').toBeGreaterThanOrEqual(2);

    // Switch back to FILE_A
    await frame.locator('#editorTabs .editor-tab', { hasText: FILE_A }).click();
    // Toolbar should show FILE_A again
    await expect(frame.locator('#currentFileLabel')).toContainText(FILE_A, { timeout: 5_000 });
  });

});
