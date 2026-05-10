import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/server/constants";
import { createJobStore } from "@/lib/server/job-store";
import type { JobFile } from "@/lib/server/types";

function file(overrides: Partial<JobFile> = {}): JobFile {
  return {
    id: "file-1",
    originalName: "reef.jpg",
    safeOutputName: "reef.webp",
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: "/tmp/in.jpg",
    outputPath: "/tmp/out.webp",
    status: "queued",
    ...overrides
  };
}

describe("job store", () => {
  it("creates a queued job with expiry", () => {
    const store = createJobStore();
    const job = store.create("job-1", [file()], DEFAULT_OPTIONS);

    expect(job.status).toBe("queued");
    expect(job.files[0].status).toBe("queued");
    expect(job.expiresAt).toBeGreaterThan(job.createdAt);
  });

  it("marks job done when all files are done", () => {
    const store = createJobStore();
    const job = store.create("job-1", [file()], DEFAULT_OPTIONS);

    store.updateFile(job.id, "file-1", {
      status: "done",
      outputBytes: 500,
      reductionPercent: 50
    });
    store.refreshJobStatus(job.id);

    expect(store.get(job.id)?.status).toBe("done");
  });

  it("marks job partial when at least one file fails and one succeeds", () => {
    const store = createJobStore();
    const job = store.create(
      "job-1",
      [
        file({ id: "file-1", status: "queued" }),
        file({ id: "file-2", originalName: "bad.jpg", status: "queued" })
      ],
      DEFAULT_OPTIONS
    );

    store.updateFile(job.id, "file-1", { status: "done", outputBytes: 500 });
    store.updateFile(job.id, "file-2", { status: "failed", error: "Corrupt image" });
    store.refreshJobStatus(job.id);

    expect(store.get(job.id)?.status).toBe("partial");
  });

  it("marks job failed when all files fail", () => {
    const store = createJobStore();
    const job = store.create(
      "job-1",
      [
        file({ id: "file-1", status: "queued" }),
        file({ id: "file-2", originalName: "bad.jpg", status: "queued" })
      ],
      DEFAULT_OPTIONS
    );

    store.updateFile(job.id, "file-1", { status: "failed", error: "Corrupt image" });
    store.updateFile(job.id, "file-2", { status: "failed", error: "Unsupported image" });
    store.refreshJobStatus(job.id);

    expect(store.get(job.id)?.status).toBe("failed");
  });

  it("does not expose private file paths in public jobs", () => {
    const store = createJobStore();
    const job = store.create("job-1", [file()], DEFAULT_OPTIONS);

    const publicJob = store.toPublic(job);

    expect(publicJob.files[0]).not.toHaveProperty("inputPath");
    expect(publicJob.files[0]).not.toHaveProperty("outputPath");
  });
});
