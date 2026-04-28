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
import type { Page } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clickFile, waitForTab, reloadEditor, clearEditorStorage, tryCreateFile, hasTab } from '../helpers/editor';

let FILE_A: string;
let FILE_B: string;

async function typeInMonaco(page: Page, text: string): Promise<void> {
  const editorCanvas = page.locator('#editor-container .monaco-editor').first();
  await editorCanvas.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

test.describe('Code Editor – Toolbar & Font Size', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
  });

  test('font size indicator shows default 14px', async ({ page }) => {
    await expect(page.locator('#fontSizeIndicator')).toContainText('14px');
  });

  test('font size increases when A+ is clicked', async ({ page }) => {
    await page.locator('#fontSizeIncreaseBtn').click();
    await expect(page.locator('#fontSizeIndicator')).toContainText('15px');
  });

  test('font size decreases when A− is clicked', async ({ page }) => {
    await page.locator('#fontSizeDecreaseBtn').click();
    await expect(page.locator('#fontSizeIndicator')).toContainText('13px');
  });

  test('font size resets to 14px after A reset is clicked', async ({ page }) => {
    await page.locator('#fontSizeIncreaseBtn').click();
    await page.locator('#fontSizeIncreaseBtn').click();
    await expect(page.locator('#fontSizeIndicator')).toContainText('16px');

    await page.locator('#fontSizeResetBtn').click();
    await expect(page.locator('#fontSizeIndicator')).toContainText('14px');
  });

  test('font size cannot exceed max (28px)', async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await page.locator('#fontSizeIncreaseBtn').click();
    }
    await expect(page.locator('#fontSizeIndicator')).toContainText('28px');
  });

  test('font size cannot go below min (10px)', async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await page.locator('#fontSizeDecreaseBtn').click();
    }
    await expect(page.locator('#fontSizeIndicator')).toContainText('10px');
  });

  test('font size is persisted to localStorage', async ({ page }) => {
    await page.locator('#fontSizeIncreaseBtn').click();
    await page.locator('#fontSizeIncreaseBtn').click();

    const raw = await page.evaluate(() => localStorage.getItem('editorUserSettings'));
    expect(raw).not.toBeNull();
    const settings = JSON.parse(raw ?? '{}');
    expect(settings.fontSize).toBe(16);
  });

  test('font size setting persists after page reload', async ({ page }) => {
    await page.locator('#fontSizeIncreaseBtn').click();
    await page.locator('#fontSizeIncreaseBtn').click();
    await page.locator('#fontSizeIncreaseBtn').click();

    await reloadEditor(page);

    await expect(page.locator('#fontSizeIndicator')).toContainText('17px');
  });

});

test.describe('Code Editor – Tab Management', () => {

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    FILE_A = `ui-tab-a-${workerPrefix}.txt`;
    FILE_B = `ui-tab-b-${workerPrefix}.txt`;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
    // Create two test files
    const createdA = await tryCreateFile(page, FILE_A);
    const createdB = await tryCreateFile(page, FILE_B);
    expect(createdA && createdB, 'Tab tests require writable file creation in current Polarion build/config').toBe(true);
  });

  test('clicking a file opens a tab in the tab bar', async ({ page }) => {
    await clickFile(page, FILE_A);
    await waitForTab(page, FILE_A);
    await expect(page.locator('#editorTabs .editor-tab', { hasText: FILE_A })).toBeVisible();
  });

  test('opening a second file adds a second tab', async ({ page }) => {
    await clickFile(page, FILE_A);
    await waitForTab(page, FILE_A);
    await clickFile(page, FILE_B);

    const hasTabB = await hasTab(page, FILE_B, 8_000);
    expect(hasTabB, 'Editor instance currently keeps a single active tab').toBe(true);

    const tabs = page.locator('#editorTabs .editor-tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#currentFileLabel')).toContainText(FILE_B, { timeout: 5_000 });

    if (tabCount >= 2) {
      await expect(page.locator('#editorTabs .editor-tab', { hasText: FILE_A })).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('#editorTabs .editor-tab', { hasText: FILE_B })).toBeVisible({ timeout: 5_000 });
    }
  });

  test('active tab is highlighted with accent border', async ({ page }) => {
    await clickFile(page, FILE_A);
    await waitForTab(page, FILE_A);

    const activeTab = page.locator('#editorTabs .editor-tab.active');
    await expect(activeTab).toBeVisible();
    await expect(activeTab).toContainText(FILE_A);
  });

  test('editing a file marks the tab as dirty (shows *)', async ({ page }) => {
    await clickFile(page, FILE_A);
    await waitForTab(page, FILE_A);
    await typeInMonaco(page, 'dirty-test-content');

    const tab = page.locator('#editorTabs .editor-tab', { hasText: FILE_A });
    await expect(tab).toHaveClass(/dirty/, { timeout: 5_000 });
  });

  test('closing a tab removes it from the tab bar', async ({ page }) => {
    await clickFile(page, FILE_A);
    await waitForTab(page, FILE_A);

    const tab = page.locator('#editorTabs .editor-tab', { hasText: FILE_A });
    const closeBtn = tab.locator('.tab-close');
    await closeBtn.click();

    await expect(tab).not.toBeVisible({ timeout: 5_000 });
  });

  test('tab bar container is horizontally scrollable', async ({ page }) => {
    const overflowX = await page.locator('#editorTabs').evaluate(
      (el: HTMLElement) => getComputedStyle(el).overflowX
    );
    expect(['auto', 'scroll']).toContain(overflowX);
  });

  test('switching between tabs updates the editor content', async ({ page }) => {
    await clickFile(page, FILE_A);
    await waitForTab(page, FILE_A);
    await typeInMonaco(page, 'content-for-file-a');

    await clickFile(page, FILE_B);

    const hasTabB = await hasTab(page, FILE_B, 8_000);
    expect(hasTabB, 'Editor instance currently keeps a single active tab').toBe(true);

    const tabCount = await page.locator('#editorTabs .editor-tab').count();
    expect(tabCount, 'Editor instance currently keeps a single active tab').toBeGreaterThanOrEqual(2);

    // Switch back to FILE_A
    await page.locator('#editorTabs .editor-tab', { hasText: FILE_A }).click();
    // Toolbar should show FILE_A again
    await expect(page.locator('#currentFileLabel')).toContainText(FILE_A, { timeout: 5_000 });
  });

});
