import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, TMP_JOBS_ROOT } from "@/lib/server/constants";
import type { JobFile } from "@/lib/server/types";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

describe("cleanup", () => {
  beforeEach(() => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.resetModules();
    vi.doUnmock("node:fs/promises");
  });

  afterEach(() => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.doUnmock("node:fs/promises");
  });

  function file(jobId: string, status: JobFile["status"]): JobFile {
    return {
      id: "file-1",
      originalName: "reef.jpg",
      safeOutputName: "reef.webp",
      mimeType: "image/jpeg",
      inputBytes: 1000,
      inputPath: path.join(TMP_JOBS_ROOT, jobId, "input", "file-1.jpg"),
      outputPath: path.join(TMP_JOBS_ROOT, jobId, "output", "reef.webp"),
      status
    };
  }

  it("keeps the startup cleanup promise stable across module reloads", async () => {
    const firstModule = await import("@/lib/server/cleanup");
    const firstPromise = firstModule.runStartupCleanupOnce();

    vi.resetModules();

    const secondModule = await import("@/lib/server/cleanup");
    const secondPromise = secondModule.runStartupCleanupOnce();

    expect(secondPromise).toBe(firstPromise);
    await firstPromise;
  });

  it("clears the startup cleanup promise after rejection so a later call retries", async () => {
    const rm = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary cleanup failure"))
      .mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);

    vi.doMock("node:fs/promises", () => ({
      default: {
        rm,
        mkdir
      }
    }));

    const cleanupModule = await import("@/lib/server/cleanup");

    await expect(cleanupModule.runStartupCleanupOnce()).rejects.toThrow(
      "temporary cleanup failure"
    );
    await expect(cleanupModule.runStartupCleanupOnce()).resolves.toBeUndefined();

    expect(rm).toHaveBeenCalledTimes(2);
    expect(mkdir).toHaveBeenCalledTimes(1);
  });

  it("does not remove expired active jobs", async () => {
    const { cleanupExpiredJobs } = await import("@/lib/server/cleanup");
    const { jobStore } = await import("@/lib/server/job-store");
    const { cleanupTmpRoot } = await import("@/lib/server/cleanup");
    const { ensureJobDirs } = await import("@/lib/server/storage");
    await cleanupTmpRoot();
    const paths = await ensureJobDirs("active-job");
    const job = jobStore.create("active-job", [file("active-job", "processing")], DEFAULT_OPTIONS);
    job.status = "processing";
    job.expiresAt = Date.now() - 1;

    await cleanupExpiredJobs(Date.now());

    expect(jobStore.get(job.id)).toBeDefined();
    await expect(fs.stat(paths.jobDir)).resolves.toBeDefined();
    await cleanupTmpRoot();
    jobStore.remove(job.id);
  });

  it("removes expired terminal jobs", async () => {
    const { cleanupExpiredJobs } = await import("@/lib/server/cleanup");
    const { jobStore } = await import("@/lib/server/job-store");
    const { cleanupTmpRoot } = await import("@/lib/server/cleanup");
    const { ensureJobDirs } = await import("@/lib/server/storage");
    await cleanupTmpRoot();
    const paths = await ensureJobDirs("done-job");
    const job = jobStore.create("done-job", [file("done-job", "done")], DEFAULT_OPTIONS);
    job.status = "done";
    job.expiresAt = Date.now() - 1;

    await cleanupExpiredJobs(Date.now());

    expect(jobStore.get(job.id)).toBeUndefined();
    await expect(fs.stat(paths.jobDir)).rejects.toMatchObject({ code: "ENOENT" });
    await cleanupTmpRoot();
  });
});
