/**
 * Playwright Global Teardown
 *
 * Runs ONCE after the full test suite finishes.
 * Deletes the temporary test users that were created in global-setup.ts.
 */

import { request as pwRequest } from '@playwright/test';
import { TEST_USERS } from './global-setup';

const BASE_URL   = process.env.POLARION_URL  ?? 'http://localhost';
const ADMIN_USER = process.env.POLARION_USER ?? 'admin';
const ADMIN_PASS = process.env.POLARION_PASS ?? 'admin';

export default async function globalTeardown(): Promise<void> {
  // Polarion REST API does not accept HTTP Basic auth in newer versions.
  // Authenticate via form login to obtain a session cookie first.
  const apiCtx = await pwRequest.newContext({
    extraHTTPHeaders: { Accept: 'application/json' },
  });

  try {
    // Establish a session cookie via form POST
    await apiCtx.post(`${BASE_URL}/polarion/j_spring_security_check`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        j_username: ADMIN_USER,
        j_password: ADMIN_PASS,
        submit: 'Login',
      }).toString(),
      maxRedirects: 10,
    });

    for (const user of TEST_USERS) {
      const resp = await apiCtx.delete(`${BASE_URL}/polarion/rest/v1/users/${user.id}`);
      if (resp.status() === 404) {
        console.log(`[global-teardown] User "${user.id}" not found – already deleted.`);
      } else if (!resp.ok()) {
        console.warn(`[global-teardown] Failed to delete user "${user.id}": ${resp.status()}`);
      } else {
        console.log(`[global-teardown] Deleted user "${user.id}".`);
      }
    }
  } finally {
    await apiCtx.dispose();
  }
}
