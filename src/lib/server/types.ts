export type FileStatus = "queued" | "processing" | "done" | "failed";
export type JobStatus = "queued" | "processing" | "done" | "failed" | "partial";

export interface ConversionOptions {
  width: number;
  quality: number;
  autoOrient: boolean;
  stripMetadata: boolean;
  lossless: boolean;
  concurrency: number;
}

export interface JobFile {
  id: string;
  originalName: string;
  safeOutputName: string;
  mimeType: string;
  inputBytes: number;
  outputBytes?: number;
  reductionPercent?: number;
  inputPath: string;
  outputPath: string;
  status: FileStatus;
  error?: string;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  options: ConversionOptions;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  files: JobFile[];
}

export interface PublicJobFile {
  id: string;
  originalName: string;
  safeOutputName: string;
  mimeType: string;
  inputBytes: number;
  outputBytes?: number;
  reductionPercent?: number;
  status: FileStatus;
  error?: string;
}

export interface PublicJob {
  id: string;
  status: JobStatus;
  options: ConversionOptions;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  files: PublicJobFile[];
}
