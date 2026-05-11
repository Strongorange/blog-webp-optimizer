"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  FileImage,
  Loader2,
  RefreshCcw,
  Settings2,
  UploadCloud,
  X
} from "lucide-react";
import { formatBytes, formatReduction } from "@/lib/client/format";

const ACCEPTED_INPUT =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MAX_FILES = 50;
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;
const POLL_MS = 800;

type FileStatus = "queued" | "processing" | "done" | "failed";
type JobStatus = "queued" | "processing" | "done" | "failed" | "partial";
type NumericValue = "" | number;
type WordPressUploadStatus = "ready" | "uploading" | "uploaded" | "failed";

interface PublicJobFile {
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

interface PublicJob {
  id: string;
  status: JobStatus;
  files: PublicJobFile[];
}

interface WordPressStatus {
  configured: boolean;
  siteUrl?: string;
}

interface WordPressUploadResult {
  fileId: string;
  status: "uploaded" | "failed";
  attachmentId?: number;
  url?: string;
  error?: string;
}

interface WordPressUploadState {
  status: WordPressUploadStatus;
  attachmentId?: number;
  url?: string;
  error?: string;
}

interface OptionsState {
  width: NumericValue;
  quality: NumericValue;
  autoOrient: boolean;
  stripMetadata: boolean;
  lossless: boolean;
  concurrency: NumericValue;
}

const DEFAULT_OPTIONS: OptionsState = {
  width: 1280,
  quality: 82,
  autoOrient: true,
  stripMetadata: true,
  lossless: false,
  concurrency: ""
};

function hasAcceptedExtension(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function isActiveJob(status: JobStatus): boolean {
  return status === "queued" || status === "processing";
}

function jobStatusLabel(status: JobStatus | FileStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

function parseNumberInput(value: string): NumericValue {
  if (value.trim() === "") {
    return "";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function validateIntegerOption(
  label: string,
  value: NumericValue,
  min: number,
  max: number
): number | string {
  if (value === "" || !Number.isFinite(value)) {
    return `${label} must be a number from ${min} to ${max}.`;
  }

  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label} must be a whole number from ${min} to ${max}.`;
  }

  return value;
}

export function OptimizerApp() {
  const [files, setFiles] = useState<File[]>([]);
  const [rejectedNames, setRejectedNames] = useState<string[]>([]);
  const [overLimitNames, setOverLimitNames] = useState<string[]>([]);
  const [options, setOptions] = useState<OptionsState>(DEFAULT_OPTIONS);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wordpressStatus, setWordPressStatus] = useState<WordPressStatus | null>(null);
  const [wordpressUploads, setWordPressUploads] = useState<
    Record<string, WordPressUploadState>
  >({});
  const [wordpressError, setWordPressError] = useState<string | null>(null);
  const [isUploadingToWordPress, setIsUploadingToWordPress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestGenerationRef = useRef(0);
  const wordpressGenerationRef = useRef(0);
  const submitAbortRef = useRef<AbortController | null>(null);

  const doneFiles = useMemo(
    () => job?.files.filter((file) => file.status === "done") ?? [],
    [job]
  );
  const canSubmit = files.length > 0 && !isSubmitting && !job;

  useEffect(() => {
    if (!job || !isActiveJob(job.status)) {
      return;
    }

    const generation = requestGenerationRef.current;
    let isPolling = false;
    let pollAbortController: AbortController | null = null;

    const pollJob = async () => {
      if (isPolling) {
        return;
      }

      isPolling = true;
      pollAbortController = new AbortController();

      try {
        const response = await fetch(`/api/jobs/${job.id}`, {
          cache: "no-store",
          signal: pollAbortController.signal
        });

        if (requestGenerationRef.current !== generation) {
          return;
        }

        if (!response.ok) {
          const message = await readError(response);
          if (requestGenerationRef.current !== generation) {
            return;
          }

          if (response.status === 404) {
            setError(message);
            setPollError(null);
            setJob((currentJob) =>
              currentJob?.id === job.id ? { ...currentJob, status: "failed" } : currentJob
            );
            return;
          }

          setPollError(message);
          return;
        }

        const nextJob = (await response.json()) as PublicJob;
        if (requestGenerationRef.current !== generation) {
          return;
        }

        setJob(nextJob);
        setPollError(null);
      } catch (pollError) {
        if (
          requestGenerationRef.current === generation &&
          !(pollError instanceof DOMException && pollError.name === "AbortError")
        ) {
          setPollError(
            pollError instanceof Error ? pollError.message : "Job polling failed."
          );
        }
      } finally {
        isPolling = false;
      }
    };

    const intervalId = window.setInterval(pollJob, POLL_MS);

    return () => {
      window.clearInterval(intervalId);
      pollAbortController?.abort();
    };
  }, [job]);

  useEffect(() => {
    let cancelled = false;

    async function loadWordPressStatus() {
      try {
        const response = await fetch("/api/wordpress/status", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`WordPress status failed with ${response.status}.`);
        }

        const nextStatus = (await response.json()) as WordPressStatus;
        if (!cancelled) {
          setWordPressStatus(nextStatus);
        }
      } catch {
        if (!cancelled) {
          setWordPressStatus({ configured: false });
        }
      }
    }

    void loadWordPressStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  function invalidatePendingRequests() {
    requestGenerationRef.current += 1;
    wordpressGenerationRef.current += 1;
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;
  }

  function addFiles(incomingFiles: File[]) {
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of incomingFiles) {
      const fileName = file.name || "Untitled file";
      if (!hasAcceptedExtension(file)) {
        rejected.push(fileName);
      } else if (file.size > MAX_BYTES_PER_FILE) {
        rejected.push(`${fileName} (larger than 25MB)`);
      } else {
        accepted.push(file);
      }
    }

    const availableSlots = Math.max(MAX_FILES - files.length, 0);
    const acceptedWithinLimit = accepted.slice(0, availableSlots);
    const acceptedOverLimit = accepted.slice(availableSlots);

    invalidatePendingRequests();
    setFiles((currentFiles) => [...currentFiles, ...acceptedWithinLimit]);
    setOverLimitNames(acceptedOverLimit.map((file) => file.name || "Untitled file"));
    setRejectedNames(rejected);
    setError(null);
    setPollError(null);
    setJob(null);
    setWordPressUploads({});
    setWordPressError(null);
    setIsUploadingToWordPress(false);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    addFiles(selectedFiles);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function resetAll() {
    invalidatePendingRequests();
    setFiles([]);
    setRejectedNames([]);
    setOverLimitNames([]);
    setOptions(DEFAULT_OPTIONS);
    setJob(null);
    setError(null);
    setPollError(null);
    setIsDragging(false);
    setIsSubmitting(false);
    setWordPressUploads({});
    setWordPressError(null);
    setIsUploadingToWordPress(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index));
  }

  async function submitJob() {
    if (files.length === 0) {
      setError("Select at least one supported image.");
      return;
    }

    const width = validateIntegerOption("Width", options.width, 1, 8000);
    if (typeof width === "string") {
      setError(width);
      return;
    }

    const quality = validateIntegerOption("Quality", options.quality, 1, 100);
    if (typeof quality === "string") {
      setError(quality);
      return;
    }

    let concurrency: number | undefined;
    if (options.concurrency !== "") {
      const concurrencyResult = validateIntegerOption(
        "Concurrency",
        options.concurrency,
        1,
        8
      );
      if (typeof concurrencyResult === "string") {
        setError(concurrencyResult);
        return;
      }

      concurrency = concurrencyResult;
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    formData.append("width", String(width));
    formData.append("quality", String(quality));
    formData.append("autoOrient", String(options.autoOrient));
    formData.append("stripMetadata", String(options.stripMetadata));
    formData.append("lossless", String(options.lossless));
    if (concurrency !== undefined) {
      formData.append("concurrency", String(concurrency));
    }

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    submitAbortRef.current?.abort();
    const submitAbortController = new AbortController();
    submitAbortRef.current = submitAbortController;
    setIsSubmitting(true);
    setError(null);
    setPollError(null);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: formData,
        signal: submitAbortController.signal
      });

      if (requestGenerationRef.current !== generation) {
        return;
      }

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const nextJob = (await response.json()) as PublicJob;
      if (requestGenerationRef.current !== generation) {
        return;
      }

      setJob(nextJob);
    } catch (submitError) {
      if (
        requestGenerationRef.current === generation &&
        !(submitError instanceof DOMException && submitError.name === "AbortError")
      ) {
        setError(
          submitError instanceof Error ? submitError.message : "Job submission failed."
        );
      }
    } finally {
      if (requestGenerationRef.current === generation) {
        setIsSubmitting(false);
        submitAbortRef.current = null;
      }
    }
  }

  function uploadableFileIds(): string[] {
    return doneFiles.map((file) => file.id);
  }

  function uploadedUrls(): string[] {
    return Object.values(wordpressUploads)
      .map((upload) => upload.url)
      .filter((url): url is string => Boolean(url));
  }

  async function uploadToWordPress(fileIds: string[]) {
    if (!job || fileIds.length === 0 || isUploadingToWordPress) {
      return;
    }

    const generation = wordpressGenerationRef.current + 1;
    wordpressGenerationRef.current = generation;
    setIsUploadingToWordPress(true);
    setWordPressError(null);
    setWordPressUploads((current) => {
      const next = { ...current };
      for (const fileId of fileIds) {
        next[fileId] = { status: "uploading" };
      }
      return next;
    });

    try {
      const response = await fetch("/api/wordpress/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobId: job.id,
          fileIds
        })
      });
      const payload = await response.json();

      if (wordpressGenerationRef.current !== generation) {
        return;
      }

      if (!response.ok) {
        setWordPressError(payload.error ?? "WordPress upload failed.");
        setWordPressUploads((current) => {
          const next = { ...current };
          for (const fileId of fileIds) {
            next[fileId] = {
              status: "failed",
              error: payload.error ?? "WordPress upload failed."
            };
          }
          return next;
        });
        return;
      }

      const results = Array.isArray(payload.results)
        ? (payload.results as WordPressUploadResult[])
        : [];
      setWordPressUploads((current) => {
        const next = { ...current };
        const remainingFileIds = new Set(fileIds);

        for (const result of results) {
          remainingFileIds.delete(result.fileId);
          if (
            result.status === "uploaded" &&
            typeof result.attachmentId === "number" &&
            result.url
          ) {
            next[result.fileId] = {
              status: "uploaded",
              attachmentId: result.attachmentId,
              url: result.url
            };
          } else {
            next[result.fileId] = {
              status: "failed",
              error: result.error ?? "WordPress upload failed."
            };
          }
        }

        for (const fileId of remainingFileIds) {
          next[fileId] = {
            status: "failed",
            error: "WordPress upload returned no result."
          };
        }

        return next;
      });
    } catch (uploadError) {
      if (wordpressGenerationRef.current === generation) {
        const message =
          uploadError instanceof Error ? uploadError.message : "WordPress upload failed.";
        setWordPressError(message);
        setWordPressUploads((current) => {
          const next = { ...current };
          for (const fileId of fileIds) {
            next[fileId] = { status: "failed", error: message };
          }
          return next;
        });
      }
    } finally {
      if (wordpressGenerationRef.current === generation) {
        setIsUploadingToWordPress(false);
      }
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <main className="app-shell">
      <div className="app-header">
        <div>
          <p className="eyebrow">Local image utility</p>
          <h1>Blog WebP Optimizer</h1>
        </div>
        <button className="secondary-button" type="button" onClick={resetAll}>
          <RefreshCcw aria-hidden="true" size={18} />
          Reset
        </button>
      </div>

      <div className="tool-layout">
        <section className="panel main-panel" aria-label="Image upload and results">
          <input
            id="optimizer-file-input"
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept={ACCEPTED_INPUT}
            multiple
            tabIndex={-1}
            onChange={handleInputChange}
          />
          <label
            htmlFor="optimizer-file-input"
            className={`drop-zone${isDragging ? " is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <UploadCloud aria-hidden="true" size={34} />
            <div>
              <h2>Drop images here or choose files</h2>
              <p>
                JPG, PNG, and WebP files. Up to {MAX_FILES} files per job, 25MB
                per file.
              </p>
            </div>
          </label>

          {rejectedNames.length > 0 ? (
            <div className="notice warning" role="alert">
              <AlertCircle aria-hidden="true" size={18} />
              <div>
                <strong>Unsupported files skipped</strong>
                <p>{rejectedNames.join(", ")}</p>
              </div>
            </div>
          ) : null}

          {overLimitNames.length > 0 ? (
            <div className="notice warning" role="alert">
              <AlertCircle aria-hidden="true" size={18} />
              <div>
                <strong>File limit reached</strong>
                <p>Skipped over-limit files: {overLimitNames.join(", ")}</p>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="notice error" role="alert">
              <AlertCircle aria-hidden="true" size={18} />
              <p>{error}</p>
            </div>
          ) : null}

          {pollError ? (
            <div className="notice warning" role="status">
              <AlertCircle aria-hidden="true" size={18} />
              <div>
                <strong>Polling retrying</strong>
                <p>{pollError}</p>
              </div>
            </div>
          ) : null}

          <div className="section-header">
            <div>
              <h2>Selected files</h2>
              <p>{files.length} ready for optimization</p>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!canSubmit}
              onClick={submitJob}
            >
              {isSubmitting ? (
                <Loader2 className="spin" aria-hidden="true" size={18} />
              ) : (
                <Archive aria-hidden="true" size={18} />
              )}
              Optimize
            </button>
          </div>

          {files.length > 0 ? (
            <ul className="file-list" aria-label="Selected files">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <FileImage aria-hidden="true" size={18} />
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatBytes(file.size)}</span>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(index)}
                    disabled={isSubmitting || Boolean(job)}
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">No files selected.</div>
          )}

          {job ? (
            <section className="results" aria-label="Optimization results">
              <div className="section-header">
                <div>
                  <h2>Job results</h2>
                  <p>
                    Status: <strong>{jobStatusLabel(job.status)}</strong>
                  </p>
                </div>
                {doneFiles.length > 0 ? (
                  <div className="result-actions">
                    <a className="secondary-button" href={`/api/jobs/${job.id}/download`}>
                      <Download aria-hidden="true" size={18} />
                      Download ZIP
                    </a>
                    {wordpressStatus?.configured ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isUploadingToWordPress}
                        onClick={() => uploadToWordPress(uploadableFileIds())}
                      >
                        {isUploadingToWordPress ? (
                          <Loader2 className="spin" aria-hidden="true" size={18} />
                        ) : (
                          <UploadCloud aria-hidden="true" size={18} />
                        )}
                        Upload all
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {doneFiles.length > 0 && wordpressStatus?.configured === false ? (
                <div className="notice warning" role="status">
                  <AlertCircle aria-hidden="true" size={18} />
                  <p>WordPress upload is not configured. Add `.env.local` to enable it.</p>
                </div>
              ) : null}

              {wordpressError ? (
                <div className="notice error" role="alert">
                  <AlertCircle aria-hidden="true" size={18} />
                  <p>{wordpressError}</p>
                </div>
              ) : null}

              {uploadedUrls().length > 0 ? (
                <button
                  className="ghost-button copy-urls-button"
                  type="button"
                  onClick={() => copyText(uploadedUrls().join("\n"))}
                >
                  Copy all URLs
                </button>
              ) : null}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Reduction</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.files.map((file) => (
                      <tr key={file.id}>
                        <td>
                          <span className="table-name">{file.originalName}</span>
                          {file.error ? <span className="file-error">{file.error}</span> : null}
                        </td>
                        <td>
                          <span className={`status-pill status-${file.status}`}>
                            {file.status === "done" ? (
                              <CheckCircle2 aria-hidden="true" size={14} />
                            ) : file.status === "processing" ? (
                              <Loader2 className="spin" aria-hidden="true" size={14} />
                            ) : null}
                            {jobStatusLabel(file.status)}
                          </span>
                        </td>
                        <td>{formatBytes(file.inputBytes)}</td>
                        <td>{formatBytes(file.outputBytes)}</td>
                        <td>{formatReduction(file.reductionPercent)}</td>
                        <td>
                          {file.status === "done" ? (
                            <>
                              <a
                                className="text-link"
                                href={`/api/jobs/${job.id}/files/${file.id}`}
                              >
                                Download
                              </a>
                              {wordpressStatus?.configured ? (
                                <div className="wordpress-actions">
                                  <button
                                    className="text-button"
                                    type="button"
                                    disabled={
                                      wordpressUploads[file.id]?.status === "uploading"
                                    }
                                    onClick={() => uploadToWordPress([file.id])}
                                  >
                                    {wordpressUploads[file.id]?.status === "uploading"
                                      ? "Uploading"
                                      : "Upload"}
                                  </button>
                                  {wordpressUploads[file.id]?.status === "uploaded" &&
                                  wordpressUploads[file.id]?.url ? (
                                    <>
                                      <a
                                        className="text-link"
                                        href={wordpressUploads[file.id]?.url}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        WordPress
                                      </a>
                                      <button
                                        className="text-button"
                                        type="button"
                                        onClick={() =>
                                          copyText(wordpressUploads[file.id]?.url ?? "")
                                        }
                                      >
                                        Copy URL
                                      </button>
                                    </>
                                  ) : null}
                                  {wordpressUploads[file.id]?.status === "failed" ? (
                                    <span className="file-error">
                                      {wordpressUploads[file.id]?.error}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>

        <aside className="panel options-panel" aria-label="Optimizer options">
          <div className="panel-title">
            <Settings2 aria-hidden="true" size={18} />
            <h2>Options</h2>
          </div>

          <label className="field">
            <span>Max width</span>
            <input
              type="number"
              min={1}
              max={8000}
              value={options.width}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  width: parseNumberInput(event.target.value)
                }))
              }
            />
          </label>

          <label className="field">
            <span>Quality</span>
            <input
              type="number"
              min={1}
              max={100}
              value={options.quality}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  quality: parseNumberInput(event.target.value)
                }))
              }
            />
          </label>

          <label className="field">
            <span>Concurrency</span>
            <input
              type="number"
              min={1}
              max={8}
              placeholder="Auto"
              value={options.concurrency}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  concurrency: parseNumberInput(event.target.value)
                }))
              }
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={options.autoOrient}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  autoOrient: event.target.checked
                }))
              }
            />
            <span>Auto orient</span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={options.stripMetadata}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  stripMetadata: event.target.checked
                }))
              }
            />
            <span>Strip metadata</span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={options.lossless}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  lossless: event.target.checked
                }))
              }
            />
            <span>Lossless WebP</span>
          </label>
        </aside>
      </div>
    </main>
  );
}
