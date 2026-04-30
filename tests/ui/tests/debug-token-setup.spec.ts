/**
 * DEBUG SPEC: UI-Based Personal Access Token Acquisition
 *
 * Step-by-step walkthrough of the Polarion UI to create a PAT.
 * This test is for debugging purposes only – it captures screenshots and
 * DOM selectors so that global-setup.ts can be implemented correctly.
 *
 * Run with:
 *   cd tests/ui && npx playwright test debug-token-setup --headed --workers=1
 *   or without headed:
 *   cd tests/ui && npx playwright test debug-token-setup --workers=1
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'node:fs';
import { loginAsPolarionAdmin } from '../helpers/auth';

const BASE_URL   = process.env.POLARION_URL  ?? 'http://localhost';
const ADMIN_USER = process.env.POLARION_USER ?? 'admin';
const ADMIN_PASS = process.env.POLARION_PASS ?? 'admin';

/** Logs in to Polarion using the robust shared auth helper. */
async function login(page: Page): Promise<void> {
  await loginAsPolarionAdmin(page);
  console.log('[debug] Logged in. URL:', page.url());
}

test.describe('Debug: PAT acquisition via Polarion UI', () => {
  test('Step 1 – login and navigate to admin user page', async ({ page }) => {
    await login(page);

    // Navigate to the admin user page where the "Personal Access Token" button is
    const userPageUrl = `${BASE_URL}/polarion/#/user?id=${ADMIN_USER}`;
    console.log('[debug] Navigating to:', userPageUrl);
    await page.goto(userPageUrl, { waitUntil: 'domcontentloaded' });

    // GWT takes 10-60 seconds to bootstrap – wait directly for the PAT text to appear in DOM
    console.log('[debug] Waiting for GWT to render the toolbar (up to 60s)...');
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Personal Access Token'),
      { timeout: 60_000, polling: 2_000 },
    ).catch(() => console.log('[debug] PAT text wait timed out'));

    console.log('[debug] Current URL after navigation:', page.url());
    console.log('[debug] Page title:', await page.title());

    // Screenshot for analysis
    await page.screenshot({ path: 'test-results/debug-step1-userpage.png', fullPage: true });

    // Dump outer HTML of the top toolbar area to understand DOM structure
    const toolbarHtml = await page.evaluate(() => {
      // GWT renders toolbars as nested tables/divs
      const selectors = [
        '.gwt-ToolBar', '.toolbar', '.toolBar', '.toolstrip',
        'table[class*="tool"]', 'div[class*="tool"]',
        'td[class*="tool"]', '.gwt-HTML',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return `Selector: ${sel}\n${el.outerHTML.slice(0, 2000)}`;
      }
      // Fallback: find any element containing "Personal Access Token"
      const allEls = Array.from(document.querySelectorAll('*'));
      const match  = allEls.find(el => el.childNodes.length > 0 &&
        Array.from(el.childNodes).some(n => n.textContent?.includes('Personal Access Token'))
      );
      return match
        ? `Found via text search: ${match.tagName}.${match.className}\n${match.outerHTML.slice(0, 2000)}`
        : 'No toolbar found';
    });
    console.log('[debug] Toolbar HTML:\n', toolbarHtml);

    // Try broad text-based locator (works for any element type in GWT)
    const patByText = page.getByText('Personal Access Token', { exact: true });
    const patByTextCount = await patByText.count();
    console.log(`[debug] Elements with exact text "Personal Access Token": ${patByTextCount}`);
    for (let i = 0; i < patByTextCount; i++) {
      const tag = await patByText.nth(i).evaluate(el => `${el.tagName}.${el.className}`);
      const vis = await patByText.nth(i).isVisible().catch(() => false);
      console.log(`  [${i}] ${tag} visible=${vis}`);
    }

    // Also try all clickable-looking elements in the toolbar area
    const toolbarItems = page.locator('td, span, div, a, button').filter({ hasText: /^Personal Access Token$/ });
    const itemCount = await toolbarItems.count();
    console.log(`[debug] Elements matching /^Personal Access Token$/: ${itemCount}`);

    // The button IS visible in screenshots – just need correct selector
    const patVisible = (patByTextCount > 0) &&
      await patByText.first().isVisible({ timeout: 5_000 }).catch(() => false);
    console.log('[debug] PAT button (getByText) visible:', patVisible);

    expect(patVisible, '"Personal Access Token" element should be visible').toBe(true);
  });

  test('Step 2 – click Personal Access Token button and observe dialog', async ({ page }) => {
    await login(page);

    await page.goto(`${BASE_URL}/polarion/#/user?id=${ADMIN_USER}`, { waitUntil: 'domcontentloaded' });

    // Wait for GWT to render the PAT button
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Personal Access Token'),
      { timeout: 60_000, polling: 2_000 },
    );

    // Click the Personal Access Token button (GWT renders as td/span, not <button>)
    const patButton = page.getByText('Personal Access Token', { exact: true }).first();

    await patButton.waitFor({ state: 'visible', timeout: 15_000 });
    console.log('[debug] Clicking "Personal Access Token" button...');
    await patButton.click();

    // Wait for a dialog / panel to appear
    await page.waitForTimeout(2_000);

    await page.screenshot({ path: 'test-results/debug-step2-after-pat-click.png', fullPage: true });

    // Print all visible dialogs/overlays/modals
    const dialogs = page.locator('[role="dialog"], .gwt-DialogBox, .popup, .modal, .overlay, .dialog');
    const dialogCount = await dialogs.count();
    console.log(`[debug] Dialogs/overlays visible: ${dialogCount}`);

    for (let i = 0; i < Math.min(dialogCount, 10); i++) {
      const text = await dialogs.nth(i).textContent().catch(() => '');
      const vis  = await dialogs.nth(i).isVisible().catch(() => false);
      if (vis) {
        console.log(`  [dialog ${i}] text preview: "${text?.trim().slice(0, 200)}"`);
      }
    }

    // Try to find input fields (token name entry, token value display)
    const inputs = page.locator('input:visible, textarea:visible');
    const inputCount = await inputs.count();
    console.log(`[debug] Visible inputs after click: ${inputCount}`);
    for (let i = 0; i < Math.min(inputCount, 10); i++) {
      const name  = await inputs.nth(i).getAttribute('name').catch(() => '');
      const type  = await inputs.nth(i).getAttribute('type').catch(() => '');
      const value = await inputs.nth(i).inputValue().catch(() => '');
      const placeholder = await inputs.nth(i).getAttribute('placeholder').catch(() => '');
      console.log(`  [input ${i}] type="${type}" name="${name}" placeholder="${placeholder}" value="${value?.slice(0, 50)}"`);
    }
  });

  test('Step 3 – create a PAT and capture the token value', async ({ page }) => {
    await login(page);

    await page.goto(`${BASE_URL}/polarion/#/user?id=${ADMIN_USER}`, { waitUntil: 'domcontentloaded' });

    // Wait for GWT to render the PAT button
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Personal Access Token'),
      { timeout: 60_000, polling: 2_000 },
    );

    const patButton = page.getByText('Personal Access Token', { exact: true }).first();
    await patButton.waitFor({ state: 'visible', timeout: 15_000 });
    await patButton.click();

    // PAT button navigates to a new page (not a dialog) – wait for the form
    console.log('[debug] Waiting for "Create New Token" form to appear...');
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Create New Token'),
      { timeout: 20_000, polling: 1_000 },
    );
    await page.screenshot({ path: 'test-results/debug-step3-dialog-open.png', fullPage: true });
    console.log('[debug] PAT form URL:', page.url());

    // Compute expiry date: 30 days from now (max 90)
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    const dateStr = `${expires.getFullYear()}-${String(expires.getMonth() + 1).padStart(2, '0')}-${String(expires.getDate()).padStart(2, '0')}`;
    const tokenName = `playwright-ci-${Date.now()}`;

    // Fill the Name field using specific CSS class (index 0 is the search box!)
    const nameInput    = page.locator('input.polarion-Personal-Access-Token-input');
    const expiresInput = page.locator('input.polarion-DateInput-input');

    await nameInput.fill(tokenName);
    console.log('[debug] Filled name:', tokenName);

    // Fill the Expires on date
    await expiresInput.fill(dateStr);
    await expiresInput.press('Tab'); // confirm the date entry
    console.log('[debug] Filled expires:', dateStr);

    // Verify the values landed correctly
    const nameVal    = await nameInput.inputValue().catch(() => '');
    const expiresVal = await expiresInput.inputValue().catch(() => '');
    console.log('[debug] Name input value:', nameVal);
    console.log('[debug] Expires input value:', expiresVal);

    await page.screenshot({ path: 'test-results/debug-step3-form-filled.png', fullPage: true });

    // Click "Create Token" button specifically (not the top "CREATE..." bar button)
    const createTokenBtn = page.getByRole('button', { name: 'Create Token' });
    const createVisible = await createTokenBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log('[debug] "Create Token" button visible:', createVisible);

    if (createVisible) {
      await createTokenBtn.click();
    } else {
      // Fallback: try locating by text
      const fallback = page.locator('button').filter({ hasText: 'Create Token' }).first();
      const fallbackVis = await fallback.isVisible({ timeout: 3_000 }).catch(() => false);
      console.log('[debug] Fallback "Create Token" button visible:', fallbackVis);
      if (fallbackVis) await fallback.click();
    }

    // Wait for the green "Your new Personal Access Token:" banner to appear
    console.log('[debug] Waiting for token banner...');
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Your new Personal Access Token'),
      { timeout: 10_000, polling: 500 },
    );
    await page.screenshot({ path: 'test-results/debug-step3-after-create.png', fullPage: true });
    console.log('[debug] Post-create URL:', page.url());

    // Extract token value: JWTs always start with "eyJ" (base64-encoded header)
    const tokenValue = await page.evaluate(() => {
      const bodyText = document.body?.textContent ?? '';
      // Match the JWT: eyJ<header>.<payload>.<signature> (dots optional – some tokens are opaque)
      const match = /eyJ[A-Za-z0-9+/=._-]{50,}/.exec(bodyText);
      return match ? match[0] : null;
    });

    if (tokenValue) {
      fs.mkdirSync('test-results', { recursive: true });
      fs.writeFileSync('test-results/debug-token.txt', tokenValue, 'utf8');
      console.log('[debug] ✅ Token captured! Length:', tokenValue.length);
      console.log('[debug] Token preview:', tokenValue.slice(0, 30) + '...');
    } else {
      // Dump page text snippet to understand what's on the page
      const bodyText = await page.evaluate(() => document.body?.textContent ?? '');
      console.log('[debug] ❌ Token not found. Body text (500 chars):', bodyText.replaceAll(/\s+/g, ' ').slice(0, 500));
    }

    expect(tokenValue, 'Token value should be captured after creation').toBeTruthy();
  });
});
