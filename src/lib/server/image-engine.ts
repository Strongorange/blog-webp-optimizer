import fs from "node:fs/promises";
import sharp from "sharp";
import type { ConversionOptions } from "./types";

export interface ConversionResult {
  outputBytes: number;
  reductionPercent: number;
}

export async function convertToWebP(
  inputPath: string,
  outputPath: string,
  options: ConversionOptions
): Promise<ConversionResult> {
  const inputStat = await fs.stat(inputPath);
  let pipeline = sharp(inputPath, { failOn: "none" });

  if (options.autoOrient) {
    pipeline = pipeline.rotate();
  }

  pipeline = pipeline.resize({
    width: options.width,
    fit: "inside",
    withoutEnlargement: true
  });

  if (!options.stripMetadata) {
    pipeline = pipeline.keepMetadata();
  }

  await pipeline
    .webp({
      quality: options.quality,
      lossless: options.lossless
    })
    .toFile(outputPath);

  const outputStat = await fs.stat(outputPath);
  const reductionPercent =
    inputStat.size > 0
      ? Math.round((1 - outputStat.size / inputStat.size) * 1000) / 10
      : 0;

  return {
    outputBytes: outputStat.size,
    reductionPercent
  };
}
