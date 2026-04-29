/**
 * Playwright Global Setup
 *
 * Runs ONCE before the full test suite:
 *  1. Logs in as admin via browser and saves auth state (.auth/worker0.json).
 *  2. Creates a temporary Personal Access Token (PAT) via the Polarion web UI.
 *     The PAT is persisted to .auth/.ci-token.json for teardown cleanup.
 *  3. Uses the PAT (Bearer token) to create 2 Polarion test users via REST API.
 *  4. Logs in as each user and saves auth state (worker1.json, worker2.json).
 *     Falls back to copying worker0.json if user creation is not possible.
 *
 * Worker ↔ credentials mapping:
 *   workerIndex % 3 === 0  →  admin / admin          (.auth/worker0.json)
 *   workerIndex % 3 === 1  →  playwright_w1           (.auth/worker1.json)
 *   workerIndex % 3 === 2  →  playwright_w2           (.auth/worker2.json)
 */

import { chromium, Browser, request as pwRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Runtime configuration ─────────────────────────────────────────────────────
const BASE_URL   = process.env.POLARION_URL  ?? 'http://localhost';
const ADMIN_USER = process.env.POLARION_USER ?? 'admin';
const ADMIN_PASS = process.env.POLARION_PASS ?? 'admin';

/** Directory where auth-state JSON files are stored. */
export const AUTH_DIR = path.join(__dirname, '.auth');

/** File used to persist the CI access token between setup and teardown. */
export const CI_TOKEN_FILE = path.join(AUTH_DIR, '.ci-token.json');

/** The two extra test users created for parallel workers 1 & 2. */
export const TEST_USERS = [
  { id: 'playwright_w1', name: 'Playwright Worker 1', password: 'Playwright@W1!' },
  { id: 'playwright_w2', name: 'Playwright Worker 2', password: 'Playwright@W2!' },
] as const;

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


async function createUser(
  apiCtx: Awaited<ReturnType<typeof pwRequest.newContext>>,
  user: { id: string; name: string; password: string },
): Promise<boolean> {
  const resp = await apiCtx.post(`${BASE_URL}/polarion/rest/v1/users`, {
    data: {
      data: [{
        type: 'users',
        attributes: {
          id:   user.id,
          name: user.name,
        },
      }],
    },
  });

  if (resp.status() === 409) {
    console.log(`[global-setup] User "${user.id}" already exists – skipping creation.`);
    return true;
  }
  if (!resp.ok()) {
    console.warn(`[global-setup] Could not create user "${user.id}" (${resp.status()}): ${await resp.text()}`);
    return false;
  }
  console.log(`[global-setup] Created user "${user.id}".`);

  // Set password via PATCH (password is not accepted on creation in Polarion REST v1)
  const patchResp = await apiCtx.patch(`${BASE_URL}/polarion/rest/v1/users/${user.id}`, {
    data: {
      data: {
        type: 'users',
        id: user.id,
        attributes: { password: user.password },
      },
    },
  });
  if (!patchResp.ok()) {
    // Cannot set password via REST – fall back to admin credentials for this worker
    console.warn(
      `[global-setup] Cannot set password for "${user.id}" via REST (${patchResp.status()}). ` +
      `Worker will fall back to admin credentials.`,
    );
    return false;
  }
  return true;
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

  // --- 3. Use Bearer token to create the parallel test users ---
  const apiCtx = await pwRequest.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  });

  let allCreated = true;
  try {
    for (const user of TEST_USERS) {
      const created = await createUser(apiCtx, user);
      if (created) await assignAdminRole(apiCtx, user.id);
      else allCreated = false;
    }
  } finally {
    await apiCtx.dispose();
  }

  // --- 4. Login as each worker's user and save browser storage state ---
  if (allCreated) {
    const browser3 = await chromium.launch();
    try {
      await loginAndSave(browser3, TEST_USERS[0].id, TEST_USERS[0].password, worker1Path);
      await loginAndSave(browser3, TEST_USERS[1].id, TEST_USERS[1].password, worker2Path);
    } finally {
      await browser3.close();
    }
  } else {
    console.warn('[global-setup] Some users could not be created – affected workers will use admin credentials.');
    fs.copyFileSync(worker0Path, worker1Path);
    fs.copyFileSync(worker0Path, worker2Path);
  }
}
