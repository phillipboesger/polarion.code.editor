/**
 * Playwright Global Setup
 *
 * Runs ONCE before the full test suite:
 *  1. Logs in as admin via browser and saves auth state (.auth/worker0.json).
 *  2. Creates a temporary Personal Access Token (PAT) for the admin via REST.
 *     Strategy A: Basic auth on the token-bootstrap endpoint.
 *     Strategy B: (future) UI-based token creation if A is blocked.
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

import { chromium, request as pwRequest } from '@playwright/test';
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
 * Acquires a Personal Access Token (PAT) for the admin user.
 *
 * Polarion REST API v1 requires a Bearer token for all resource endpoints.
 * The token-creation endpoint itself accepts HTTP Basic auth as a bootstrap
 * mechanism – this is the standard way to get the first token for a user.
 *
 * The token id + secret are persisted to CI_TOKEN_FILE so that globalTeardown
 * can delete the token after the test suite completes.
 *
 * Returns the Bearer token string on success, or null if all strategies fail.
 */
async function acquireAdminBearerToken(): Promise<string | null> {
  const tokenName = `playwright-ci-${Date.now()}`;

  // Bootstrap: use Basic auth to create the initial PAT.
  // The Polarion accesstokens endpoint is the one endpoint that accepts Basic auth.
  const bootstrapCtx = await pwRequest.newContext({
    extraHTTPHeaders: {
      Authorization: `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  });

  try {
    const resp = await bootstrapCtx.post(
      `${BASE_URL}/polarion/rest/v1/users/${ADMIN_USER}/accesstokens`,
      {
        data: {
          data: {
            type:       'accesstokens',
            attributes: { name: tokenName },
          },
        },
      },
    );

    if (resp.ok()) {
      const body = await resp.json() as Record<string, unknown>;
      const attrs = (body?.data as Record<string, unknown>)?.attributes as Record<string, unknown> | undefined;
      // Polarion returns the secret once at creation time – field may be "secret" or "token"
      const secret = (attrs?.secret ?? attrs?.token) as string | undefined;
      const id     = (body?.data as Record<string, unknown>)?.id as string | undefined;

      if (secret) {
        fs.writeFileSync(CI_TOKEN_FILE, JSON.stringify({ id, name: tokenName, secret }), 'utf8');
        console.log(`[global-setup] Created PAT "${tokenName}" (id: ${id ?? 'unknown'}) – will use as Bearer token.`);
        return secret;
      }
      console.warn('[global-setup] PAT response did not contain a secret field:', JSON.stringify(body));
    } else {
      console.warn(`[global-setup] PAT creation via Basic auth returned ${resp.status()}: ${await resp.text()}`);
    }
  } finally {
    await bootstrapCtx.dispose();
  }

  return null;
}


async function createUser(
  apiCtx: Awaited<ReturnType<typeof pwRequest.newContext>>,
  user: { id: string; name: string; password: string },
): Promise<boolean> {
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
    return true;
  }
  if (!resp.ok()) {
    console.warn(`[global-setup] Could not create user "${user.id}" (${resp.status()}): ${await resp.text()}`);
    return false;
  }
  console.log(`[global-setup] Created user "${user.id}".`);
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

  // --- 2. Acquire a Personal Access Token (PAT) for REST API calls ---
  // Polarion REST API v1 requires a Bearer token – Basic auth and session
  // cookies are rejected with 401 "No access token" on resource endpoints.
  // The /accesstokens endpoint itself accepts Basic auth as a bootstrap
  // mechanism so we can obtain the first token without a pre-existing PAT.
  const bearerToken = await acquireAdminBearerToken();

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
    const browser2 = await chromium.launch();
    try {
      await loginAndSave(browser2, TEST_USERS[0].id, TEST_USERS[0].password, worker1Path);
      await loginAndSave(browser2, TEST_USERS[1].id, TEST_USERS[1].password, worker2Path);
    } finally {
      await browser2.close();
    }
  } else {
    console.warn('[global-setup] Some users could not be created – affected workers will use admin credentials.');
    fs.copyFileSync(worker0Path, worker1Path);
    fs.copyFileSync(worker0Path, worker2Path);
  }
}
