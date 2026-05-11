import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/server/constants";
import { jobStore } from "@/lib/server/job-store";
import type { JobFile } from "@/lib/server/types";
import { GET as downloadJob } from "@/app/api/jobs/[jobId]/download/route";
import { GET as downloadFile } from "@/app/api/jobs/[jobId]/files/[fileId]/route";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

let tempDir: string;

function jobFile(overrides: Partial<JobFile> = {}): JobFile {
  const id = overrides.id ?? "file-1";
  const safeOutputName = overrides.safeOutputName ?? `${id}.webp`;

  return {
    id,
    originalName: `${id}.jpg`,
    safeOutputName,
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: path.join(tempDir, "input", `${id}.jpg`),
    outputPath: path.join(tempDir, "output", safeOutputName),
    status: "done",
    ...overrides
  };
}

async function writeOutput(file: JobFile, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file.outputPath), { recursive: true });
  await fs.writeFile(file.outputPath, content);
}

async function responseText(response: Response): Promise<string> {
  return Buffer.from(await response.arrayBuffer()).toString("utf8");
}

async function responseLatin1(response: Response): Promise<string> {
  return Buffer.from(await response.arrayBuffer()).toString("latin1");
}

describe("download API routes", () => {
  beforeEach(async () => {
    globalCleanup.__blogWebpOptimizerStartupCleanupPromise = Promise.resolve();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-webp-download-routes-"));
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
  });

  afterEach(async () => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns 404 for a missing job file download", async () => {
    const response = await downloadFile(new Request("http://localhost/api/jobs/missing/files/file-1"), {
      params: Promise.resolve({ jobId: "missing", fileId: "file-1" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found." });
  });

  it("returns 404 for a missing or not-ready file download", async () => {
    const queued = jobFile({ id: "queued", status: "queued" });
    const job = jobStore.create("job-1", [queued], DEFAULT_OPTIONS);

    const missingResponse = await downloadFile(
      new Request(`http://localhost/api/jobs/${job.id}/files/missing`),
      {
        params: Promise.resolve({ jobId: job.id, fileId: "missing" })
      }
    );
    const queuedResponse = await downloadFile(
      new Request(`http://localhost/api/jobs/${job.id}/files/${queued.id}`),
      {
        params: Promise.resolve({ jobId: job.id, fileId: queued.id })
      }
    );

    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({
      error: "Converted file not found."
    });
    expect(queuedResponse.status).toBe(404);
    await expect(queuedResponse.json()).resolves.toEqual({
      error: "Converted file not found."
    });
  });

  it("downloads a converted file with attachment headers", async () => {
    const file = jobFile({ safeOutputName: "reef.webp" });
    await writeOutput(file, "webp data");
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);

    const response = await downloadFile(
      new Request(`http://localhost/api/jobs/${job.id}/files/${file.id}`),
      {
        params: Promise.resolve({ jobId: job.id, fileId: file.id })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Content-Length")).toBe(String(Buffer.byteLength("webp data")));
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="reef.webp"');
    await expect(responseText(response)).resolves.toBe("webp data");
  });

  it("returns 404 when the converted file artifact is missing", async () => {
    const file = jobFile({ safeOutputName: "missing.webp" });
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);

    const response = await downloadFile(
      new Request(`http://localhost/api/jobs/${job.id}/files/${file.id}`),
      {
        params: Promise.resolve({ jobId: job.id, fileId: file.id })
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Converted file not found."
    });
  });

  it("returns 404 for a missing ZIP download job", async () => {
    const response = await downloadJob(new Request("http://localhost/api/jobs/missing/download"), {
      params: Promise.resolve({ jobId: "missing" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found." });
  });

  it("returns 404 for a ZIP download with no done files", async () => {
    const failed = jobFile({ id: "failed", status: "failed" });
    const job = jobStore.create("job-1", [failed], DEFAULT_OPTIONS);

    const response = await downloadJob(new Request(`http://localhost/api/jobs/${job.id}/download`), {
      params: Promise.resolve({ jobId: job.id })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No converted files are ready."
    });
  });

  it("downloads a ZIP of converted files with attachment headers", async () => {
    const done = jobFile({ id: "done", safeOutputName: "done.webp" });
    const failed = jobFile({ id: "failed", safeOutputName: "failed.webp", status: "failed" });
    await writeOutput(done, "webp data");
    await writeOutput(failed, "bad data");
    const job = jobStore.create("job-1", [done, failed], DEFAULT_OPTIONS);

    const response = await downloadJob(new Request(`http://localhost/api/jobs/${job.id}/download`), {
      params: Promise.resolve({ jobId: job.id })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="blog-webp-job-1.zip"');
    expect(response.headers.get("Content-Length")).toBeNull();

    const zip = await responseLatin1(response);
    expect(zip.length).toBeGreaterThan(20);
    expect(zip).toContain("done.webp");
    expect(zip).not.toContain("failed.webp");
  });

  it("returns 404 when a ZIP artifact is missing", async () => {
    const file = jobFile({ safeOutputName: "missing.webp" });
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);

    const response = await downloadJob(new Request(`http://localhost/api/jobs/${job.id}/download`), {
      params: Promise.resolve({ jobId: job.id })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Converted file not found."
    });
  });
});
