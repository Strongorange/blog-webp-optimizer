import { JOB_RETENTION_MS } from "./constants";
import type { ConversionOptions, JobFile, JobRecord, PublicJob } from "./types";

export interface JobStore {
  create(id: string, files: JobFile[], options: ConversionOptions): JobRecord;
  get(jobId: string): JobRecord | undefined;
  list(): JobRecord[];
  updateFile(jobId: string, fileId: string, patch: Partial<JobFile>): void;
  updateJob(jobId: string, patch: Partial<JobRecord>): void;
  refreshJobStatus(jobId: string): void;
  remove(jobId: string): void;
  toPublic(job: JobRecord): PublicJob;
}

export function createJobStore(): JobStore {
  const jobs = new Map<string, JobRecord>();

  function touch(job: JobRecord): void {
    job.updatedAt = Date.now();
  }

  return {
    create(id, files, options) {
      const now = Date.now();
      const job: JobRecord = {
        id,
        status: "queued",
        options,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + JOB_RETENTION_MS,
        files
      };

      jobs.set(job.id, job);
      return job;
    },

    get(jobId) {
      return jobs.get(jobId);
    },

    list() {
      return Array.from(jobs.values());
    },

    updateFile(jobId, fileId, patch) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }

      const file = job.files.find((candidate) => candidate.id === fileId);
      if (!file) {
        return;
      }

      Object.assign(file, patch);
      touch(job);
    },

    updateJob(jobId, patch) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }

      Object.assign(job, patch);
      touch(job);
    },

    refreshJobStatus(jobId) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }

      const statuses = job.files.map((file) => file.status);
      const doneCount = statuses.filter((status) => status === "done").length;
      const failedCount = statuses.filter((status) => status === "failed").length;
      const activeCount = statuses.filter(
        (status) => status === "queued" || status === "processing"
      ).length;

      if (activeCount > 0) {
        job.status = "processing";
      } else if (doneCount === job.files.length) {
        job.status = "done";
      } else if (failedCount === job.files.length) {
        job.status = "failed";
      } else {
        job.status = "partial";
      }

      touch(job);
    },

    remove(jobId) {
      jobs.delete(jobId);
    },

    toPublic(job) {
      return {
        id: job.id,
        status: job.status,
        options: job.options,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        expiresAt: job.expiresAt,
        files: job.files.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          safeOutputName: file.safeOutputName,
          mimeType: file.mimeType,
          inputBytes: file.inputBytes,
          outputBytes: file.outputBytes,
          reductionPercent: file.reductionPercent,
          status: file.status,
          error: file.error
        }))
      };
    }
  };
}

const globalJobs = globalThis as typeof globalThis & {
  __blogWebpOptimizerJobStore?: JobStore;
};

export const jobStore = globalJobs.__blogWebpOptimizerJobStore ?? createJobStore();
globalJobs.__blogWebpOptimizerJobStore = jobStore;
