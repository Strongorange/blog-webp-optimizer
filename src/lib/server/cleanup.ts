import fs from "node:fs/promises";
import { TMP_JOBS_ROOT } from "./constants";
import { jobStore } from "./job-store";
import { removeJobDir } from "./storage";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

export async function cleanupExpiredJobs(now = Date.now()): Promise<void> {
  for (const job of jobStore.list()) {
    if (job.expiresAt <= now) {
      await removeJobDir(job.id);
      jobStore.remove(job.id);
    }
  }
}

export async function cleanupTmpRoot(): Promise<void> {
  await fs.rm(TMP_JOBS_ROOT, { recursive: true, force: true });
  await fs.mkdir(TMP_JOBS_ROOT, { recursive: true });
}

export function runStartupCleanupOnce(): Promise<void> {
  if (!globalCleanup.__blogWebpOptimizerStartupCleanupPromise) {
    const startupCleanupPromise = cleanupTmpRoot().catch((error: unknown) => {
      if (globalCleanup.__blogWebpOptimizerStartupCleanupPromise === startupCleanupPromise) {
        delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
      }

      throw error;
    });

    globalCleanup.__blogWebpOptimizerStartupCleanupPromise = startupCleanupPromise;
  }

  return globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
}
