import { DEFAULT_OPTIONS } from "./constants";
import type { ConversionOptions } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseNumber(value: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp(Math.round(parsed), min, max);
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

export function parseConversionOptions(formData: FormData): ConversionOptions {
  return {
    width: parseNumber(formData.get("width"), DEFAULT_OPTIONS.width, 1, 8000),
    quality: parseNumber(formData.get("quality"), DEFAULT_OPTIONS.quality, 1, 100),
    autoOrient: parseBoolean(formData.get("autoOrient"), DEFAULT_OPTIONS.autoOrient),
    stripMetadata: parseBoolean(formData.get("stripMetadata"), DEFAULT_OPTIONS.stripMetadata),
    lossless: parseBoolean(formData.get("lossless"), DEFAULT_OPTIONS.lossless),
    concurrency: parseNumber(
      formData.get("concurrency"),
      DEFAULT_OPTIONS.concurrency,
      1,
      8
    )
  };
}
