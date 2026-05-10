import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convertToWebP } from "@/lib/server/image-engine";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-webp-engine-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function createJpeg(fileName: string, width = 1800, height = 900): Promise<string> {
  const inputPath = path.join(tempDir, fileName);
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#2f7d73"
    }
  })
    .jpeg()
    .toFile(inputPath);
  return inputPath;
}

describe("convertToWebP", () => {
  it("converts and resizes without enlargement", async () => {
    const inputPath = await createJpeg("large.jpg", 1800, 900);
    const outputPath = path.join(tempDir, "large.webp");

    const result = await convertToWebP(inputPath, outputPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });

    const metadata = await sharp(outputPath).metadata();
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(640);
  });

  it("does not enlarge images smaller than the target width", async () => {
    const inputPath = await createJpeg("small.jpg", 640, 320);
    const outputPath = path.join(tempDir, "small.webp");

    await convertToWebP(inputPath, outputPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });

    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(320);
  });

  it("strips metadata by default and preserves it when requested", async () => {
    const inputPath = path.join(tempDir, "meta.jpg");
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: "#d8f3dc"
      }
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Blog WebP Optimizer" } })
      .toFile(inputPath);

    const strippedPath = path.join(tempDir, "stripped.webp");
    const keptPath = path.join(tempDir, "kept.webp");

    await convertToWebP(inputPath, strippedPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });
    await convertToWebP(inputPath, keptPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: false,
      lossless: false,
      concurrency: 1
    });

    const strippedMetadata = await sharp(strippedPath).metadata();
    const keptMetadata = await sharp(keptPath).metadata();

    expect(strippedMetadata.exif).toBeUndefined();
    expect(keptMetadata.exif?.length).toBeGreaterThan(0);
  });
});
