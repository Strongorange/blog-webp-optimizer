import { cleanupExpiredJobs, runStartupCleanupOnce } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";
import { MissingOutputArtifactError, createZipBuffer } from "@/lib/server/zip";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  await runStartupCleanupOnce();
  await cleanupExpiredJobs();

  const { jobId } = await params;
  const job = jobStore.get(jobId);

  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  const successfulFiles = job.files.filter((file) => file.status === "done");
  if (successfulFiles.length === 0) {
    return Response.json({ error: "No converted files are ready." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await createZipBuffer(successfulFiles);
  } catch (error) {
    if (error instanceof MissingOutputArtifactError) {
      return Response.json({ error: "Converted file not found." }, { status: 404 });
    }

    throw error;
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="blog-webp-${job.id}.zip"`
    }
  });
}
