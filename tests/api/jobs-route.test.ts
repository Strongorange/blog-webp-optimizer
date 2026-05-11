import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TMP_JOBS_ROOT } from "@/lib/server/constants";
import { cleanupTmpRoot } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";
import { getJobPaths } from "@/lib/server/storage";
import type { JobFile } from "@/lib/server/types";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

function imageFile(name: string, type: string, content = "image-bytes"): File {
  return new File([content], name, { type });
}

function formDataWithFiles(files: File[]): FormData {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function postRequest(formData: FormData, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    body: formData,
    headers
  });
}

function jobFile(overrides: Partial<JobFile> = {}): JobFile {
  return {
    id: "file-1",
    originalName: "reef.jpg",
    safeOutputName: "reef.webp",
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: path.join(TMP_JOBS_ROOT, "job-1", "input", "file-1.jpg"),
    outputPath: path.join(TMP_JOBS_ROOT, "job-1", "output", "reef.webp"),
    status: "queued",
    ...overrides
  };
}

async function importPostRoute() {
  vi.resetModules();
  vi.doMock("@/lib/server/job-runner", () => ({
    processJobSafely: vi.fn().mockResolvedValue(undefined)
  }));

  return import("@/app/api/jobs/route");
}

async function importGetRoute() {
  vi.resetModules();
  return import("@/app/api/jobs/[jobId]/route");
}

describe("jobs API routes", () => {
  beforeEach(async () => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.doUnmock("@/lib/server/storage");
    vi.doUnmock("@/lib/server/job-runner");
    vi.doUnmock("node:crypto");
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await cleanupTmpRoot();
  });

  afterEach(async () => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.doUnmock("@/lib/server/storage");
    vi.doUnmock("@/lib/server/job-runner");
    vi.doUnmock("node:crypto");
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await fs.rm(TMP_JOBS_ROOT, { recursive: true, force: true });
  });

  it("rejects unsupported extensions with 400", async () => {
    const { POST } = await importPostRoute();
    const response = await POST(postRequest(formDataWithFiles([imageFile("reef.gif", "image/gif")])));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported file type: reef.gif"
    });
  });

  it("rejects cross-origin browser uploads before staging files", async () => {
    const { POST } = await importPostRoute();
    const response = await POST(
      postRequest(formDataWithFiles([imageFile("reef.jpg", "image/jpeg")]), {
        Origin: "https://example.com"
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Cross-origin uploads are not allowed."
    });
  });

  it("rejects cross-site fetch metadata uploads", async () => {
    const { POST } = await importPostRoute();
    const response = await POST(
      postRequest(formDataWithFiles([imageFile("reef.jpg", "image/jpeg")]), {
        "Sec-Fetch-Site": "cross-site"
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Cross-origin uploads are not allowed."
    });
  });

  it("accepts supported image extensions without trusting browser MIME detection", async () => {
    const { POST } = await importPostRoute();
    const response = await POST(postRequest(formDataWithFiles([imageFile("reef.jpg", "")])));

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.files[0]).toMatchObject({
      originalName: "reef.jpg",
      safeOutputName: "reef.webp"
    });
  });

  it("returns 404 for a missing job", async () => {
    const { GET } = await importGetRoute();
    const response = await GET(new Request("http://localhost/api/jobs/missing"), {
      params: Promise.resolve({ jobId: "missing" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found." });
  });

  it("returns public job data without filesystem paths", async () => {
    const { GET } = await importGetRoute();
    const job = jobStore.create("job-1", [jobFile()], {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });

    const response = await GET(new Request(`http://localhost/api/jobs/${job.id}`), {
      params: Promise.resolve({ jobId: job.id })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files[0]).not.toHaveProperty("inputPath");
    expect(body.files[0]).not.toHaveProperty("outputPath");
  });

  it("cleans up the temporary job directory after a partial staging failure", async () => {
    vi.resetModules();
    vi.doMock("node:crypto", () => ({
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("job-staging-failure")
        .mockReturnValueOnce("file-1")
        .mockReturnValueOnce("file-2")
    }));
    vi.doMock("@/lib/server/job-runner", () => ({
      processJobSafely: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock("@/lib/server/storage", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/server/storage")>();
      return {
        ...actual,
        writeUploadedFile: vi
          .fn()
          .mockImplementationOnce(async (_file: File, destinationPath: string) => {
            await fs.writeFile(destinationPath, "first-file");
            return 10;
          })
          .mockRejectedValueOnce(new Error("disk full"))
      };
    });

    const { POST } = await import("@/app/api/jobs/route");
    const response = await POST(
      postRequest(
        formDataWithFiles([
          imageFile("one.jpg", "image/jpeg"),
          imageFile("two.jpg", "image/jpeg")
        ])
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Upload staging failed." });
    await expect(fs.stat(getJobPaths("job-staging-failure").jobDir)).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("cleans up the temporary job directory after a partial directory setup failure", async () => {
    vi.resetModules();
    vi.doMock("node:crypto", () => ({
      randomUUID: vi.fn().mockReturnValueOnce("job-dir-failure")
    }));
    vi.doMock("@/lib/server/job-runner", () => ({
      processJobSafely: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock("@/lib/server/storage", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/server/storage")>();
      return {
        ...actual,
        ensureJobDirs: vi.fn().mockImplementationOnce(async (jobId: string) => {
          const paths = actual.getJobPaths(jobId);
          await fs.mkdir(paths.inputDir, { recursive: true });
          throw new Error("cannot create output dir");
        })
      };
    });

    const { POST } = await import("@/app/api/jobs/route");
    const response = await POST(
      postRequest(formDataWithFiles([imageFile("reef.jpg", "image/jpeg")]))
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Upload staging failed." });
    await expect(fs.stat(getJobPaths("job-dir-failure").jobDir)).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("returns 202 with a public job shape for a valid upload", async () => {
    const { POST } = await importPostRoute();
    const response = await POST(
      postRequest(formDataWithFiles([imageFile("reef.jpg", "image/jpeg")]))
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      status: "queued",
      files: [
        {
          id: expect.any(String),
          originalName: "reef.jpg",
          safeOutputName: "reef.webp",
          mimeType: "image/jpeg",
          inputBytes: expect.any(Number),
          status: "queued"
        }
      ]
    });
    expect(body.files[0]).not.toHaveProperty("inputPath");
    expect(body.files[0]).not.toHaveProperty("outputPath");
  });
});
