import fs from "node:fs/promises";
import path from "node:path";
import { TMP_JOBS_ROOT } from "./constants";

export interface JobPaths {
  jobDir: string;
  inputDir: string;
  outputDir: string;
}

function resolveJobDir(jobId: string): string {
  const root = path.resolve(TMP_JOBS_ROOT);
  const jobDir = path.resolve(root, jobId);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (jobDir === root || !jobDir.startsWith(rootPrefix)) {
    throw new Error(`Invalid job id: ${jobId}`);
  }

  return jobDir;
}

export function getJobPaths(jobId: string): JobPaths {
  const jobDir = resolveJobDir(jobId);

  return {
    jobDir,
    inputDir: path.join(jobDir, "input"),
    outputDir: path.join(jobDir, "output")
  };
}

export async function ensureJobDirs(jobId: string): Promise<JobPaths> {
  const paths = getJobPaths(jobId);
  await fs.mkdir(paths.inputDir, { recursive: true });
  await fs.mkdir(paths.outputDir, { recursive: true });
  return paths;
}

export async function writeUploadedFile(file: File, destinationPath: string): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(destinationPath, buffer);
  return buffer.byteLength;
}

export async function removeJobDir(jobId: string): Promise<void> {
  await fs.rm(getJobPaths(jobId).jobDir, { recursive: true, force: true });
}
