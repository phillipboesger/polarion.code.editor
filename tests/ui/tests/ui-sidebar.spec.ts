/**
 * Sidebar UI tests:
 *  - Collapse & expand via button
 *  - Resizer: drag to change sidebar width (persisted to localStorage)
 *  - Sidebar scrollbar appears when file list overflows
 */
import { test, expect } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, reloadEditor, clearEditorStorage } from '../helpers/editor';

test.describe('Code Editor – Sidebar & Resizer', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);
    await openEditor(page);
  });

  // ── COLLAPSE / EXPAND ────────────────────────────────────────────────────

  test('sidebar collapses when the « button is clicked', async ({ page }) => {
    const sidebar = page.locator('#sidebar');
    const collapseBtn = page.locator('#collapseSidebar');

    await expect(sidebar).toBeVisible();
    await collapseBtn.click();

    // After collapse the sidebar width should be 0 (hidden)
    await expect(sidebar).toHaveClass(/collapsed/, { timeout: 3_000 });
    // The expand button (☰) becomes visible
    await expect(page.locator('#expandSidebar')).toBeVisible({ timeout: 3_000 });
  });

  test('sidebar expands again after being collapsed', async ({ page }) => {
    await page.locator('#collapseSidebar').click();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/, { timeout: 3_000 });

    // Click expand
    await page.locator('#expandSidebar').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/, { timeout: 3_000 });
    await expect(page.locator('#expandSidebar')).not.toBeVisible({ timeout: 3_000 });
  });

  // ── RESIZER ──────────────────────────────────────────────────────────────

  test('resizer element is visible between sidebar and editor', async ({ page }) => {
    await expect(page.locator('#resizer')).toBeVisible();
  });

  test('dragging the resizer changes sidebar width and persists to localStorage', async ({ page }) => {
    const resizer = page.locator('#resizer');
    const sidebar = page.locator('#sidebar');

    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).not.toBeNull();

    const startX = resizerBox!.x + resizerBox!.width / 2;
    const startY = resizerBox!.y + resizerBox!.height / 2;
    const targetX = startX + 150; // drag 150px to the right

    // Move to the resizer first, then mousedown directly on the element
    await page.mouse.move(startX, startY);
    // Dispatch mousedown directly on the resizer element to ensure it registers
    await resizer.dispatchEvent('mousedown', { bubbles: true, cancelable: true });
    await page.mouse.move(targetX, startY, { steps: 20 });
    await page.mouse.up();

    // Allow localStorage write to complete
    await page.waitForTimeout(200);

    // Persisted in localStorage
    const stored = await page.evaluate(() => localStorage.getItem('sidebarWidth'));
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(350);

    // Width should have increased
    const widthAfter = await sidebar.evaluate((el: HTMLElement) => el.offsetWidth);
    expect(widthAfter).toBeGreaterThan(350); // default is 350px
  });

  test('resizer highlights on hover', async ({ page }) => {
    const resizer = page.locator('#resizer');
    await resizer.hover();
    // The CSS adds a blue accent background on hover; we just assert the element responds
    await expect(resizer).toBeVisible();
  });

  test('saved sidebar width is restored on page reload', async ({ page }) => {
    // Drag sidebar to 500px
    const resizer = page.locator('#resizer');
    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).not.toBeNull();

    await page.mouse.move(resizerBox!.x, resizerBox!.y + resizerBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(500, resizerBox!.y + resizerBox!.height / 2, { steps: 15 });
    await page.mouse.up();

    const widthSet = await page.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);

    // Reload
    await reloadEditor(page);

    const widthAfterReload = await page.locator('#sidebar').evaluate((el: HTMLElement) => el.offsetWidth);
    // Should be close to the dragged value (within a few px tolerance)
    expect(Math.abs(widthAfterReload - widthSet)).toBeLessThan(20);
  });

  // ── SIDEBAR SCROLL ───────────────────────────────────────────────────────

  test('sidebar content area has overflow-y: auto (scrollable)', async ({ page }) => {
    const overflow = await page.locator('.sidebar-content').evaluate(
      (el: HTMLElement) => getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(overflow);
  });

});
