import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissingOutputArtifactError, createZipBuffer } from "@/lib/server/zip";
import type { JobFile } from "@/lib/server/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-webp-zip-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function jobFile(id: string, status: JobFile["status"], outputName: string): JobFile {
  return {
    id,
    originalName: `${id}.jpg`,
    safeOutputName: outputName,
    mimeType: "image/jpeg",
    inputBytes: 10,
    inputPath: path.join(tempDir, `${id}.jpg`),
    outputPath: path.join(tempDir, outputName),
    status
  };
}

describe("createZipBuffer", () => {
  it("includes successful output files only", async () => {
    const done = jobFile("done", "done", "done.webp");
    const failed = jobFile("failed", "failed", "failed.webp");
    await fs.writeFile(done.outputPath, Buffer.from("webp data"));
    await fs.writeFile(failed.outputPath, Buffer.from("bad data"));

    const zip = await createZipBuffer([done, failed]);

    expect(zip.length).toBeGreaterThan(20);
    expect(zip.toString("latin1")).toContain("done.webp");
    expect(zip.toString("latin1")).not.toContain("failed.webp");
  });

  it("reports a missing artifact if archiver sees ENOENT after the pre-check", async () => {
    const done = jobFile("done", "done", "done.webp");
    vi.spyOn(fs, "access").mockResolvedValue(undefined);

    await expect(createZipBuffer([done])).rejects.toBeInstanceOf(MissingOutputArtifactError);
  });
});
