/**
 * Playwright Global Setup
 *
 * Runs ONCE before the full test suite:
 *  1. Creates 2 Polarion admin test users via REST API (idempotent – 409 is OK).
 *  2. Assigns both users to the built-in "Administrators" group.
 *  3. Logs in as each user (+ the built-in admin) and saves auth state to
 *     .auth/worker{0,1,2}.json so each parallel worker starts pre-authenticated.
 *
 * Worker ↔ credentials mapping:
 *   workerIndex % 3 === 0  →  admin / admin          (.auth/worker0.json)
 *   workerIndex % 3 === 1  →  playwright_w1           (.auth/worker1.json)
 *   workerIndex % 3 === 2  →  playwright_w2           (.auth/worker2.json)
 */

import { chromium, request as pwRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Runtime configuration ─────────────────────────────────────────────────────
const BASE_URL   = process.env.POLARION_URL  ?? 'http://localhost';
const ADMIN_USER = process.env.POLARION_USER ?? 'admin';
const ADMIN_PASS = process.env.POLARION_PASS ?? 'admin';

/** Directory where auth-state JSON files are stored. */
export const AUTH_DIR = path.join(__dirname, '.auth');

/** The two extra test users created for parallel workers 1 & 2. */
export const TEST_USERS = [
  { id: 'playwright_w1', name: 'Playwright Worker 1', password: 'Playwright@W1!' },
  { id: 'playwright_w2', name: 'Playwright Worker 2', password: 'Playwright@W2!' },
] as const;

// ── REST helpers ──────────────────────────────────────────────────────────────

/** Creates a Polarion user via REST API v1 (JSON:API). */
async function createUser(
  apiCtx: Awaited<ReturnType<typeof pwRequest.newContext>>,
  user: { id: string; name: string; password: string },
): Promise<void> {
  const resp = await apiCtx.post(`${BASE_URL}/polarion/rest/v1/users`, {
    data: {
      data: {
        type: 'users',
        id: user.id,
        attributes: {
          name:        user.name,
          password:    user.password,
          description: 'Playwright parallel test user – auto-created',
          email:       `${user.id}@playwright.test`,
          disabled:    false,
        },
      },
    },
  });

  if (resp.status() === 409) {
    console.log(`[global-setup] User "${user.id}" already exists – skipping creation.`);
    return;
  }
  if (!resp.ok()) {
    throw new Error(
      `[global-setup] Failed to create user "${user.id}": ${resp.status()} ${await resp.text()}`,
    );
  }
  console.log(`[global-setup] Created user "${user.id}".`);
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

  // --- 1. Login as admin first so we have a valid session cookie ---
  // Polarion REST API does not accept HTTP Basic auth in newer versions
  // (returns 401 "No access token"). We use the browser session instead.
  const browser = await chromium.launch();
  const worker0Path = path.join(AUTH_DIR, 'worker0.json');
  try {
    await loginAndSave(browser, ADMIN_USER, ADMIN_PASS, worker0Path);
  } finally {
    await browser.close();
  }

  // --- 2. Create test users + assign admin role via REST API ---
  // Re-use the admin session cookie (storageState) so the request is
  // authenticated without relying on Basic auth.
  const apiCtx = await pwRequest.newContext({
    storageState: worker0Path,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  });

  try {
    for (const user of TEST_USERS) {
      await createUser(apiCtx, user);
      await assignAdminRole(apiCtx, user.id);
    }
  } finally {
    await apiCtx.dispose();
  }

  // --- 3. Login as each worker's user and save browser storage state ---
  const browser2 = await chromium.launch();
  try {
    // Worker 1 → playwright_w1
    await loginAndSave(browser2, TEST_USERS[0].id, TEST_USERS[0].password, path.join(AUTH_DIR, 'worker1.json'));
    // Worker 2 → playwright_w2
    await loginAndSave(browser2, TEST_USERS[1].id, TEST_USERS[1].password, path.join(AUTH_DIR, 'worker2.json'));
  } finally {
    await browser2.close();
  }
}
