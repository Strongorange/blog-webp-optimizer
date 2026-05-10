import os from "node:os";
import path from "node:path";
import type { ConversionOptions } from "./types";

export const ACCEPTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export const MAX_FILES_PER_JOB = 50;
export const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;
export const JOB_RETENTION_MS = 60 * 60 * 1000;
export const TMP_JOBS_ROOT = path.join(process.cwd(), "tmp", "jobs");

export const DEFAULT_CONCURRENCY = Math.min(Math.max(os.cpus().length - 1, 1), 4);

export const DEFAULT_OPTIONS: ConversionOptions = {
  width: 1280,
  quality: 82,
  autoOrient: true,
  stripMetadata: true,
  lossless: false,
  concurrency: DEFAULT_CONCURRENCY
};
