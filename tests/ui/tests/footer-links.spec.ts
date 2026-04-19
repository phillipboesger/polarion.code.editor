/**
 * Footer hyperlink tests:
 *  - "Boesger Digital" link points to https://digital.boesger.com
 *  - "Legal Notice" link points to https://digital.boesger.com/imprint/
 *  - Both links open in a new tab (target="_blank")
 *  - Both links have rel="noopener noreferrer" (security)
 */
import { test, expect } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor } from '../helpers/editor';

test.describe('Code Editor – Footer Hyperlinks', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await openEditor(page);
  });

  test('footer contains "Boesger Digital" link', async ({ page }) => {
    const link = page.locator('.editor-footer a', { hasText: 'Boesger Digital' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://digital.boesger.com');
  });

  test('"Boesger Digital" link opens in a new tab', async ({ page }) => {
    const link = page.locator('.editor-footer a', { hasText: 'Boesger Digital' });
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('"Boesger Digital" link has rel="noopener noreferrer" (security)', async ({ page }) => {
    const link = page.locator('.editor-footer a', { hasText: 'Boesger Digital' });
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  test('footer contains "Legal Notice" link', async ({ page }) => {
    const link = page.locator('.editor-footer a', { hasText: 'Legal Notice' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://digital.boesger.com/imprint/');
  });

  test('"Legal Notice" link opens in a new tab', async ({ page }) => {
    const link = page.locator('.editor-footer a', { hasText: 'Legal Notice' });
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('"Legal Notice" link has rel="noopener noreferrer" (security)', async ({ page }) => {
    const link = page.locator('.editor-footer a', { hasText: 'Legal Notice' });
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  test('"Boesger Digital" URL is reachable (HTTP 2xx)', async ({ page }) => {
    const response = await page.request.get('https://digital.boesger.com', {
      timeout: 15_000,
    });
    expect(response.status()).toBeLessThan(400);
  });

  test('"Legal Notice" URL is reachable (HTTP 2xx)', async ({ page }) => {
    const response = await page.request.get('https://digital.boesger.com/imprint/', {
      timeout: 15_000,
    });
    expect(response.status()).toBeLessThan(400);
  });

  test('footer shows "Code Editor is available for free." text', async ({ page }) => {
    await expect(page.locator('.editor-footer')).toContainText('Code Editor is available for free.');
  });

});
