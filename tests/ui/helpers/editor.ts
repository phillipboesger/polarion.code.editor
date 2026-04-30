import { Page, Frame, expect } from '@playwright/test';
import { BASE_URL } from './auth';

export const EDITOR_URL = `${BASE_URL}/polarion/code-editor/editor.html`;

/** Default project used when openEditor() is called without a projectId.
 *  The global /#/administration/code-editor route never sets working_area.src
 *  and loads editor.html without ?projectId, so a project-specific route is
 *  always required. */
export const DEFAULT_PROJECT_ID = process.env.POLARION_PROJECT_ID ?? 'drivepilot';

function projectEditorSpaUrl(projectId: string): string {
  return `${BASE_URL}/polarion/#/project/${encodeURIComponent(projectId)}/administration/code-editor`;
}

const GLOBAL_EDITOR_SPA_URL = `${BASE_URL}/polarion/#/administration/code-editor`;


/** Waits until the editor boot overlay and bootstrap blur are cleared. */
export async function waitForEditorReady(frame: Frame, timeout = 30_000): Promise<void> {
  await frame.waitForFunction(
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
 * Navigates to the Code Editor via the Polarion SPA hash-route so that the
 * full Polarion project-context is established before the editor loads.
 *
 * How it works:
 *  1. Navigate to the SPA hash-route (with or without a projectId).
 *  2. Polarion renders the editor inside an <iframe>.  Wait until the SPA
 *     replaces the "javascript:''" placeholder with a real HTTP src.
 *  3. If the SPA shows a nav-overview first (no iframe within 5 s), click the
 *     "Code Editor" navigation item to trigger the iframe load.
 *  4. Navigate the Playwright page directly to the extracted iframe src so all
 *     #fileList / #editorTabs / … selectors work at the top-level DOM level.
 */
export async function openEditor(page: Page, projectId?: string): Promise<Frame> {
  // Always use a project-specific SPA route.  The global admin route
  // (/#/administration/code-editor) never sets working_area.src and loads
  // editor.html without ?projectId, so every API call would fail.
  const spaUrl = projectEditorSpaUrl(projectId ?? DEFAULT_PROJECT_ID);

  // IMPORTANT: register the framenavigated listener BEFORE page.goto() so
  // the event cannot be missed by a race between navigation and listener setup.
  //
  // IMPORTANT: use the { predicate, timeout } options-object form.  In
  // Playwright ≤1.44 the signature is waitForEvent(event, optionsOrPredicate)
  // – passing a plain function as second arg and options as a *third* arg is
  // NOT supported; the third arg is silently ignored and actionTimeout (30 s)
  // is used instead.
  //
  // GWT navigates working_area's contentWindow directly without setting the
  // HTML src attribute, so waitForSelector('[src*="code-editor"]') never
  // fires – framenavigated is the correct hook.
  const editorFramePromise = page.waitForEvent('framenavigated', {
    predicate: frame => frame.name() === 'working_area' && frame.url().includes('code-editor'),
    timeout: process.env.CI ? 60_000 : 30_000,
  });

  await page.goto(spaUrl, { waitUntil: 'domcontentloaded' });

  const editorFrame = await editorFramePromise;
  // Wait for Monaco's require() callback to complete – window.editor is set
  // right before setupResizer() is called, so this guarantees the resizer
  // (and all other JS initialisation) has run before the test interacts.
  await editorFrame.waitForFunction(
    () => !!(globalThis as Record<string, unknown>)['editor'],
    { timeout: process.env.CI ? 30_000 : 15_000 }
  );
  return editorFrame;
}

/**
 * Opens the global Code Editor admin page (no project context).
 * Files must be created without a projectId to be visible here.
 */
export async function openGlobalEditor(page: Page): Promise<Frame> {
  const editorFramePromise = page.waitForEvent('framenavigated', {
    predicate: frame => frame.name() === 'working_area' && frame.url().includes('code-editor'),
    timeout: process.env.CI ? 60_000 : 30_000,
  });

  await page.goto(GLOBAL_EDITOR_SPA_URL, { waitUntil: 'domcontentloaded' });

  const editorFrame = await editorFramePromise;
  await editorFrame.waitForFunction(
    () => !!(globalThis as Record<string, unknown>)['editor'],
    { timeout: process.env.CI ? 30_000 : 15_000 }
  );
  return editorFrame;
}

/** Reloads the editor frame in-place and waits until it is ready for interactions. */
export async function reloadEditor(frame: Frame): Promise<void> {
  await frame.goto(frame.url(), { waitUntil: 'domcontentloaded' });
  await waitForEditorReady(frame);
}

/** Clears browser localStorage for the editor origin.
 *  Safe to call on a Page or Frame – both share the same localhost origin
 *  so the clear affects the editor's storage regardless of which is passed. */
export async function clearEditorStorage(pageOrFrame: Page | Frame): Promise<void> {
  await pageOrFrame.evaluate(() => localStorage.clear());
}

/** Returns the visible text of the file-list items in the sidebar. */
export async function getFileList(frame: Frame): Promise<string[]> {
  const items = frame.locator('#fileList .file-item');
  await items.first().waitFor({ timeout: 15_000 }).catch(() => {/* empty list is fine */});
  const values = await items.allTextContents();
  return values.map((v) => v.replaceAll(/\s+/g, ' ').trim());
}

/** Waits until a file with the given name appears in the sidebar list.
 *
 * The sidebar always shows top-level entries (files or folder names).
 * For nested paths like "folder/file.txt" we therefore check for the first
 * path segment ("folder") instead of the full path, which would never match.
 */
export async function waitForFileInList(frame: Frame, fileName: string, timeout = 15_000): Promise<void> {
  // When the path is nested, the sidebar only shows the root folder name.
  const displayName = fileName.includes('/') ? fileName.split('/')[0] : fileName;
  await expect
    .poll(
      async () => {
        const names = await getFileList(frame);
        return names.some((name) => name.includes(displayName));
      },
      { timeout }
    )
    .toBe(true);
}

/** Clicks on a file in the sidebar (opens as preview tab). */
export async function clickFile(frame: Frame, fileName: string): Promise<void> {
  await frame.locator('#fileList .file-item', { hasText: fileName }).click();
}

/** Double-clicks on a file in the sidebar (pins it as a permanent tab). */
export async function dblclickFile(frame: Frame, fileName: string): Promise<void> {
  await frame.locator('#fileList .file-item', { hasText: fileName }).dblclick();
}

/** Waits until the editor tab bar shows a tab for the given filename. */
export async function waitForTab(frame: Frame, fileName: string): Promise<void> {
  await expect(frame.locator('#editorTabs .editor-tab', { hasText: fileName }).first()).toBeVisible({ timeout: 15_000 });
}

/** Best-effort tab visibility check without failing the test flow. */
export async function hasTab(frame: Frame, fileName: string, timeout = 5_000): Promise<boolean> {
  return frame
    .locator('#editorTabs .editor-tab', { hasText: fileName })
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/** Opens the "New File" modal. */
export async function openNewFileModal(frame: Frame): Promise<void> {
  await frame.locator('#newBtn').click();
  await frame.waitForSelector('.modal-overlay.visible', { timeout: 5_000 });
}

/** Types a filename into the new-file modal's path input and confirms. */
export async function createFile(frame: Frame, fileName: string, projectId?: string): Promise<void> {
  await openNewFileModal(frame);
  const pathInput = frame.locator('#newFileName');
  await pathInput.fill(fileName);
  // Confirm – use the specific button ID to avoid accidentally clicking
  // #customDialogOkBtn which is the first .action-btn:not(.secondary) in the DOM.
  const confirmBtn = frame.locator('#btnConfirmCreate');
  await confirmBtn.click();
  await frame.waitForSelector('.modal-overlay.visible', { state: 'hidden', timeout: 5_000 });

  const appearedViaUi = await waitForFileInList(frame, fileName, 15_000)
    .then(() => true)
    .catch(() => false);

  if (!appearedViaUi) {
    // Fallback for builds where the UI dialog occasionally fails silently.
    // Extract projectId from frame URL if not explicitly provided (e.g. ?projectId=drivepilot).
    const frameProjectId = projectId ?? new URL(frame.url()).searchParams.get('projectId') ?? undefined;
    const query = frameProjectId ? `?projectId=${encodeURIComponent(frameProjectId)}` : '';
    const response = await frame.page().request.put(
      `/polarion/code-editor/api/config/file/${encodeURIComponent(fileName)}${query}`,
      { data: '' }
    );
    if (!response.ok()) {
      throw new Error(`Could not create file ${fileName} (UI + API fallback failed, status ${response.status()})`);
    }

    await reloadEditor(frame);
    await waitForFileInList(frame, fileName, 15_000);
  }
}

/**
 * Best-effort file deletion via the REST API.
 * Silently ignores errors (e.g. file does not exist or environment is read-only).
 */
export async function deleteFile(page: Page, fileName: string, projectId?: string): Promise<void> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  await page.request
    .delete(`/polarion/code-editor/api/config/file/${encodeURIComponent(fileName)}${query}`)
    .catch(() => {/* best-effort */});
}

/** Best-effort file creation helper for environments with intermittent write restrictions. */
export async function tryCreateFile(frame: Frame, fileName: string, projectId?: string): Promise<boolean> {
  try {
    await createFile(frame, fileName, projectId);
    return true;
  } catch {
    // createFile may have left a modal open (e.g. if confirm failed); close it so
    // subsequent calls to openNewFileModal are not blocked.
    const cancelBtn = frame.locator('.modal-overlay.visible .action-btn.secondary').first();
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click({ timeout: 2_000 }).catch(() => {});
      await frame.locator('.modal-overlay.visible').waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    }
    return false;
  }
}
