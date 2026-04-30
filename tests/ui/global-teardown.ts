/**
 * Playwright Global Teardown
 *
 * Runs ONCE after the full test suite finishes.
 * Reads the PAT that was created in global-setup.ts and uses it to:
 *   1. Delete the temporary Playwright test users.
 *   2. Delete the PAT itself (so it doesn't accumulate in Polarion).
 *
 * If the CI_TOKEN_FILE does not exist (e.g. users were not created), the
 * teardown exits silently – nothing to clean up.
 */

import * as fs from 'node:fs';
import { request as pwRequest } from '@playwright/test';
import { CI_TOKEN_FILE } from './global-setup';
import { BASE_URL, ADMIN_USER, TEST_USERS } from './helpers/auth';

export default async function globalTeardown(): Promise<void> {
  // Read the persisted PAT created during setup
  if (!fs.existsSync(CI_TOKEN_FILE)) {
    console.log('[global-teardown] No CI token file found – assuming no test users were created, nothing to clean up.');
    return;
  }

  const { id: tokenId, secret } = JSON.parse(fs.readFileSync(CI_TOKEN_FILE, 'utf8')) as {
    id: string;
    name: string;
    secret: string;
  };

  const apiCtx = await pwRequest.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  });

  try {
    // 1. Delete test users
    for (const user of TEST_USERS) {
      const resp = await apiCtx.delete(`${BASE_URL}/polarion/rest/v1/users/${user.id}`);
      if (resp.status() === 404) {
        console.log(`[global-teardown] User "${user.id}" already deleted.`);
      } else if (resp.ok()) {
        console.log(`[global-teardown] Deleted user "${user.id}".`);
      } else {
        console.warn(`[global-teardown] Failed to delete user "${user.id}": ${resp.status()} ${await resp.text()}`);
      }
    }

    // 2. Delete the PAT so it does not accumulate in Polarion
    if (tokenId) {
      const tokenResp = await apiCtx.delete(
        `${BASE_URL}/polarion/rest/v1/users/${ADMIN_USER}/accesstokens/${tokenId}`,
      );
      if (tokenResp.ok() || tokenResp.status() === 404) {
        console.log(`[global-teardown] Deleted CI PAT (id: ${tokenId}).`);
      } else {
        console.warn(`[global-teardown] Could not delete PAT (id: ${tokenId}): ${tokenResp.status()}`);
      }
    }
  } finally {
    await apiCtx.dispose();
    // Remove the token file regardless – the secret is no longer valid
    try { fs.unlinkSync(CI_TOKEN_FILE); } catch { /* ignore */ }
  }
}
