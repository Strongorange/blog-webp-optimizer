import { cleanupExpiredJobs, runStartupCleanupOnce } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  await runStartupCleanupOnce();
  await cleanupExpiredJobs();

  const { jobId } = await params;
  const job = jobStore.get(jobId);

  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  return Response.json(jobStore.toPublic(job));
}
