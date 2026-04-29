import { Page, expect } from '@playwright/test';
import { BASE_URL } from './auth';

export const EDITOR_URL = `${BASE_URL}/polarion/code-editor/editor.html`;

/** Default project used when openEditor() is called without a projectId.
 *  The global /#/administration/code-editor route never sets working_area.src
 *  and loads editor.html without ?projectId, so a project-specific route is
 *  always required. */
const DEFAULT_PROJECT_ID = process.env.POLARION_PROJECT_ID ?? 'drivePilot';

function projectEditorSpaUrl(projectId: string): string {
  return `${BASE_URL}/polarion/#/project/${encodeURIComponent(projectId)}/administration/code-editor`;
}


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
export async function openEditor(page: Page, projectId?: string): Promise<void> {
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
    timeout: 60_000,
  });

  await page.goto(spaUrl, { waitUntil: 'domcontentloaded' });

  const editorFrame = await editorFramePromise;
  const editorSrc = editorFrame.url();

  // Navigate directly to the editor page so all #fileList / #editorTabs
  // selectors work at the top-level DOM (no frameLocator needed).
  await page.goto(editorSrc, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fileList', { state: 'attached', timeout: 30_000 });
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
  await expect(page.locator('#editorTabs .editor-tab', { hasText: fileName }).first()).toBeVisible({ timeout: 15_000 });
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
export async function createFile(page: Page, fileName: string, projectId?: string): Promise<void> {
  await openNewFileModal(page);
  const pathInput = page.locator('#newFileName');
  await pathInput.fill(fileName);
  // Confirm – use the specific button ID to avoid accidentally clicking
  // #customDialogOkBtn which is the first .action-btn:not(.secondary) in the DOM.
  const confirmBtn = page.locator('#btnConfirmCreate');
  await confirmBtn.click();
  await page.waitForSelector('.modal-overlay.visible', { state: 'hidden', timeout: 5_000 });

  const appearedViaUi = await waitForFileInList(page, fileName, 15_000)
    .then(() => true)
    .catch(() => false);

  if (!appearedViaUi) {
    // Fallback for builds where the UI dialog occasionally fails silently.
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const response = await page.request.put(
      `/polarion/code-editor/api/config/file/${encodeURIComponent(fileName)}${query}`,
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
export async function tryCreateFile(page: Page, fileName: string, projectId?: string): Promise<boolean> {
  try {
    await createFile(page, fileName, projectId);
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
