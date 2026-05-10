import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  MAX_BYTES_PER_FILE,
  MAX_FILES_PER_JOB
} from "@/lib/server/constants";
import { runStartupCleanupOnce } from "@/lib/server/cleanup";
import { uniqueOutputNames } from "@/lib/server/filenames";
import { processJobSafely } from "@/lib/server/job-runner";
import { jobStore } from "@/lib/server/job-store";
import { parseConversionOptions } from "@/lib/server/options";
import { ensureJobDirs, removeJobDir, writeUploadedFile } from "@/lib/server/storage";
import type { JobFile } from "@/lib/server/types";

export const runtime = "nodejs";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

export async function POST(request: Request) {
  await runStartupCleanupOnce();

  const formData = await request.formData();
  const uploads = formData.getAll("files").filter(isFile);

  if (uploads.length === 0) {
    return jsonError("Select at least one image file.", 400);
  }

  if (uploads.length > MAX_FILES_PER_JOB) {
    return jsonError(`Upload ${MAX_FILES_PER_JOB} files or fewer.`, 400);
  }

  for (const file of uploads) {
    const extension = path.extname(file.name).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension) || !ACCEPTED_MIME_TYPES.has(file.type)) {
      return jsonError(`Unsupported file type: ${file.name}`, 400);
    }

    if (file.size > MAX_BYTES_PER_FILE) {
      return jsonError(`File is larger than 25MB: ${file.name}`, 400);
    }
  }

  const options = parseConversionOptions(formData);
  const outputNames = uniqueOutputNames(uploads.map((file) => file.name));
  const tempJobId = randomUUID();

  const jobFiles: JobFile[] = [];

  try {
    const paths = await ensureJobDirs(tempJobId);

    for (const [index, file] of uploads.entries()) {
      const fileId = randomUUID();
      const inputExtension = path.extname(file.name).toLowerCase();
      const inputPath = path.join(paths.inputDir, `${fileId}${inputExtension}`);
      const outputPath = path.join(paths.outputDir, outputNames[index]);
      const inputBytes = await writeUploadedFile(file, inputPath);

      jobFiles.push({
        id: fileId,
        originalName: file.name,
        safeOutputName: outputNames[index],
        mimeType: file.type,
        inputBytes,
        inputPath,
        outputPath,
        status: "queued"
      });
    }
  } catch {
    await removeJobDir(tempJobId);
    return jsonError("Upload staging failed.", 500);
  }

  const job = jobStore.create(tempJobId, jobFiles, options);

  void processJobSafely(job.id);

  return Response.json(jobStore.toPublic(job), { status: 202 });
}
