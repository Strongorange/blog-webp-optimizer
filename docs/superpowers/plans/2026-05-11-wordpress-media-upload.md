# WordPress Media Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small WordPress media-library upload workflow for converted WebP files.

**Architecture:** Keep credentials server-side in `.env.local`. Add focused server helpers for WordPress configuration and REST upload, expose local Next API routes for status and upload, then add UI controls that upload successful conversion outputs by `jobId` and `fileId`. The browser never receives the WordPress Application Password.

**Tech Stack:** Next.js App Router route handlers, Node runtime, WordPress REST API `/wp-json/wp/v2/media`, Vitest, existing `p-limit`, existing job store and request guard.

---

## File Structure

- Create `src/lib/server/wordpress-config.ts`
  - Reads and validates WordPress env vars.
  - Normalizes `WORDPRESS_URL`.
  - Removes spaces from `WORDPRESS_APP_PASSWORD` before Basic Auth use.
- Create `src/lib/server/wordpress-client.ts`
  - Uploads one WebP file to WordPress REST media API.
  - Uploads multiple files with bounded concurrency.
  - Converts WordPress response into per-file upload results.
- Create `src/app/api/wordpress/status/route.ts`
  - Returns whether upload is configured without exposing secrets.
- Create `src/app/api/wordpress/upload/route.ts`
  - Accepts `jobId` and `fileIds`.
  - Validates local request, job state, and file eligibility.
  - Reads converted WebP outputs and uploads them to WordPress.
- Modify `src/components/OptimizerApp.tsx`
  - Fetches WordPress config status.
  - Adds per-file and batch upload controls after conversion.
  - Shows upload status, media URLs, and copy actions.
- Modify `src/app/globals.css`
  - Styles compact WordPress upload controls in the existing tool UI.
- Create `.env.local.example`
  - Documents local WordPress env variables without committing secrets.
- Modify `README.md`
  - Adds WordPress upload setup, scope, and security notes.
- Create tests:
  - `tests/server/wordpress-config.test.ts`
  - `tests/server/wordpress-client.test.ts`
  - `tests/api/wordpress-routes.test.ts`

---

## Task 1: WordPress Config And Client

**Files:**
- Create: `src/lib/server/wordpress-config.ts`
- Create: `src/lib/server/wordpress-client.ts`
- Create: `tests/server/wordpress-config.test.ts`
- Create: `tests/server/wordpress-client.test.ts`

- [ ] **Step 1: Write config tests**

Create `tests/server/wordpress-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getWordPressConfig, hasWordPressConfig } from "@/lib/server/wordpress-config";

describe("wordpress config", () => {
  it("returns null when required env values are missing", () => {
    expect(
      getWordPressConfig({
        WORDPRESS_URL: "https://strongorange.net",
        WORDPRESS_USERNAME: "strongorange"
      })
    ).toBeNull();
  });

  it("normalizes configured values", () => {
    expect(
      getWordPressConfig({
        WORDPRESS_URL: "https://strongorange.net/",
        WORDPRESS_USERNAME: " strongorange ",
        WORDPRESS_APP_PASSWORD: "abcd efgh ijkl mnop qrst uvwx"
      })
    ).toEqual({
      siteUrl: "https://strongorange.net",
      username: "strongorange",
      appPassword: "abcdefghijklmnopqrstuvwx"
    });
  });

  it("rejects invalid urls", () => {
    expect(
      getWordPressConfig({
        WORDPRESS_URL: "not a url",
        WORDPRESS_USERNAME: "strongorange",
        WORDPRESS_APP_PASSWORD: "abcd"
      })
    ).toBeNull();
  });

  it("reports whether config exists", () => {
    expect(
      hasWordPressConfig({
        WORDPRESS_URL: "https://strongorange.net",
        WORDPRESS_USERNAME: "strongorange",
        WORDPRESS_APP_PASSWORD: "abcd"
      })
    ).toBe(true);
    expect(hasWordPressConfig({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run config test and verify it fails**

Run:

```bash
pnpm test tests/server/wordpress-config.test.ts
```

Expected:

```text
FAIL tests/server/wordpress-config.test.ts
Cannot find module '@/lib/server/wordpress-config'
```

- [ ] **Step 3: Implement config helper**

Create `src/lib/server/wordpress-config.ts`:

```ts
export interface WordPressConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

interface WordPressEnv {
  WORDPRESS_URL?: string;
  WORDPRESS_USERNAME?: string;
  WORDPRESS_APP_PASSWORD?: string;
}

function normalizedValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getWordPressConfig(env: WordPressEnv = process.env): WordPressConfig | null {
  const rawUrl = normalizedValue(env.WORDPRESS_URL);
  const username = normalizedValue(env.WORDPRESS_USERNAME);
  const appPassword = normalizedValue(env.WORDPRESS_APP_PASSWORD).replace(/\s+/g, "");

  if (!rawUrl || !username || !appPassword) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    return {
      siteUrl: url.origin,
      username,
      appPassword
    };
  } catch {
    return null;
  }
}

export function hasWordPressConfig(env: WordPressEnv = process.env): boolean {
  return getWordPressConfig(env) !== null;
}
```

- [ ] **Step 4: Run config test and verify it passes**

Run:

```bash
pnpm test tests/server/wordpress-config.test.ts
```

Expected:

```text
PASS tests/server/wordpress-config.test.ts
```

- [ ] **Step 5: Write WordPress client tests**

Create `tests/server/wordpress-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  uploadWordPressMediaFile,
  uploadWordPressMediaFiles,
  type WordPressUploadFile
} from "@/lib/server/wordpress-client";
import type { WordPressConfig } from "@/lib/server/wordpress-config";

const config: WordPressConfig = {
  siteUrl: "https://strongorange.net",
  username: "strongorange",
  appPassword: "applicationpassword"
};

function uploadFile(overrides: Partial<WordPressUploadFile> = {}): WordPressUploadFile {
  return {
    fileId: "file-1",
    filename: "reef.webp",
    buffer: Buffer.from("webp data"),
    ...overrides
  };
}

describe("wordpress client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads a file with expected WordPress REST headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          source_url: "https://strongorange.net/wp-content/uploads/reef.webp"
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadWordPressMediaFile(config, uploadFile());

    expect(result).toEqual({
      fileId: "file-1",
      status: "uploaded",
      attachmentId: 123,
      url: "https://strongorange.net/wp-content/uploads/reef.webp"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://strongorange.net/wp-json/wp/v2/media",
      expect.objectContaining({
        method: "POST",
        body: expect.any(Buffer),
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("strongorange:applicationpassword").toString("base64")}`,
          "Content-Type": "image/webp",
          "Content-Disposition": 'attachment; filename="reef.webp"'
        })
      })
    );
  });

  it("returns a failed result when WordPress rejects the upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Sorry, you are not allowed." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(uploadWordPressMediaFile(config, uploadFile())).resolves.toEqual({
      fileId: "file-1",
      status: "failed",
      error: "Sorry, you are not allowed."
    });
  });

  it("returns a failed result when WordPress returns invalid media JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(uploadWordPressMediaFile(config, uploadFile())).resolves.toEqual({
      fileId: "file-1",
      status: "failed",
      error: "WordPress returned an invalid media response."
    });
  });

  it("uploads multiple files and preserves result order", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 1, source_url: "https://example.com/a.webp" }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 2, source_url: "https://example.com/b.webp" }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
          })
        )
    );

    const results = await uploadWordPressMediaFiles(config, [
      uploadFile({ fileId: "a", filename: "a.webp" }),
      uploadFile({ fileId: "b", filename: "b.webp" })
    ]);

    expect(results.map((result) => result.fileId)).toEqual(["a", "b"]);
    expect(results.map((result) => result.status)).toEqual(["uploaded", "uploaded"]);
  });
});
```

- [ ] **Step 6: Run client test and verify it fails**

Run:

```bash
pnpm test tests/server/wordpress-client.test.ts
```

Expected:

```text
FAIL tests/server/wordpress-client.test.ts
Cannot find module '@/lib/server/wordpress-client'
```

- [ ] **Step 7: Implement WordPress client**

Create `src/lib/server/wordpress-client.ts`:

```ts
import pLimit from "p-limit";
import type { WordPressConfig } from "./wordpress-config";

const WORDPRESS_UPLOAD_CONCURRENCY = 2;

export interface WordPressUploadFile {
  fileId: string;
  filename: string;
  buffer: Buffer;
}

export type WordPressUploadResult =
  | {
      fileId: string;
      status: "uploaded";
      attachmentId: number;
      url: string;
    }
  | {
      fileId: string;
      status: "failed";
      error: string;
    };

interface WordPressMediaResponse {
  id?: unknown;
  source_url?: unknown;
  message?: unknown;
}

function attachmentFilename(filename: string): string {
  return encodeURIComponent(filename);
}

async function readWordPressResponse(response: Response): Promise<WordPressMediaResponse> {
  try {
    return (await response.json()) as WordPressMediaResponse;
  } catch {
    return {};
  }
}

function basicAuth(config: WordPressConfig): string {
  return Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");
}

export async function uploadWordPressMediaFile(
  config: WordPressConfig,
  file: WordPressUploadFile
): Promise<WordPressUploadResult> {
  try {
    const response = await fetch(`${config.siteUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(config)}`,
        "Content-Type": "image/webp",
        "Content-Disposition": `attachment; filename="${attachmentFilename(file.filename)}"`
      },
      body: file.buffer
    });
    const body = await readWordPressResponse(response);

    if (!response.ok) {
      return {
        fileId: file.fileId,
        status: "failed",
        error:
          typeof body.message === "string"
            ? body.message
            : `WordPress upload failed with status ${response.status}.`
      };
    }

    if (typeof body.id !== "number" || typeof body.source_url !== "string") {
      return {
        fileId: file.fileId,
        status: "failed",
        error: "WordPress returned an invalid media response."
      };
    }

    return {
      fileId: file.fileId,
      status: "uploaded",
      attachmentId: body.id,
      url: body.source_url
    };
  } catch (error) {
    return {
      fileId: file.fileId,
      status: "failed",
      error: error instanceof Error ? error.message : "WordPress upload failed."
    };
  }
}

export async function uploadWordPressMediaFiles(
  config: WordPressConfig,
  files: WordPressUploadFile[]
): Promise<WordPressUploadResult[]> {
  const limit = pLimit(WORDPRESS_UPLOAD_CONCURRENCY);
  return Promise.all(files.map((file) => limit(() => uploadWordPressMediaFile(config, file))));
}
```

- [ ] **Step 8: Run client tests and typecheck**

Run:

```bash
pnpm test tests/server/wordpress-config.test.ts tests/server/wordpress-client.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/server/wordpress-config.test.ts
PASS tests/server/wordpress-client.test.ts
# no TypeScript errors
```

- [ ] **Step 9: Commit server helpers**

Run:

```bash
git add src/lib/server/wordpress-config.ts src/lib/server/wordpress-client.ts tests/server/wordpress-config.test.ts tests/server/wordpress-client.test.ts
git commit -m "feat: add wordpress upload client"
```

---

## Task 2: WordPress API Routes

**Files:**
- Create: `src/app/api/wordpress/status/route.ts`
- Create: `src/app/api/wordpress/upload/route.ts`
- Create: `tests/api/wordpress-routes.test.ts`

- [ ] **Step 1: Write API route tests**

Create `tests/api/wordpress-routes.test.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, TMP_JOBS_ROOT } from "@/lib/server/constants";
import { cleanupTmpRoot } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";
import type { JobFile } from "@/lib/server/types";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

function jobFile(overrides: Partial<JobFile> = {}): JobFile {
  const id = overrides.id ?? "file-1";
  const safeOutputName = overrides.safeOutputName ?? `${id}.webp`;
  return {
    id,
    originalName: `${id}.jpg`,
    safeOutputName,
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: path.join(TMP_JOBS_ROOT, "job-1", "input", `${id}.jpg`),
    outputPath: path.join(TMP_JOBS_ROOT, "job-1", "output", safeOutputName),
    status: "done",
    ...overrides
  };
}

function uploadRequest(body: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/wordpress/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function importStatusRoute() {
  vi.resetModules();
  return import("@/app/api/wordpress/status/route");
}

async function importUploadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/server/wordpress-client", () => ({
    uploadWordPressMediaFiles: vi.fn().mockResolvedValue([
      {
        fileId: "file-1",
        status: "uploaded",
        attachmentId: 123,
        url: "https://strongorange.net/wp-content/uploads/file-1.webp"
      }
    ])
  }));
  return import("@/app/api/wordpress/upload/route");
}

describe("wordpress API routes", () => {
  beforeEach(async () => {
    globalCleanup.__blogWebpOptimizerStartupCleanupPromise = Promise.resolve();
    vi.stubEnv("WORDPRESS_URL", "https://strongorange.net");
    vi.stubEnv("WORDPRESS_USERNAME", "strongorange");
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "abcd efgh");
    vi.doUnmock("@/lib/server/wordpress-client");
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await cleanupTmpRoot();
  });

  afterEach(async () => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/server/wordpress-client");
    for (const job of jobStore.list()) {
      jobStore.remove(job.id);
    }
    await fs.rm(TMP_JOBS_ROOT, { recursive: true, force: true });
  });

  it("returns configured wordpress status without secrets", async () => {
    const { GET } = await importStatusRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      configured: true,
      siteUrl: "https://strongorange.net"
    });
  });

  it("returns unconfigured wordpress status", async () => {
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "");
    const { GET } = await importStatusRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false });
  });

  it("rejects upload when wordpress config is missing", async () => {
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "");
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: "job-1", fileIds: ["file-1"] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "WordPress upload is not configured."
    });
  });

  it("rejects cross-origin upload requests", async () => {
    const { POST } = await importUploadRoute();
    const response = await POST(
      uploadRequest(
        { jobId: "job-1", fileIds: ["file-1"] },
        { Origin: "https://example.com" }
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Cross-origin uploads are not allowed."
    });
  });

  it("rejects missing jobs", async () => {
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: "missing", fileIds: ["file-1"] }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found." });
  });

  it("rejects files that are not converted", async () => {
    const queued = jobFile({ status: "queued" });
    const job = jobStore.create("job-1", [queued], DEFAULT_OPTIONS);
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: job.id, fileIds: [queued.id] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No converted files are ready to upload."
    });
  });

  it("returns per-file failure when an output artifact is missing", async () => {
    const file = jobFile({ id: "file-1", safeOutputName: "file-1.webp" });
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);
    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: job.id, fileIds: [file.id] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          fileId: file.id,
          status: "failed",
          error: "Converted file not found."
        }
      ]
    });
  });

  it("uploads converted files and returns wordpress results", async () => {
    const file = jobFile({ id: "file-1", safeOutputName: "file-1.webp" });
    await fs.mkdir(path.dirname(file.outputPath), { recursive: true });
    await fs.writeFile(file.outputPath, "webp data");
    const job = jobStore.create("job-1", [file], DEFAULT_OPTIONS);

    const { POST } = await importUploadRoute();
    const response = await POST(uploadRequest({ jobId: job.id, fileIds: [file.id] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          fileId: "file-1",
          status: "uploaded",
          attachmentId: 123,
          url: "https://strongorange.net/wp-content/uploads/file-1.webp"
        }
      ]
    });
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
pnpm test tests/api/wordpress-routes.test.ts
```

Expected:

```text
FAIL tests/api/wordpress-routes.test.ts
Cannot find module '@/app/api/wordpress/status/route'
```

- [ ] **Step 3: Implement status route**

Create `src/app/api/wordpress/status/route.ts`:

```ts
import { getWordPressConfig } from "@/lib/server/wordpress-config";

export const runtime = "nodejs";

export async function GET() {
  const config = getWordPressConfig();

  if (!config) {
    return Response.json({ configured: false });
  }

  return Response.json({
    configured: true,
    siteUrl: config.siteUrl
  });
}
```

- [ ] **Step 4: Implement upload route**

Create `src/app/api/wordpress/upload/route.ts`:

```ts
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
```

- [ ] **Step 5: Run route tests and typecheck**

Run:

```bash
pnpm test tests/api/wordpress-routes.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/api/wordpress-routes.test.ts
# no TypeScript errors
```

- [ ] **Step 6: Commit API routes**

Run:

```bash
git add src/app/api/wordpress/status/route.ts src/app/api/wordpress/upload/route.ts tests/api/wordpress-routes.test.ts
git commit -m "feat: add wordpress upload api"
```

---

## Task 3: WordPress Upload UI

**Files:**
- Modify: `src/components/OptimizerApp.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add WordPress UI types and state**

In `src/components/OptimizerApp.tsx`, add these types near the existing job types:

```tsx
type WordPressUploadStatus = "ready" | "uploading" | "uploaded" | "failed";

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
```

Inside `OptimizerApp`, add state next to the existing `useState` calls:

```tsx
const [wordpressStatus, setWordPressStatus] = useState<WordPressStatus | null>(null);
const [wordpressUploads, setWordPressUploads] = useState<Record<string, WordPressUploadState>>({});
const [wordpressError, setWordPressError] = useState<string | null>(null);
const [isUploadingToWordPress, setIsUploadingToWordPress] = useState(false);
const wordpressGenerationRef = useRef(0);
```

- [ ] **Step 2: Add WordPress status effect and reset integration**

Add this effect after the existing polling effect:

```tsx
useEffect(() => {
  let cancelled = false;

  async function loadWordPressStatus() {
    try {
      const response = await fetch("/api/wordpress/status", { cache: "no-store" });
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
```

Update `invalidatePendingRequests()` so it also invalidates WordPress uploads:

```tsx
function invalidatePendingRequests() {
  requestGenerationRef.current += 1;
  wordpressGenerationRef.current += 1;
  submitAbortRef.current?.abort();
  submitAbortRef.current = null;
}
```

Update `addFiles()` and `resetAll()` so they clear WordPress upload state:

```tsx
setWordPressUploads({});
setWordPressError(null);
setIsUploadingToWordPress(false);
```

- [ ] **Step 3: Add upload helper functions**

Add these helpers inside `OptimizerApp` before `return`:

```tsx
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
          next[fileId] = { status: "failed", error: payload.error ?? "WordPress upload failed." };
        }
        return next;
      });
      return;
    }

    const results = (payload.results ?? []) as WordPressUploadResult[];
    setWordPressUploads((current) => {
      const next = { ...current };
      for (const result of results) {
        if (result.status === "uploaded" && result.attachmentId && result.url) {
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
```

- [ ] **Step 4: Add WordPress controls to results header**

In the results section header, keep the existing ZIP link and add a compact upload action group:

```tsx
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
```

After the results header, add unconfigured/error/copy-all UI:

```tsx
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
    onClick={() => copyText(uploadedUrls().join("\\n"))}
  >
    Copy all URLs
  </button>
) : null}
```

- [ ] **Step 5: Add per-file WordPress actions to each result row**

In each results table row, under or beside the existing local `Download` action, add:

```tsx
{file.status === "done" && wordpressStatus?.configured ? (
  <div className="wordpress-actions">
    <button
      className="text-button"
      type="button"
      disabled={wordpressUploads[file.id]?.status === "uploading"}
      onClick={() => uploadToWordPress([file.id])}
    >
      {wordpressUploads[file.id]?.status === "uploading" ? "Uploading" : "Upload"}
    </button>
    {wordpressUploads[file.id]?.status === "uploaded" && wordpressUploads[file.id]?.url ? (
      <>
        <a className="text-link" href={wordpressUploads[file.id]?.url} target="_blank" rel="noreferrer">
          WordPress
        </a>
        <button
          className="text-button"
          type="button"
          onClick={() => copyText(wordpressUploads[file.id]?.url ?? "")}
        >
          Copy URL
        </button>
      </>
    ) : null}
    {wordpressUploads[file.id]?.status === "failed" ? (
      <span className="file-error">{wordpressUploads[file.id]?.error}</span>
    ) : null}
  </div>
) : null}
```

If the existing table action cell becomes cramped, use a vertical action stack inside that cell instead of adding another column.

- [ ] **Step 6: Add CSS for upload controls**

Append to `src/app/globals.css` near existing button/link styles:

```css
.result-actions,
.wordpress-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.wordpress-actions {
  margin-top: 8px;
}

.text-button {
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 700;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.text-button:disabled {
  color: var(--muted);
  cursor: wait;
  text-decoration: none;
}

.copy-urls-button {
  margin-bottom: 12px;
}
```

- [ ] **Step 7: Run UI verification**

Run:

```bash
pnpm typecheck
pnpm build
pnpm test
```

Expected:

```text
# no TypeScript errors
# Next.js build completes successfully
PASS all tests
```

- [ ] **Step 8: Commit UI changes**

Run:

```bash
git add src/components/OptimizerApp.tsx src/app/globals.css
git commit -m "feat: add wordpress upload controls"
```

---

## Task 4: Documentation And Env Example

**Files:**
- Create: `.env.local.example`
- Modify: `README.md`

- [ ] **Step 1: Add env example**

Create `.env.local.example`:

```env
WORDPRESS_URL=https://strongorange.net
WORDPRESS_USERNAME=your-wordpress-username
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

- [ ] **Step 2: Update README**

Add this section to `README.md` after the `Run` section:

````md
## WordPress Upload

WordPress upload is optional. Conversion and downloads work without it.

To enable media-library upload, create `.env.local`:

```env
WORDPRESS_URL=https://strongorange.net
WORDPRESS_USERNAME=your-wordpress-username
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

Use a WordPress Application Password from the WordPress user profile screen.
The password is read only by the local Next.js server and is not sent to the
browser.

For the first version, uploads go only to the WordPress Media Library. The app
does not edit drafts, insert Gutenberg blocks, or generate alt text.
````

Also update the feature list with:

```md
- Optionally uploads converted WebP files to WordPress Media Library
```

- [ ] **Step 3: Verify docs**

Run:

```bash
git diff --check
pnpm test
```

Expected:

```text
# no whitespace errors
PASS all tests
```

- [ ] **Step 4: Commit docs**

Run:

```bash
git add .env.local.example README.md
git commit -m "docs: add wordpress upload setup"
```

---

## Task 5: Final Verification And Publish

**Files:**
- No new files expected.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected:

```text
PASS all tests
# no TypeScript errors
# Next.js build completes successfully
```

- [ ] **Step 2: Verify local server still binds only to localhost**

Run:

```bash
pnpm dev
```

In another shell:

```bash
curl -I http://127.0.0.1:9732
ss -ltnp 'sport = :9732'
```

Expected:

```text
HTTP/1.1 200 OK
127.0.0.1:9732
```

Stop the dev server before final status:

```bash
Ctrl-C
```

- [ ] **Step 3: Verify WordPress controls without env**

Run the app without `.env.local`.

Expected:

- Converter still works.
- Download buttons still work.
- WordPress upload shows unconfigured state or is disabled.
- No secret value appears in HTML or browser JSON.

- [ ] **Step 4: Verify WordPress upload with env**

Create local `.env.local` with real values:

```env
WORDPRESS_URL=https://strongorange.net
WORDPRESS_USERNAME=<real-user>
WORDPRESS_APP_PASSWORD=<real-application-password>
```

Run:

```bash
pnpm dev
```

Manual workflow:

- Convert two small images.
- Click `Upload` on one file.
- Click `Upload all`.
- Confirm each uploaded result has a URL.
- Open one returned URL.
- Confirm the files appear in WordPress Media Library.
- Click `Copy all URLs` and confirm it copies newline-separated URLs.

Do not commit `.env.local`.

- [ ] **Step 5: Push to GitHub**

Run:

```bash
git status --short --branch
git push
git ls-remote --heads origin main
```

Expected:

```text
## main...origin/main [ahead N]
main pushed successfully
origin/main points to the same HEAD SHA
```

---

## Self-Review Checklist

- Spec coverage:
  - Media-library upload: Task 2 and Task 3.
  - Per-file and batch upload: Task 3.
  - Attachment ID and media URL: Task 1, Task 2, Task 3.
  - `Copy all URLs`: Task 3.
  - `.env.local` and Application Password docs: Task 4.
  - No Cloudflare proxy: documented in design, no implementation tasks.
  - No post/draft editing: documented in Task 4 README text.
- Placeholder scan:
  - No deferred-work markers or unspecified implementation steps.
- Type consistency:
  - Upload result fields are consistently `fileId`, `status`, `attachmentId`, `url`, and `error`.
  - Config fields are consistently `siteUrl`, `username`, and `appPassword`.
  - API request fields are consistently `jobId` and `fileIds`.
