/**
 * User View sidebar navigation entry.
 *
 * Covers the `com.polarion.xray.webui.customNavigationExtenders` contribution
 * (CodeEditorNavigationExtender) in META-INF/hivemodule.xml — the counterpart
 * to admin-code-editor.spec.ts, which covers the administrationPageExtenders
 * contribution.
 *
 * Why this exists: that contribution was once deleted outright on the mistaken
 * belief that Polarion 2606 had removed the NavigationExtender interface. The
 * suite noticed nothing, because every other spec reaches the editor through
 * the Administration route. This spec is the regression guard for that: if the
 * contribution is removed again, or a future Polarion really does drop the
 * extension point, it fails here.
 *
 * The entry is gated behind Polarion's Topics config (README, "Navigation Tab
 * in User View"), so the setup enables `<topic id="code-editor"/>` first and
 * restores the previous configuration afterwards.
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { BASE_URL, loginAsPolarionAdmin } from '../helpers/auth';
import { CODE_EDITOR_TOPIC_ID, enableCodeEditorTopic } from '../helpers/topics';

/** Restores the Topics config to its pre-test state. Set in beforeAll. */
let restoreTopics: (() => Promise<void>) | undefined;

/**
 * Opens the User View portal home and waits for the navigation to render.
 *
 * The panel starts COLLAPSED, showing only a subset (Home, Documents & Pages,
 * Work Items) behind a `polarion-NavigationPanel-ExpandCollapseButton`; the
 * remaining topics do not exist in the DOM until it is clicked. Same shape as
 * the collapsed GWT rows in the Administration tree.
 */
async function openUserView(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/polarion/#/`);
  await page.waitForLoadState('domcontentloaded');
  // The portal navigation is GWT-rendered; give the router time to paint it.
  await page.waitForTimeout(3_000);

  const expandButton = page.locator('.polarion-NavigationPanel-ExpandCollapseButton').first();
  if (await expandButton.count() > 0) {
    await expandButton.click({ timeout: 10_000 }).catch(() => {/* already expanded */});
    await page.waitForTimeout(1_500);
  }
}

/**
 * The navigation entry.
 *
 * Polarion renders each nav node as
 *   <a class="polarion-JTreeNode-HyperlinkNode" data-debug-id="<label>" href="…">
 * so `data-debug-id` scoped to the nav-node class is the deterministic handle —
 * and scoping to that class keeps this from matching the Administration tree,
 * where the literal text "Code Editor" also appears.
 *
 * Note the href is Polarion's SPA hash route, NOT the raw
 * /polarion/code-editor/editor.html that the extender returns from
 * getPageUrl(), so the href is asserted separately and loosely below.
 */
function navEntry(page: Page) {
  return page.locator('a.polarion-JTreeNode-HyperlinkNode[data-debug-id="Code Editor"]');
}

test.describe.serial('Polarion User View – Code Editor navigation entry', () => {

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await loginAsPolarionAdmin(page);
      restoreTopics = await enableCodeEditorTopic(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    // workers: 1 — every other spec shares this Polarion instance's config.
    await restoreTopics?.().catch(() => {/* best-effort */});
    restoreTopics = undefined;
  });

  test('Code Editor entry is visible in the User View navigation', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await expect(page).not.toHaveURL(/login/i, { timeout: 10_000 });

    await openUserView(page);

    // Diagnostic screenshot, captured on success as well as failure (mirrors
    // admin-code-editor.spec.ts) so a CI failure here is inspectable.
    await page.screenshot({ path: 'playwright-report/user-view-navigation.png', fullPage: true });

    await expect
      .poll(async () => navEntry(page).count(), {
        timeout: 30_000,
        message:
          `No navigation entry linking to the Code Editor was found in the User View. ` +
          `Either the customNavigationExtenders contribution in META-INF/hivemodule.xml is ` +
          `missing/unresolved, or the <topic id="${CODE_EDITOR_TOPIC_ID}"/> setup did not take effect.`,
      })
      .toBeGreaterThan(0);

    await expect(navEntry(page).first()).toBeVisible({ timeout: 15_000 });
  });

  test('the navigation entry points at the Code Editor page', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await openUserView(page);

    await expect.poll(async () => navEntry(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);

    // CodeEditorNavigationExtender.getId() is "code-editor" and getPageUrl()
    // returns /polarion/code-editor/editor.html. Polarion wraps nav targets in
    // its own SPA hash route, so assert on the id fragment both forms share
    // rather than on the raw editor.html path.
    const href = await navEntry(page).first().getAttribute('href');
    expect(href, 'navigation entry has no href').toBeTruthy();
    expect(href).toContain(CODE_EDITOR_TOPIC_ID);
  });

});
