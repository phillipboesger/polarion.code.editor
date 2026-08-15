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
import { CODE_EDITOR_TOPIC_ID, enableCodeEditorTopic, restoreTopics, type TopicsSnapshot } from '../helpers/topics';

/** The Topics config as it was before beforeAll changed it. */
let topicsSnapshot: TopicsSnapshot | undefined;

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

  // Do NOT synchronize on a fixed sleep here. After login the page is usually
  // already on a /polarion/#… route, so the goto above is a same-document hash
  // change that resolves without a document load — leaving the sleep as the
  // only wait. On a slow CI runner the GWT panel can still be unpainted when it
  // expires, the button count is then 0, the expand silently does not happen,
  // and the caller's poll runs against a DOM the remaining topics never enter.
  const expandButton = page.locator('.polarion-NavigationPanel-ExpandCollapseButton').first();
  await expect
    .poll(async () => expandButton.count(), {
      timeout: 30_000,
      message: 'The GWT navigation panel never rendered its expand/collapse button.',
    })
    .toBeGreaterThan(0);

  await expandButton.click({ timeout: 10_000 }).catch(() => {/* already expanded */});
  await page.waitForTimeout(1_500);
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
      topicsSnapshot = await enableCodeEditorTopic(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // workers: 1 — every other spec shares this Polarion instance's config, so
    // the pre-test Topics config must be put back.
    //
    // A FRESH page is required: beforeAll's page is already closed, and
    // browser.newPage() owns its context, so reusing it here would throw
    // "target closed" and the restore would silently never happen.
    const page = await browser.newPage();
    try {
      await loginAsPolarionAdmin(page);
      await restoreTopics(page, topicsSnapshot);
    } finally {
      await page.close();
      topicsSnapshot = undefined;
    }
  });

  test('Code Editor entry is visible in the User View navigation', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await expect(page).not.toHaveURL(/login/i, { timeout: 10_000 });

    await openUserView(page);

    try {
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
    } finally {
      // Diagnostic screenshot AFTER the poll (mirrors admin-code-editor.spec.ts).
      // Taken before it, the PNG would show the page at t≈0 rather than at the
      // moment of failure, which is precisely the state that says nothing about
      // why a 30 s poll timed out.
      await page.screenshot({ path: 'playwright-report/user-view-navigation.png', fullPage: true });
    }
  });

  test('the navigation entry points at the Code Editor page', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await openUserView(page);

    await expect.poll(async () => navEntry(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);

    // Asserting only that the href contains "code-editor" would prove nothing:
    // the locator already selects the entry by data-debug-id, and every URL this
    // node could plausibly carry (SPA hash route, raw editor.html, even the
    // extender's icon URL) contains that string — so the assertion would still
    // pass if getPageUrl() returned the wrong target entirely.
    //
    // Follow the entry instead: Polarion loads the target into its "working_area"
    // frame, so the frame's resulting URL is what getPageUrl() actually resolved
    // to. Same hook helpers/editor.ts uses (GWT navigates the contentWindow
    // directly without touching the iframe's src attribute, so framenavigated is
    // the only reliable signal).
    const editorFramePromise = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame.name() === 'working_area' && frame.url().includes('code-editor'),
      timeout: process.env.CI ? 60_000 : 30_000,
    });

    await navEntry(page).first().click();

    const editorFrame = await editorFramePromise;
    expect(
      editorFrame.url(),
      `The navigation entry loaded ${editorFrame.url()}, which is not the editor page CodeEditorNavigationExtender.getPageUrl() returns.`,
    ).toContain('/polarion/code-editor/editor.html');
  });

});
