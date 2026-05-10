import pLimit from "p-limit";
import { convertToWebP } from "./image-engine";
import { jobStore } from "./job-store";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Image conversion failed";
}

function failActiveFiles(jobId: string, error: unknown): void {
  const job = jobStore.get(jobId);
  if (!job) {
    return;
  }

  const message = errorMessage(error);
  for (const file of job.files) {
    if (file.status === "queued" || file.status === "processing") {
      jobStore.updateFile(jobId, file.id, {
        status: "failed",
        error: message
      });
    }
  }

  jobStore.refreshJobStatus(jobId);
}

export async function processJob(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) {
    return;
  }

  jobStore.updateJob(jobId, { status: "processing" });
  const limit = pLimit(job.options.concurrency);

  await Promise.all(
    job.files.map((file) =>
      limit(async () => {
        jobStore.updateFile(jobId, file.id, { status: "processing" });

        try {
          const result = await convertToWebP(file.inputPath, file.outputPath, job.options);
          jobStore.updateFile(jobId, file.id, {
            status: "done",
            outputBytes: result.outputBytes,
            reductionPercent: result.reductionPercent
          });
        } catch (error) {
          jobStore.updateFile(jobId, file.id, {
            status: "failed",
            error: errorMessage(error)
          });
        } finally {
          jobStore.refreshJobStatus(jobId);
        }
      })
    )
  );

  jobStore.refreshJobStatus(jobId);
}

export async function processJobSafely(jobId: string): Promise<void> {
  try {
    await processJob(jobId);
  } catch (error) {
    console.error(`Failed to process image job ${jobId}`, error);
    failActiveFiles(jobId, error);
  }
}
