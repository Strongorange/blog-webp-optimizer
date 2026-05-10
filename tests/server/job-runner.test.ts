import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/server/constants";
import { jobStore } from "@/lib/server/job-store";
import type { JobFile } from "@/lib/server/types";

function file(overrides: Partial<JobFile> = {}): JobFile {
  return {
    id: "file-1",
    originalName: "reef.jpg",
    safeOutputName: "reef.webp",
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: "/tmp/missing-input.jpg",
    outputPath: "/tmp/missing-output.webp",
    status: "queued",
    ...overrides
  };
}

describe("job runner", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/server/image-engine");
    vi.resetModules();
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
  });

  it("marks conversion failures as failed and refreshes the job state", async () => {
    vi.resetModules();
    vi.doMock("@/lib/server/image-engine", () => ({
      convertToWebP: vi
        .fn()
        .mockRejectedValueOnce(new Error("Corrupt image"))
        .mockResolvedValueOnce({ outputBytes: 500, reductionPercent: 50 })
    }));

    const { processJob } = await import("@/lib/server/job-runner");
    const job = jobStore.create(
      "job-runner-failure",
      [
        file({ id: "file-1" }),
        file({
          id: "file-2",
          originalName: "other.jpg",
          safeOutputName: "other.webp",
          inputPath: "/tmp/input-2.jpg",
          outputPath: "/tmp/output-2.webp"
        })
      ],
      DEFAULT_OPTIONS
    );

    await processJob(job.id);

    const updatedJob = jobStore.get(job.id);
    expect(updatedJob?.status).toBe("partial");
    expect(updatedJob?.files[0]).toMatchObject({
      status: "failed",
      error: expect.any(String)
    });
  });

  it("marks active files failed when job processing has a terminal failure", async () => {
    const { processJobSafely } = await import("@/lib/server/job-runner");
    const job = jobStore.create("job-terminal-failure", [file()], {
      ...DEFAULT_OPTIONS,
      concurrency: 0
    });

    await processJobSafely(job.id);

    const updatedJob = jobStore.get(job.id);
    expect(updatedJob?.status).toBe("failed");
    expect(updatedJob?.files[0]).toMatchObject({
      status: "failed",
      error: expect.any(String)
    });
  });
});
