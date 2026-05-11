import fs from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
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

function normalizeArchiveError(error: unknown): Error {
  return isMissingFileError(error)
    ? new MissingOutputArtifactError()
    : error instanceof Error
      ? error
      : new Error("ZIP creation failed.");
}

async function successfulFilesWithArtifacts(files: JobFile[]): Promise<JobFile[]> {
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

  return successfulFiles;
}

function createArchive(files: JobFile[]) {
  const archive = archiver("zip", { zlib: { level: 9 } });

  for (const file of files) {
    archive.file(file.outputPath, { name: file.safeOutputName });
  }

  return archive;
}

export async function createZipStream(files: JobFile[]): Promise<ReadableStream<Uint8Array>> {
  const successfulFiles = await successfulFilesWithArtifacts(files);
  const archive = createArchive(successfulFiles);
  const output = new PassThrough();
  const failStream = (error: unknown) => {
    output.destroy(normalizeArchiveError(error));
  };

  archive.on("warning", failStream);
  archive.on("error", failStream);
  archive.pipe(output);
  archive.finalize().catch(failStream);

  return Readable.toWeb(output) as ReadableStream<Uint8Array>;
}

export async function createZipBuffer(files: JobFile[]): Promise<Buffer> {
  const successfulFiles = await successfulFilesWithArtifacts(files);

  return new Promise<Buffer>((resolve, reject) => {
    const archive = createArchive(successfulFiles);
    const chunks: Buffer[] = [];
    const rejectArchiveError = (error: unknown) => {
      reject(normalizeArchiveError(error));
    };

    archive.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    archive.on("warning", rejectArchiveError);
    archive.on("error", rejectArchiveError);
    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    archive.finalize().catch(rejectArchiveError);
  });
}
