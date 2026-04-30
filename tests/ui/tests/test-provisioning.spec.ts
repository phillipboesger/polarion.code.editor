/**
 * Isolated provisioning test – NOT part of the regular test suite.
 * Run: npx playwright test tests/test-provisioning.spec.ts --workers=1 --retries=0
 */

import { test, expect, Page } from '@playwright/test';
import { BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_USERS } from '../helpers/auth';

test.use({ storageState: undefined });
test.setTimeout(120_000);

async function addGlobalRoleInCreateForm(page: Page, role: 'user' | 'admin'): Promise<void> {
  const editor = page.locator('[data-debug-id="globalRolesWithSourcesEditor"]').first();
  await editor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  // In create mode the editable role row has a placeholder combo input with value "--".
  const roleInput = editor.locator('input.polarion-JComboBox-Input[value="--"]').first();
  await roleInput.waitFor({ state: 'visible', timeout: 15_000 });

  // Open the combo from the same row.
  const comboIcon = roleInput
    .locator('xpath=ancestor::table[1]//img[contains(@class,"polarion-JComboBox-Image")]')
    .first();
  await comboIcon.click({ force: true });
  await page.waitForTimeout(500);

  // GWT renders popup items outside the editor table, so select globally by exact text.
  const matched = await page.evaluate((wantedRole: string) => {
    const visible = (el: Element) => {
      const h = el as HTMLElement;
      return !!(h.offsetParent || h.getClientRects().length);
    };
    const candidates = Array.from(document.querySelectorAll('td, div, span, a')).filter((el) => {
      const text = el.textContent?.trim();
      return text === wantedRole && visible(el);
    });
    const target = candidates[candidates.length - 1] as HTMLElement | undefined;
    if (!target) return false;
    target.click();
    return true;
  }, role);

  if (!matched) {
    throw new Error(`Role option "${role}" could not be selected in Global Roles popup.`);
  }

  await page.waitForTimeout(300);
  const addBtn = roleInput
    .locator('xpath=ancestor::div[contains(@class,"JSTreeTableRow")][1]//img[@title="Add" or contains(@src,"tablePlus") or contains(@src,"plus")]')
    .first();
  await addBtn.click({ force: true });
  await page.waitForTimeout(500);
  console.log(`[provisioning] Added global role "${role}" in create form.`);
}

test('Provision test users end-to-end', async ({ browser }) => {
  // ── Step 1: Admin login ────────────────────────────────────────────────
  const adminCtx  = await browser.newContext();
  const adminPage = await adminCtx.newPage();

  await test.step('Admin login', async () => {
    await adminPage.goto(`${BASE_URL}/polarion`, { waitUntil: 'domcontentloaded' });
    const trialBtn = adminPage.getByRole('button', { name: 'Start 30-Day Trial' });
    if (await trialBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await trialBtn.click();
      await adminPage.waitForLoadState('domcontentloaded');
    }
    const uf = adminPage.locator('#j_username, input[name="j_username"]').first();
    if (await uf.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await uf.fill(ADMIN_USER);
      await adminPage.locator('#j_password, input[name="j_password"]').first().fill(ADMIN_PASS);
      await adminPage.locator('#submitButton, button[type="submit"], input[type="submit"]').first().click();
      await adminPage.waitForFunction(
        () => !document.querySelector('#j_username, input[name="j_username"]'),
        { timeout: 30_000 },
      );
    }
    console.log('[provisioning] Admin login OK – title: ' + await adminPage.title());
  });

  // ── Step 2: Delete existing test users ──────────────────────────────────
  await test.step('Delete existing test users', async () => {
    for (const user of TEST_USERS) {
      await adminPage.goto(
        `${BASE_URL}/polarion/#/administration/user_management/users`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );
      await adminPage.waitForFunction(
        () => document.body?.textContent?.includes('Create new User'),
        { timeout: 30_000, polling: 1_000 },
      );
      await adminPage.waitForTimeout(2_000);

      const exists = await adminPage.evaluate(
        (uid: string) => (document.body?.textContent ?? '').includes(uid), user.id,
      );
      if (!exists) { console.log(`[provisioning] "${user.id}" not found – skip delete.`); continue; }

      await adminPage.locator('td', { hasText: user.id }).first().click();
      await adminPage.waitForTimeout(800);

      const delTable = adminPage.locator('table.polarion-ToolbarButton', { hasText: /Delete/ });
      const delLabel = adminPage.locator('td.polarion-ToolbarButton-Label', { hasText: /Delete/ });
      if (await delTable.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await delTable.first().click();
      } else if (await delLabel.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await delLabel.first().click();
      } else {
        console.warn(`[provisioning] No Delete button for "${user.id}".`); continue;
      }

      await adminPage.waitForTimeout(800);
      const confirmBtn = adminPage.getByRole('button', { name: /Yes|OK|Confirm|Delete/i });
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) await confirmBtn.click();

      await adminPage.waitForFunction(
        (uid: string) => !(document.body?.textContent ?? '').includes(uid), user.id,
        { timeout: 10_000, polling: 500 },
      ).catch(() => console.warn(`[provisioning] "${user.id}" may still appear after delete.`));
      console.log(`[provisioning] Deleted "${user.id}".`);
    }
  });

  // ── Step 3: Create test users ────────────────────────────────────────────
  await test.step('Create test users via Admin UI', async () => {
    for (const user of TEST_USERS) {
      await adminPage.goto(
        `${BASE_URL}/polarion/#/administration/user_management/users`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );
      await adminPage.waitForFunction(
        () => document.body?.textContent?.includes('Create new User'),
        { timeout: 30_000, polling: 1_000 },
      );
      await adminPage.waitForTimeout(2_000);

      // dispatchEvent bypasses the GWT splitter overlay (GLNRHCCBMHB) which
      // intercepts pointer events after navigating back from a user detail view.
      await adminPage.locator('table.polarion-ToolbarButton', { hasText: 'Create new User' }).first().dispatchEvent('click');
      await adminPage.waitForTimeout(1_500);

      // Wait for password fields to appear – don't check for empty text fields
      // because the form may be pre-populated from a previous creation.
      await adminPage.waitForFunction(
        () => document.querySelectorAll('input[type="password"]').length >= 2,
        { timeout: 25_000, polling: 500 },
      );

      console.log(`[provisioning] Form ready for "${user.id}".`);

      // Field order: Name(0), Initials(1), ID(2), Login ID(3), Email(4)
      // Explicitly clear before filling in case the form is pre-filled.
      const textInputs = adminPage.locator('input[type="text"].polarion-JSTextEditor-Active');
      await textInputs.nth(0).fill('');
      await textInputs.nth(2).fill('');
      await textInputs.nth(3).fill('');
      await textInputs.nth(0).fill(user.name); // Name
      await textInputs.nth(2).fill(user.id);   // ID
      await textInputs.nth(3).fill(user.id);   // Login ID

      const pwInputs = adminPage.locator('input[type="password"].polarion-JSTextEditor-Active');
      await pwInputs.nth(0).fill('');
      await pwInputs.nth(1).fill('');
      await pwInputs.nth(0).fill(user.password);
      await pwInputs.nth(1).fill(user.password);

      // Assign required global roles directly in create mode.
      await addGlobalRoleInCreateForm(adminPage, 'user');
      await addGlobalRoleInCreateForm(adminPage, 'admin');

      // Choose a license option with free seats; users stay inactive without a valid license.
      const licenseChanged = await adminPage.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          const options = Array.from(sel.options);
          if (!options.some(o => /remaining/i.test(o.text))) continue;
          const preferred = options.find(o => /viewer/i.test(o.text) && !/0 remaining/i.test(o.text))
            ?? options.find(o => !/0 remaining/i.test(o.text) && o.text.trim() !== '--');
          if (preferred) {
            sel.value = preferred.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return preferred.text;
          }
        }
        return null;
      });
      console.log(`[provisioning] License type for "${user.id}": ${
        licenseChanged ? `"${licenseChanged}"` : 'unchanged (no free seats found)'
      }`);
      await adminPage.waitForTimeout(500);

      // Screenshot to verify form state before Create
      await adminPage.screenshot({ path: `/tmp/form-before-create-${user.id}.png`, fullPage: false });
      console.log(`[provisioning] Screenshot saved to /tmp/form-before-create-${user.id}.png`);

      await adminPage.locator('td.polarion-ToolbarButton-Label').filter({ hasText: /^Create$/ }).first().click();

      await adminPage.waitForFunction(
        (uid: string) => (document.body?.textContent ?? '').includes(uid), user.id,
        { timeout: 20_000, polling: 500 },
      );
      console.log(`[provisioning] Created "${user.id}" via Admin UI.`);
    }
  });

  await adminCtx.close();

  // ── Step 4: Login test ───────────────────────────────────────────────────
  await test.step('Test login for each user', async () => {
    for (const user of TEST_USERS) {
      const ctx  = await browser.newContext();
      const page = await ctx.newPage();

      await page.goto(`${BASE_URL}/polarion`, { waitUntil: 'domcontentloaded' });
      const trialBtn = page.getByRole('button', { name: 'Start 30-Day Trial' });
      if (await trialBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await trialBtn.click(); await page.waitForLoadState('domcontentloaded');
      }

      const uf = page.locator('#j_username, input[name="j_username"]').first();
      expect(await uf.isVisible({ timeout: 10_000 }).catch(() => false), `Login form for "${user.id}"`).toBe(true);

      await uf.fill(user.id);
      await page.locator('#j_password, input[name="j_password"]').first().fill(user.password);
      await page.locator('#submitButton, button[type="submit"], input[type="submit"]').first().click();

      const ok = await page.waitForFunction(
        () => !document.querySelector('#j_username, input[name="j_username"]'),
        { timeout: 20_000 },
      ).then(() => true).catch(() => false);

      if (!ok) {
        const snip = await page.evaluate(() => document.body?.textContent?.slice(0, 400) ?? '');
        console.error(`[provisioning] Login FAILED for "${user.id}": ${snip}`);
      } else {
        console.log(`[provisioning] Login OK for "${user.id}".`);
      }

      expect(ok, `Login should succeed for "${user.id}"`).toBe(true);
      await ctx.close();
    }
  });
});
