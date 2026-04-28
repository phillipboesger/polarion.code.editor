/**
 * Custom Playwright fixture extensions for parallel worker execution.
 *
 * Provides two worker-scoped fixtures:
 *
 *  1. `storageState` override – each worker loads the pre-authenticated
 *     browser state saved by global-setup.ts, so tests start already
 *     logged in without any extra navigation.
 *
 *     Worker mapping (workerIndex % 3):
 *       0 → admin        (.auth/worker0.json)
 *       1 → playwright_w1 (.auth/worker1.json)
 *       2 → playwright_w2 (.auth/worker2.json)
 *
 *  2. `workerPrefix` – a unique string combining the worker index and the
 *     current timestamp. Use this as the prefix for every file created
 *     inside a test to avoid cross-worker filename collisions.
 *
 * Usage in specs:
 *   import { test, expect } from '../fixtures';
 *   // storageState is applied automatically to every page.
 *   // For file names, use workerPrefix inside beforeAll / beforeEach:
 *   let FILE_A: string;
 *   test.beforeAll(({ workerPrefix }) => { FILE_A = `my-file-${workerPrefix}.txt`; });
 */

import { test as base, type TestType, type PlaywrightTestArgs, type PlaywrightTestOptions, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions } from '@playwright/test';
import * as path from 'node:path';
import { AUTH_DIR } from '../global-setup';

// ── Worker-fixture types ──────────────────────────────────────────────────────

type WorkerFixtures = {
  /** Absolute path to the pre-authenticated storage-state JSON for this worker. */
  workerStorageState: string;
  /**
   * Unique file-name prefix for this worker.
   * Format: `w{workerIndex}-{Date.now()}` – guaranteed unique across workers
   * and across retries within the same worker.
   */
  workerPrefix: string;
};

// ── Extended test object ──────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export const test = (base.extend as any)<Record<string, never>, WorkerFixtures>({
  // Worker 0 = admin, Worker 1 = playwright_w1, Worker 2 = playwright_w2
  workerStorageState: [
    async ({}: Record<string, never>, use: (s: string) => Promise<void>, workerInfo: { workerIndex: number }) => {
      const idx = workerInfo.workerIndex % 3;
      await use(path.join(AUTH_DIR, `worker${idx}.json`));
    },
    { scope: 'worker' },
  ],

  workerPrefix: [
    async ({}: Record<string, never>, use: (s: string) => Promise<void>, workerInfo: { workerIndex: number }) => {
      // Include workerIndex so the prefix is unique even if Date.now() collides
      // across workers that start at the exact same millisecond.
      await use(`w${workerInfo.workerIndex}-${Date.now()}`);
    },
    { scope: 'worker' },
  ],

  // Override the built-in storageState option so every browser context created
  // in this worker is pre-authenticated with the worker's own session.
  storageState: async (
    { workerStorageState }: { workerStorageState: string },
    use: (s: string) => Promise<void>,
  ) => {
    await use(workerStorageState);
  },
}) as TestType<
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & WorkerFixtures
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export { expect } from '@playwright/test';
