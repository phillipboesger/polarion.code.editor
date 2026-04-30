/**
 * Playwright Global Setup
 *
 * Runs ONCE before the full test suite:
 *  1. Logs in as admin via browser and saves auth state (.auth/worker0.json).
 *  2. Creates a temporary Personal Access Token (PAT) via the Polarion web UI.
 *     The PAT is persisted to .auth/.ci-token.json for teardown cleanup.
 *  3. Provisions 2 Polarion test users via the Admin UI (creates user + sets
 *     password in one step, bypassing the broken REST PATCH for passwords).
 *  4. Assigns the Administrators group to each user via REST.
 *  5. Logs in as each user and saves auth state (worker1.json, worker2.json).
 *     Falls back to copying worker0.json if provisioning is not possible.
 *
 * Worker ↔ credentials mapping:
 *   workerIndex % 3 === 0  →  admin / admin          (.auth/worker0.json)
 *   workerIndex % 3 === 1  →  playwright_w1           (.auth/worker1.json)
 *   workerIndex % 3 === 2  →  playwright_w2           (.auth/worker2.json)
 */

import { chromium, Browser, request as pwRequest } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_USERS } from './helpers/auth';

/** Directory where auth-state JSON files are stored. */
export const AUTH_DIR = path.join(__dirname, '.auth');

/** File used to persist the CI access token between setup and teardown. */
export const CI_TOKEN_FILE = path.join(AUTH_DIR, '.ci-token.json');

/** Re-export so teardown and other callers can import from one place. */
export { TEST_USERS } from './helpers/auth';

async function addGlobalRoleInCreateForm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  role: 'user' | 'admin',
): Promise<void> {
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

  const matched = await page.evaluate((wantedRole: string) => {
    const visible = (el: Element) => {
      const h = el as HTMLElement;
      return !!(h.offsetParent || h.getClientRects().length);
    };
    const candidates = Array.from(document.querySelectorAll('td, div, span, a')).filter((el) => {
      const text = el.textContent?.trim();
      return text === wantedRole && visible(el);
    });
    const target = candidates.at(-1) as HTMLElement | undefined;
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
  console.log(`[global-setup] Added global role "${role}" in create form.`);
}

// ── REST helpers ──────────────────────────────────────────────────────────────

/**
 * Acquires a Personal Access Token (PAT) for the admin user via the Polarion web UI.
 *
 * This is the reliable approach for CI environments where Basic-auth on the
 * REST accesstokens endpoint may be blocked or behave unexpectedly.
 *
 * UI flow:
 *  1. Open a fresh browser context and log in as admin.
 *  2. Navigate directly to the PAT management page (#/user_tokens?id=admin).
 *  3. Fill the "Create New Token" form (name + expiry date, max 90 days).
 *  4. Click "Create Token" and wait for the one-time display banner.
 *  5. Extract the JWT token value from the page text via regex.
 *
 * The token name and secret are persisted to CI_TOKEN_FILE so that
 * globalTeardown can use the secret as Bearer auth to delete test users.
 *
 * @param browser - A Playwright Browser instance (Chromium).
 * @returns The Bearer token string on success, or null if acquisition failed.
 */
async function acquireAdminBearerToken(browser: Browser): Promise<string | null> {
  const tokenName = `playwright-ci-${Date.now()}`;
  const context   = await browser.newContext();
  const page      = await context.newPage();

  try {
    // 1. Login as admin
    await page.goto(`${BASE_URL}/polarion`, { waitUntil: 'domcontentloaded' });

    // Handle 30-day trial screen on fresh Polarion instances
    const trialBtn = page.getByRole('button', { name: 'Start 30-Day Trial' });
    if (await trialBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await trialBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Fill login form if present
    const usernameField = page.locator('#j_username, input[name="j_username"]').first();
    if (await usernameField.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await usernameField.fill(ADMIN_USER);
      await page.locator('#j_password, input[name="j_password"]').first().fill(ADMIN_PASS);
      await page.locator('#submitButton, button[type="submit"], input[type="submit"]').first().click();
      await page.waitForFunction(
        () => !document.querySelector('#j_username, input[name="j_username"]'),
        { timeout: 30_000 },
      );
    }

    // 2. Navigate directly to the PAT management page (no need to go via user profile)
    await page.goto(`${BASE_URL}/polarion/#/user_tokens?id=${ADMIN_USER}`, { waitUntil: 'domcontentloaded' });

    // 3. Wait for GWT to render the "Create New Token" form
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Create New Token'),
      { timeout: 60_000, polling: 2_000 },
    );

    // 4. Fill the form
    //    Name field class:    polarion-Personal-Access-Token-input
    //    Expires on class:    polarion-DateInput-input  (format: YYYY-MM-DD, max 90 days)
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    const dateStr = [
      expires.getFullYear(),
      String(expires.getMonth() + 1).padStart(2, '0'),
      String(expires.getDate()).padStart(2, '0'),
    ].join('-');

    await page.locator('input.polarion-Personal-Access-Token-input').fill(tokenName);
    await page.locator('input.polarion-DateInput-input').fill(dateStr);
    await page.locator('input.polarion-DateInput-input').press('Tab');

    // 5. Submit
    await page.getByRole('button', { name: 'Create Token' }).click();

    // 6. Wait for the one-time token display banner and extract the JWT
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Your new Personal Access Token'),
      { timeout: 10_000, polling: 500 },
    );

    const secret = await page.evaluate(() => {
      const bodyText = document.body?.textContent ?? '';
      const match = /eyJ[A-Za-z0-9+/=._-]{50,}/.exec(bodyText);
      return match ? match[0] : null;
    });

    if (secret) {
      // Persist for cleanup in global-teardown (no REST id – created via UI)
      fs.writeFileSync(CI_TOKEN_FILE, JSON.stringify({ name: tokenName, secret }), 'utf8');
      console.log(`[global-setup] Created PAT "${tokenName}" via Polarion UI.`);
      return secret;
    }
    console.warn('[global-setup] Token banner appeared but JWT could not be extracted from page text.');
  } catch (err) {
    console.warn(`[global-setup] UI-based PAT acquisition failed: ${String(err)}`);
  } finally {
    await context.close();
  }

  return null;
}


/**
 * Provisions a Polarion user (create + password) via the Admin UI.
 *
 * Polarion REST v1 does not support setting passwords on creation or via PATCH.
 * This function uses the pre-saved admin auth state (worker0.json) to navigate
 * to Administration > User Management > Users, check whether the user already
 * exists, and either create them fresh or skip if they're already present.
 *
 * UI form field order on the "Create new User" panel:
 *   text[0] = Login ID   text[1] = Full Name
 *   text[2] = Email      text[3] = Description
 *   password[0] = Password   password[1] = Confirm Password
 *
 * @param browser      - A Playwright Browser instance.
 * @param user         - User data (id, name, password).
 * @param adminAuthFile - Path to the admin storage-state JSON (worker0.json).
 * @returns true on success or if user already exists, false on failure.
 */
async function provisionUserViaUI(
  browser: Browser,
  user: { id: string; name: string; password: string },
  adminAuthFile: string,
): Promise<boolean> {
  const context = await browser.newContext({ storageState: adminAuthFile });
  const page    = await context.newPage();

  try {
    const ciTimeout = process.env.CI ? 90_000 : 30_000;

    await page.goto(
      `${BASE_URL}/polarion/#/administration/user_management/users`,
      { waitUntil: 'domcontentloaded', timeout: ciTimeout },
    );

    // Wait for GWT to render the user list
    await page.waitForFunction(
      () => document.body?.textContent?.includes('Create new User'),
      { timeout: ciTimeout, polling: 1_000 },
    );
    // Give GWT extra time to populate the user-list rows after the toolbar renders
    await page.waitForTimeout(2_000);

    // If the user already exists in the list, skip creation
    const alreadyExists = await page.evaluate(
      (uid: string) => (document.body?.textContent ?? '').includes(uid),
      user.id,
    );
    if (alreadyExists) {
      console.log(`[global-setup] User "${user.id}" already exists – skipping UI creation.`);
      return true;
    }

    // dispatchEvent bypasses the GWT splitter overlay (GLNRHCCBMHB) which
    // intercepts pointer events after navigating back from a user detail view.
    await page.locator('table.polarion-ToolbarButton', { hasText: 'Create new User' }).first().dispatchEvent('click');
    await page.waitForTimeout(1_500);

    // Wait for the creation form: just check that password fields are present.
    // The form may be pre-populated from a previous creation – we clear it below.
    await page.waitForFunction(
      () => document.querySelectorAll('input[type="password"]').length >= 2,
      { timeout: ciTimeout, polling: 500 },
    );

    // Fill form: Name(0), Initials(1), ID(2), Login ID(3), Email(4)
    // Clear each field first in case the form is pre-filled from a previous run.
    const textInputs = page.locator('input[type="text"].polarion-JSTextEditor-Active');
    await textInputs.nth(0).fill('');         // clear Name
    await textInputs.nth(2).fill('');         // clear ID
    await textInputs.nth(3).fill('');         // clear Login ID
    await textInputs.nth(0).fill(user.name); // Name
    await textInputs.nth(2).fill(user.id);   // ID
    await textInputs.nth(3).fill(user.id);   // Login ID

    // Fill password fields
    const pwInputs = page.locator('input[type="password"].polarion-JSTextEditor-Active');
    await pwInputs.nth(0).fill('');
    await pwInputs.nth(1).fill('');
    await pwInputs.nth(0).fill(user.password);
    await pwInputs.nth(1).fill(user.password);

    // Assign required global roles directly in create mode.
    await addGlobalRoleInCreateForm(page, 'user');
    await addGlobalRoleInCreateForm(page, 'admin');

    // Select a license type with available seats via evaluate (reliable across GWT rendering).
    // "Named ALM (0 remaining)" = no seats = user created as disabled.
    const licenseChanged = await page.evaluate(() => {
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
    console.log(`[global-setup] License type for "${user.id}": ${
      licenseChanged ? `"${licenseChanged}"` : 'unchanged (no free seats found)'
    }`);
    await page.waitForTimeout(500);

    // Submit – click the exact "Create" toolbar button (not "Create new User")
    await page.locator('td.polarion-ToolbarButton-Label').filter({ hasText: /^Create$/ }).first().click();

    // Confirm the user now appears in the list
    await page.waitForFunction(
      (uid: string) => (document.body?.textContent ?? '').includes(uid),
      user.id,
      { timeout: ciTimeout, polling: 500 },
    );

    console.log(`[global-setup] Created user "${user.id}" via Admin UI.`);
    return true;
  } catch (err) {
    console.warn(`[global-setup] UI provisioning failed for "${user.id}": ${String(err)}`);
    return false;
  } finally {
    await context.close();
  }
}

/** Adds a user to the built-in Polarion "Administrators" group. */
async function assignAdminRole(
  apiCtx: Awaited<ReturnType<typeof pwRequest.newContext>>,
  userId: string,
): Promise<void> {
  // Primary: add via the group's relationship endpoint (Polarion REST v1)
  const groupResp = await apiCtx.post(
    `${BASE_URL}/polarion/rest/v1/usergroups/Administrators/relationships/users`,
    { data: { data: [{ type: 'users', id: userId }] } },
  );

  if (groupResp.ok()) {
    console.log(`[global-setup] Added "${userId}" to Administrators group.`);
    return;
  }

  // Fallback: PATCH user with globalRoles (some Polarion versions use this)
  console.warn(
    `[global-setup] Group endpoint returned ${groupResp.status()} for "${userId}" – trying PATCH fallback.`,
  );
  const patchResp = await apiCtx.patch(`${BASE_URL}/polarion/rest/v1/users/${userId}`, {
    data: {
      data: {
        type: 'users',
        id: userId,
        attributes: { globalRoles: ['Polarion Administrator'] },
      },
    },
  });

  if (patchResp.ok()) {
    console.log(`[global-setup] Assigned admin role to "${userId}" via PATCH.`);
  } else {
    console.warn(
      `[global-setup] PATCH also failed for "${userId}": ${patchResp.status()} ${await patchResp.text()}`,
    );
    console.warn(
      `[global-setup] Worker may lack admin rights – tests will continue but may fail if admin access is required.`,
    );
  }
}

// ── Browser login helpers ─────────────────────────────────────────────────────

/** Logs in to Polarion with the given credentials and saves storage state. */
async function loginAndSave(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any,
  username: string,
  password: string,
  stateFile: string,
): Promise<void> {
  const context = await browser.newContext({ storageState: undefined });
  const page    = await context.newPage();

  await page.goto(`${BASE_URL}/polarion`, { waitUntil: 'domcontentloaded' });

  // Handle trial activation screen that appears on fresh CI instances
  const trialBtn = page.getByRole('button', { name: 'Start 30-Day Trial' });
  if (await trialBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await trialBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  // Perform login if the form is visible
  const usernameField = page.locator('#j_username, input[name="j_username"]').first();
  const formVisible   = await usernameField.isVisible({ timeout: 10_000 }).catch(() => false);

  if (formVisible) {
    await usernameField.fill(username);
    await page.locator('#j_password, input[name="j_password"]').first().fill(password);
    await page.locator('#submitButton, button[type="submit"], input[type="submit"]').first().click();

    await page.waitForFunction(
      () => !document.querySelector('#j_username, input[name="j_username"]'),
      { timeout: 15_000 },
    );
  }

  await context.storageState({ path: stateFile });
  await context.close();
  console.log(`[global-setup] Saved auth state for "${username}" → ${path.basename(stateFile)}`);
}

// ── Global Setup entry point ──────────────────────────────────────────────────
export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const worker0Path = path.join(AUTH_DIR, 'worker0.json');
  const worker1Path = path.join(AUTH_DIR, 'worker1.json');
  const worker2Path = path.join(AUTH_DIR, 'worker2.json');

  // --- 1. Login as admin via browser → worker0.json ---
  const browser = await chromium.launch();
  try {
    await loginAndSave(browser, ADMIN_USER, ADMIN_PASS, worker0Path);
  } finally {
    await browser.close();
  }

  // --- 2. Acquire a Personal Access Token (PAT) via the Polarion web UI ---
  // Polarion REST API v1 requires a Bearer token for all resource endpoints.
  // We create the PAT via the browser UI (#/user_tokens page) instead of REST
  // Basic-auth, which may be blocked in some Polarion configurations / CI setups.
  const browser2 = await chromium.launch();
  const bearerToken = await acquireAdminBearerToken(browser2);
  await browser2.close();

  if (!bearerToken) {
    console.warn(
      '[global-setup] Could not acquire a PAT – all workers will use admin credentials.',
    );
    fs.copyFileSync(worker0Path, worker1Path);
    fs.copyFileSync(worker0Path, worker2Path);
    return;
  }

  // --- 3. Provision test users via Admin UI (create + password in one step) ---
  // REST PATCH for passwords returns 400 in Polarion – we use the UI instead.
  const browser3 = await chromium.launch();
  let allProvisioned = true;
  try {
    for (const user of TEST_USERS) {
      const ok = await provisionUserViaUI(browser3, user, worker0Path);
      if (!ok) { allProvisioned = false; break; }
    }
  } finally {
    await browser3.close();
  }

  // --- 4. Assign Administrators group via REST (requires valid Bearer token) ---
  if (allProvisioned) {
    const apiCtx = await pwRequest.newContext({
      extraHTTPHeaders: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
    });
    try {
      for (const user of TEST_USERS) {
        await assignAdminRole(apiCtx, user.id);
      }
    } finally {
      await apiCtx.dispose();
    }
  }

  // --- 5. Login as each worker's user and save browser storage state ---
  if (allProvisioned) {
    const browser4 = await chromium.launch();
    try {
      await loginAndSave(browser4, TEST_USERS[0].id, TEST_USERS[0].password, worker1Path);
      await loginAndSave(browser4, TEST_USERS[1].id, TEST_USERS[1].password, worker2Path);
    } finally {
      await browser4.close();
    }
  } else {
    console.warn('[global-setup] User provisioning failed – all workers will use admin credentials.');
    fs.copyFileSync(worker0Path, worker1Path);
    fs.copyFileSync(worker0Path, worker2Path);
  }
}
