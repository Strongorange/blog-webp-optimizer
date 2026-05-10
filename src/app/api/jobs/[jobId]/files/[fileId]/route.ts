import fs from "node:fs/promises";
import { cleanupExpiredJobs, runStartupCleanupOnce } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";

export const runtime = "nodejs";

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; fileId: string }> }
) {
  await runStartupCleanupOnce();
  await cleanupExpiredJobs();

  const { jobId, fileId } = await params;
  const job = jobStore.get(jobId);

  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  const file = job.files.find((candidate) => candidate.id === fileId);
  if (!file || file.status !== "done") {
    return Response.json({ error: "Converted file not found." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(file.outputPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return Response.json({ error: "Converted file not found." }, { status: 404 });
    }

    throw error;
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.safeOutputName)}"`
    }
  });
}
