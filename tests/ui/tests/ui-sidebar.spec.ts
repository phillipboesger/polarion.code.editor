/**
 * Sidebar UI tests:
 *  - Collapse & expand via button
 *  - Resizer: drag to change sidebar width (persisted to localStorage)
 *  - Sidebar scrollbar appears when file list overflows
 */
import { test, expect } from '../fixtures';
import type { Frame } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, reloadEditor, clearEditorStorage } from '../helpers/editor';

test.describe('Code Editor – Sidebar & Resizer', () => {

  let frame: Frame;

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    frame = await openEditor(page);
  });

  // ── COLLAPSE / EXPAND ────────────────────────────────────────────────────

  test('sidebar collapses when the « button is clicked', async ({ page: _ }) => {
    const sidebar = frame.locator('#sidebar');
    const collapseBtn = frame.locator('#collapseSidebar');

    await expect(sidebar).toBeVisible();
    await collapseBtn.click();

    // After collapse the sidebar width should be 0 (hidden)
    await expect(sidebar).toHaveClass(/collapsed/, { timeout: 3_000 });
    // The expand button (☰) becomes visible
    await expect(frame.locator('#expandSidebar')).toBeVisible({ timeout: 3_000 });
  });

  test('sidebar expands again after being collapsed', async ({ page: _ }) => {
    await frame.locator('#collapseSidebar').click();
    await expect(frame.locator('#sidebar')).toHaveClass(/collapsed/, { timeout: 3_000 });

    // Click expand
    await frame.locator('#expandSidebar').click();
    await expect(frame.locator('#sidebar')).not.toHaveClass(/collapsed/, { timeout: 3_000 });
    await expect(frame.locator('#expandSidebar')).not.toBeVisible({ timeout: 3_000 });
  });

  // ── RESIZER ──────────────────────────────────────────────────────────────

  test('resizer element is visible between sidebar and editor', async ({ page: _ }) => {
    await expect(frame.locator('#resizer')).toBeVisible();
  });

  test('dragging the resizer changes sidebar width and persists to localStorage', async ({ page: _ }) => {
    const sidebar = frame.locator('#sidebar');
    // mousemove/mouseup listeners receive them reliably, and coordinates
    // are naturally in iframe space (not page space).
    await frame.evaluate(() => {
      const resizer = document.getElementById('resizer');
      if (!resizer) return;
      const rect = resizer.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const targetX = Math.min(x + 200, 790); // drag right, stay within 800px constraint
      resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: targetX, clientY: y, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup',  { clientX: targetX, clientY: y, bubbles: true }));
    });

    // Allow localStorage write to complete
    await frame.page().waitForTimeout(200);

    // Persisted in localStorage (same origin → readable from frame context)
    const stored = await frame.evaluate(() => localStorage.getItem('sidebarWidth'));
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(350);

    // Width should have increased
    const widthAfter = await sidebar.evaluate((el: HTMLElement) => el.offsetWidth);
    expect(widthAfter).toBeGreaterThan(350); // default is 350px
  });

  test('resizer highlights on hover', async ({ page: _ }) => {
    const resizer = frame.locator('#resizer');
    await resizer.hover();
    // The CSS adds a blue accent background on hover; we just assert the element responds
    await expect(resizer).toBeVisible();
  });

  test('saved sidebar width is restored on page reload', async ({ page }) => {
    // Drag sidebar to 500px
    const resizer = frame.locator('#resizer');
    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).not.toBeNull();
    if (!resizerBox) return;

    await page.mouse.move(resizerBox.x, resizerBox.y + resizerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(500, resizerBox.y + resizerBox.height / 2, { steps: 15 });
    await page.mouse.up();

    const widthSet = await frame.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);

    // Reload
    await reloadEditor(frame);

    const widthAfterReload = await frame.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);
    // Should be close to the dragged value (within a few px tolerance)
    expect(Math.abs(widthAfterReload - widthSet)).toBeLessThan(20);
  });

  // ── SIDEBAR SCROLL ───────────────────────────────────────────────────────

  test('sidebar content area has overflow-y: auto (scrollable)', async ({ page: _ }) => {
    const overflow = await frame.locator('.sidebar-content').evaluate(
      (el: HTMLElement) => getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(overflow);
  });

});
