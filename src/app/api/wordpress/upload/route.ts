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

function selectedDoneFiles(files: JobFile[], fileIds: string[]): JobFile[] {
  return fileIds
    .map((fileId) => files.find((file) => file.id === fileId))
    .filter((file): file is JobFile => Boolean(file))
    .filter((file) => file.status === "done");
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

  const fileIds = body.fileIds.filter((fileId): fileId is string => typeof fileId === "string");
  if (fileIds.length === 0) {
    return jsonError("Select at least one converted file to upload.", 400);
  }

  const job = jobStore.get(body.jobId);
  if (!job) {
    return jsonError("Job not found.", 404);
  }

  const files = selectedDoneFiles(job.files, fileIds);
  if (files.length === 0) {
    return jsonError("No converted files are ready to upload.", 400);
  }

  const failedResults: WordPressUploadResult[] = [];
  const uploadFiles = [];

  for (const file of files) {
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
