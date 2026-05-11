import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, TMP_JOBS_ROOT } from "@/lib/server/constants";
import { cleanupTmpRoot } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";
import type { JobFile } from "@/lib/server/types";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

function jobFile(overrides: Partial<JobFile> = {}): JobFile {
  const id = overrides.id ?? "file-1";
  const safeOutputName = overrides.safeOutputName ?? `${id}.webp`;
  return {
    id,
    originalName: `${id}.jpg`,
    safeOutputName,
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: path.join(TMP_JOBS_ROOT, "job-1", "input", `${id}.jpg`),
    outputPath: path.join(TMP_JOBS_ROOT, "job-1", "output", safeOutputName),
    status: "done",
    ...overrides
  };
}

function uploadRequest(body: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/wordpress/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function importStatusRoute() {
  vi.resetModules();
  return import("@/app/api/wordpress/status/route");
}

async function importUploadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/server/wordpress-client", () => ({
    uploadWordPressMediaFiles: vi.fn().mockResolvedValue([
      {
        fileId: "file-1",
        status: "uploaded",
        attachmentId: 123,
        url: "https://strongorange.net/wp-content/uploads/file-1.webp"
      }
    ])
  }));
  return import("@/app/api/wordpress/upload/route");
}

describe("wordpress API routes", () => {
  beforeEach(async () => {
    globalCleanup.__blogWebpOptimizerStartupCleanupPromise = Promise.resolve();
    vi.stubEnv("WORDPRESS_URL", "https://strongorange.net");
    vi.stubEnv("WORDPRESS_USERNAME", "strongorange");
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "abcd efgh");
    vi.doUnmock("@/lib/server/wordpress-client");
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await cleanupTmpRoot();
  });

  afterEach(async () => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/server/wordpress-client");
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await fs.rm(TMP_JOBS_ROOT, { recursive: true, force: true });
  });

  it("returns configured wordpress status without secrets", async () => {
    const { GET } = await importStatusRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      configured: true,
      siteUrl: "https://strongorange.net"
    });
  });

  it("returns unconfigured wordpress status", async () => {
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "");
    const { GET } = await importStatusRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false });
  });

  it("rejects upload when wordpress config is missing", async () => {
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "");
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: "job-1", fileIds: ["file-1"] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "WordPress upload is not configured."
    });
  });

  it("rejects cross-origin upload requests", async () => {
    const { POST } = await importUploadRoute();
    const response = await POST(
      uploadRequest(
        { jobId: "job-1", fileIds: ["file-1"] },
        { Origin: "https://example.com" }
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Cross-origin uploads are not allowed."
    });
  });

  it("rejects missing jobs", async () => {
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: "missing", fileIds: ["file-1"] }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found." });
  });

  it("rejects files that are not converted", async () => {
    const queued = jobFile({ status: "queued" });
    const job = jobStore.create("job-1", [queued], DEFAULT_OPTIONS);
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: job.id, fileIds: [queued.id] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No converted files are ready to upload."
    });
  });

  it("returns per-file failure when an output artifact is missing", async () => {
    const file = jobFile({ id: "file-1", safeOutputName: "file-1.webp" });
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: job.id, fileIds: [file.id] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          fileId: file.id,
          status: "failed",
          error: "Converted file not found."
        }
      ]
    });
  });

  it("uploads converted files and returns wordpress results", async () => {
    const file = jobFile({ id: "file-1", safeOutputName: "file-1.webp" });
    await fs.mkdir(path.dirname(file.outputPath), { recursive: true });
    await fs.writeFile(file.outputPath, "webp data");
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);

    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: job.id, fileIds: [file.id] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          fileId: "file-1",
          status: "uploaded",
          attachmentId: 123,
          url: "https://strongorange.net/wp-content/uploads/file-1.webp"
        }
      ]
    });
  });
});
