import fs from "node:fs/promises";
import { cleanupExpiredJobs, runStartupCleanupOnce } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";
import { isTrustedLocalRequest } from "@/lib/server/request-guard";
import type { JobFile } from "@/lib/server/types";
import { uploadWordPressMediaFiles, type WordPressUploadResult } from "@/lib/server/wordpress-client";
import { getWordPressConfig } from "@/lib/server/wordpress-config";

export const runtime = "nodejs";

interface UploadRequestBody {
  jobId?: unknown;
  fileIds?: unknown;
}

interface ParsedFileIds {
  fileIds: string[];
  hasInvalidEntry: boolean;
}

type SelectedFilesResult =
  | {
      files: JobFile[];
    }
  | {
      error: string;
    };

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readRequestBody(request: Request): Promise<UploadRequestBody | null> {
  try {
    return (await request.json()) as UploadRequestBody;
  } catch {
    return null;
  }
}

function parseFileIds(fileIds: unknown[]): ParsedFileIds {
  const parsed: string[] = [];

  for (const fileId of fileIds) {
    if (typeof fileId !== "string") {
      return { fileIds: [], hasInvalidEntry: true };
    }

    const trimmedFileId = fileId.trim();
    if (!trimmedFileId) {
      return { fileIds: [], hasInvalidEntry: true };
    }

    parsed.push(trimmedFileId);
  }

  return { fileIds: parsed, hasInvalidEntry: false };
}

function hasDuplicateFileIds(fileIds: string[]): boolean {
  return new Set(fileIds).size !== fileIds.length;
}

function selectUploadableFiles(files: JobFile[], fileIds: string[]): SelectedFilesResult {
  const selectedFiles: JobFile[] = [];

  for (const fileId of fileIds) {
    const file = files.find((candidate) => candidate.id === fileId);
    if (!file) {
      return { error: "Selected file was not found." };
    }

    if (file.status !== "done") {
      return { error: "No converted files are ready to upload." };
    }

    selectedFiles.push(file);
  }

  return { files: selectedFiles };
}

export async function POST(request: Request) {
  if (!isTrustedLocalRequest(request)) {
    return jsonError("Cross-origin uploads are not allowed.", 403);
  }

  const config = getWordPressConfig();
  if (!config) {
    return jsonError("WordPress upload is not configured.", 503);
  }

  await runStartupCleanupOnce();
  await cleanupExpiredJobs();

  const body = await readRequestBody(request);
  if (!body || typeof body.jobId !== "string" || !Array.isArray(body.fileIds)) {
    return jsonError("Invalid WordPress upload request.", 400);
  }

  const { fileIds, hasInvalidEntry } = parseFileIds(body.fileIds);
  if (hasInvalidEntry) {
    return jsonError("Invalid WordPress upload request.", 400);
  }

  if (fileIds.length === 0) {
    return jsonError("Select at least one converted file to upload.", 400);
  }

  if (hasDuplicateFileIds(fileIds)) {
    return jsonError("Select each converted file only once.", 400);
  }

  const job = jobStore.get(body.jobId);
  if (!job) {
    return jsonError("Job not found.", 404);
  }

  const selectedFiles = selectUploadableFiles(job.files, fileIds);
  if ("error" in selectedFiles) {
    return jsonError(selectedFiles.error, 400);
  }

  const failedResults: WordPressUploadResult[] = [];
  const uploadFiles = [];

  for (const file of selectedFiles.files) {
    try {
      uploadFiles.push({
        fileId: file.id,
        filename: file.safeOutputName,
        buffer: await fs.readFile(file.outputPath)
      });
    } catch (error) {
      if (isMissingFileError(error)) {
        failedResults.push({
          fileId: file.id,
          status: "failed",
          error: "Converted file not found."
        });
      } else {
        throw error;
      }
    }
  }

  const uploadedResults =
    uploadFiles.length > 0 ? await uploadWordPressMediaFiles(config, uploadFiles) : [];

  return Response.json({
    results: [...uploadedResults, ...failedResults]
  });
}
