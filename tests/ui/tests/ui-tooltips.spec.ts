/**
 * Tooltip coverage tests:
 *  - Every interactive button (static and dynamic) exposes a non-empty
 *    `title` attribute so users see a hover tooltip explaining its purpose.
 *
 * Static buttons live in editor.html (toolbar, sidebar header, modals).
 * Dynamic buttons are created at runtime in the file tree
 * (rename/delete row actions, tab close).
 */
import { test, expect } from '../fixtures';
import type { Frame, Locator, Page } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import {
  openEditor,
  clearEditorStorage,
  tryCreateFile,
  clickFile,
  waitForTab,
  deleteFile,
  DEFAULT_PROJECT_ID,
} from '../helpers/editor';

async function expectNonEmptyTitle(locator: Locator): Promise<void> {
  const title = await locator.getAttribute('title');
  expect(title, 'expected element to have a non-empty title attribute').not.toBeNull();
  expect(
    (title ?? '').trim().length,
    `expected a meaningful tooltip, got "${title}"`,
  ).toBeGreaterThan(0);
}

test.describe('Code Editor – Button Tooltips (static)', () => {

  let frame: Frame;

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
  });

  test('sidebar header buttons have tooltips', async () => {
    await expectNonEmptyTitle(frame.locator('#downloadBtn'));
    await expectNonEmptyTitle(frame.locator('#uploadBtn'));
    await expectNonEmptyTitle(frame.locator('#newBtn'));
    await expectNonEmptyTitle(frame.locator('#collapseSidebar'));
  });

  test('expand-sidebar button has a tooltip', async () => {
    // Collapse first so the expand button becomes visible
    await frame.locator('#collapseSidebar').click();
    const expandBtn = frame.locator('#expandSidebar');
    await expect(expandBtn).toBeVisible();
    await expectNonEmptyTitle(expandBtn);
  });

  test('toolbar font-size buttons have tooltips', async () => {
    await expectNonEmptyTitle(frame.locator('#fontSizeDecreaseBtn'));
    await expectNonEmptyTitle(frame.locator('#fontSizeResetBtn'));
    await expectNonEmptyTitle(frame.locator('#fontSizeIncreaseBtn'));
  });

  test('save button has a tooltip', async () => {
    await expectNonEmptyTitle(frame.locator('#saveBtn'));
  });

  test('confirm-dialog buttons have tooltips', async () => {
    await expectNonEmptyTitle(frame.locator('#customDialogCancelBtn'));
    await expectNonEmptyTitle(frame.locator('#customDialogOkBtn'));
  });

  test('new-file modal buttons have tooltips', async () => {
    await expectNonEmptyTitle(frame.locator('#btnConfirmCreate'));
    await expectNonEmptyTitle(
      frame.locator('#newFileModal .modal-actions button.secondary'),
    );
  });

  test('rename modal buttons have tooltips', async () => {
    await expectNonEmptyTitle(frame.locator('#btnConfirmRename'));
    await expectNonEmptyTitle(
      frame.locator('#renameFileModal .modal-actions button.secondary'),
    );
  });

  test('upload modal buttons have tooltips', async () => {
    const buttons = frame.locator('#uploadModal .modal-actions button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expectNonEmptyTitle(buttons.nth(i));
    }
  });

  test('every static <button> in the editor has a non-empty title attribute', async () => {
    // Walk every <button> element in the DOM, ignoring buttons inside the
    // dynamic file-tree (covered separately because they are created at runtime).
    const missing = await frame.evaluate(() => {
      const offenders: string[] = [];
      for (const btn of Array.from(document.querySelectorAll('button'))) {
        if (btn.closest('#fileList')) continue;
        const title = btn.getAttribute('title');
        if (!title || title.trim().length === 0) {
          offenders.push(btn.id || btn.className || btn.outerHTML.slice(0, 80));
        }
      }
      return offenders;
    });
    expect(missing, `Buttons without tooltip:\n${missing.join('\n')}`).toEqual([]);
  });

});

test.describe('Code Editor – Button Tooltips (dynamic)', () => {

  let FILE_NAME: string;

  test.beforeAll(async ({ workerPrefix }: { workerPrefix: string }) => {
    FILE_NAME = `ui-tooltip-${workerPrefix}.txt`;
  });

  let frame: Frame;

  test.beforeEach(async ({ page }: { page: Page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
    const created = await tryCreateFile(frame, FILE_NAME);
    expect(
      created,
      'Tooltip tests require file creation to be writable in this build',
    ).toBe(true);
  });

  test.afterEach(async ({ page }: { page: Page }) => {
    if (FILE_NAME) {
      await deleteFile(page, FILE_NAME, DEFAULT_PROJECT_ID);
    }
  });

  test('file row rename and delete buttons have tooltips', async () => {
    const fileRow = frame
      .locator('#fileList .file-item', { hasText: FILE_NAME })
      .first();
    await expect(fileRow).toBeVisible({ timeout: 10_000 });
    const renameBtn = fileRow.locator('button.list-btn').nth(0);
    const deleteBtn = fileRow.locator('button.list-btn.delete-btn');
    await expectNonEmptyTitle(renameBtn);
    await expectNonEmptyTitle(deleteBtn);
  });

  test('tab close button has a tooltip', async () => {
    await clickFile(frame, FILE_NAME);
    await waitForTab(frame, FILE_NAME);
    const closeBtn = frame
      .locator('#editorTabs .editor-tab', { hasText: FILE_NAME })
      .locator('.tab-close');
    await expectNonEmptyTitle(closeBtn);
  });

});
