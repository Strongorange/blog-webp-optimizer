import fs from "node:fs/promises";
import archiver from "archiver";
import type { JobFile } from "./types";

export class MissingOutputArtifactError extends Error {
  constructor() {
    super("Converted file not found.");
    this.name = "MissingOutputArtifactError";
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function createZipBuffer(files: JobFile[]): Promise<Buffer> {
  const successfulFiles = files.filter((file) => file.status === "done");

  for (const file of successfulFiles) {
    try {
      await fs.access(file.outputPath);
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new MissingOutputArtifactError();
      }

      throw error;
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const rejectArchiveError = (error: unknown) => {
      reject(isMissingFileError(error) ? new MissingOutputArtifactError() : error);
    };

    archive.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    archive.on("warning", rejectArchiveError);
    archive.on("error", rejectArchiveError);
    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    for (const file of successfulFiles) {
      archive.file(file.outputPath, { name: file.safeOutputName });
    }

    archive.finalize().catch(rejectArchiveError);
  });
}
