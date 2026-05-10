# Blog WebP Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clone-friendly local Next.js app that converts multiple blog images to WebP through a drag-and-drop localhost UI with per-file and ZIP downloads.

**Architecture:** A single Next.js App Router application runs on `127.0.0.1:9732`. API route handlers use the Node runtime to store uploads under `tmp/jobs`, process images with `sharp`, keep in-memory job state, and return individual or ZIP downloads. The browser UI handles upload selection, options, polling, and downloads.

**Tech Stack:** Next.js 16, React 19, TypeScript, sharp, archiver, p-limit, lucide-react, Vitest, pnpm.

---

## Scope Check

The approved spec is focused on one subsystem: a local WebP conversion app. It does not require decomposition into separate plans.

Implementation must preserve these user decisions:

- Public repo target: `Strongorange/blog-webp-optimizer`.
- Local run command: `pnpm install && pnpm dev`.
- Port: `127.0.0.1:9732`.
- UX: drag-and-drop or file picker, not folder path entry.
- Output: individual WebP downloads and all-results ZIP download.
- Input formats: `jpg`, `jpeg`, `png`, `webp`.
- Defaults: width `1280`, quality `82`, auto orient enabled, metadata strip enabled, lossless disabled, concurrency auto.

## File Structure

Create and modify these files:

```text
.
├─ .gitignore
├─ README.md
├─ next-env.d.ts
├─ next.config.mjs
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ src
│  ├─ app
│  │  ├─ api
│  │  │  └─ jobs
│  │  │     ├─ route.ts
│  │  │     └─ [jobId]
│  │  │        ├─ route.ts
│  │  │        ├─ download
│  │  │        │  └─ route.ts
│  │  │        └─ files
│  │  │           └─ [fileId]
│  │  │              └─ route.ts
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components
│  │  └─ OptimizerApp.tsx
│  └─ lib
│     ├─ client
│     │  └─ format.ts
│     └─ server
│        ├─ cleanup.ts
│        ├─ constants.ts
│        ├─ filenames.ts
│        ├─ image-engine.ts
│        ├─ job-runner.ts
│        ├─ job-store.ts
│        ├─ options.ts
│        ├─ storage.ts
│        ├─ types.ts
│        └─ zip.ts
└─ tests
   └─ server
      ├─ filenames.test.ts
      ├─ image-engine.test.ts
      ├─ job-store.test.ts
      ├─ options.test.ts
      └─ zip.test.ts
```

Responsibilities:

- `src/lib/server/types.ts`: shared server-side job and option types.
- `src/lib/server/constants.ts`: limits, defaults, temp root, retention window.
- `src/lib/server/filenames.ts`: path-safe output names and duplicate handling.
- `src/lib/server/options.ts`: form option parsing, clamping, and defaults.
- `src/lib/server/storage.ts`: job directory creation and file writes.
- `src/lib/server/job-store.ts`: in-memory job state with a global singleton for Next dev reloads.
- `src/lib/server/cleanup.ts`: stale temporary job cleanup.
- `src/lib/server/image-engine.ts`: sharp conversion pipeline.
- `src/lib/server/job-runner.ts`: bounded concurrent processing for one job.
- `src/lib/server/zip.ts`: ZIP buffer creation from successful outputs.
- API routes: thin HTTP layer over server library functions.
- `src/components/OptimizerApp.tsx`: complete client UI and polling.

## Task 1: Project Scaffold

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `next-env.d.ts`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Add project package metadata**

Create `package.json`:

```json
{
  "name": "blog-webp-optimizer",
  "version": "0.1.0",
  "private": false,
  "description": "Local localhost WebP optimizer for blog images.",
  "scripts": {
    "dev": "next dev -H 127.0.0.1 -p 9732",
    "build": "next build",
    "start": "next start -H 127.0.0.1 -p 9732",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "archiver": "^8.0.0",
    "lucide-react": "^1.14.0",
    "next": "^16.2.6",
    "p-limit": "^7.3.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "sharp": "^0.34.5"
  },
  "devDependencies": {
    "@types/archiver": "^7.0.0",
    "@types/node": "^25.6.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
pnpm install
```

Expected:

```text
Packages: +...
Done in ...
```

This creates `pnpm-lock.yaml`.

- [ ] **Step 3: Add TypeScript and Next config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

Create `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false
};

export default nextConfig;
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is generated by Next.js and kept in source control for a clone-friendly setup.
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
```

- [ ] **Step 4: Add gitignore**

Create `.gitignore`:

```gitignore
node_modules/
.next/
out/
dist/
coverage/
.DS_Store
*.log
tmp/
.env
.env.local
```

- [ ] **Step 5: Add minimal app shell**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blog WebP Optimizer",
  description: "Local WebP conversion for blog images"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="workspace">
        <h1>Blog WebP Optimizer</h1>
        <p>The converter UI scaffold is ready.</p>
      </section>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color-scheme: light;
  --background: #f7f8fa;
  --surface: #ffffff;
  --surface-muted: #f0f3f6;
  --text: #17202a;
  --muted: #657386;
  --border: #d8dee7;
  --accent: #0f766e;
  --accent-strong: #0b5f59;
  --danger: #b42318;
  --success: #147a3f;
  --shadow: 0 14px 34px rgba(24, 36, 51, 0.09);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
}

.page-shell {
  min-height: 100vh;
  padding: 32px;
}

.workspace {
  width: min(1180px, 100%);
  margin: 0 auto;
}

@media (max-width: 720px) {
  .page-shell {
    padding: 16px;
  }
}
```

- [ ] **Step 6: Verify scaffold**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected:

```text
pnpm typecheck
# no TypeScript errors

pnpm build
# Next.js build completes successfully
```

- [ ] **Step 7: Commit scaffold**

Run:

```bash
git add .gitignore package.json pnpm-lock.yaml tsconfig.json next.config.mjs next-env.d.ts vitest.config.ts src/app/layout.tsx src/app/page.tsx src/app/globals.css
git commit -m "chore: scaffold next app"
```

## Task 2: Validation, Types, And Filename Utilities

**Files:**
- Create: `src/lib/server/constants.ts`
- Create: `src/lib/server/types.ts`
- Create: `src/lib/server/filenames.ts`
- Create: `src/lib/server/options.ts`
- Create: `tests/server/filenames.test.ts`
- Create: `tests/server/options.test.ts`

- [ ] **Step 1: Write filename tests**

Create `tests/server/filenames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeOutputName, sanitizeBaseName, uniqueOutputNames } from "@/lib/server/filenames";

describe("filename utilities", () => {
  it("removes path separators and converts output extension to webp", () => {
    expect(makeOutputName("../reef/tank shot.JPG")).toBe("tank shot.webp");
    expect(makeOutputName("..\\secret\\image.png")).toBe("image.webp");
  });

  it("falls back when the base name is empty after sanitizing", () => {
    expect(sanitizeBaseName("...")).toBe("image");
    expect(makeOutputName("///.jpg")).toBe("image.webp");
  });

  it("deduplicates output names with stable suffixes", () => {
    expect(uniqueOutputNames(["reef.jpg", "reef.png", "reef.webp"])).toEqual([
      "reef.webp",
      "reef-2.webp",
      "reef-3.webp"
    ]);
  });
});
```

- [ ] **Step 2: Write option parsing tests**

Create `tests/server/options.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/server/constants";
import { parseConversionOptions } from "@/lib/server/options";

describe("parseConversionOptions", () => {
  it("returns blog defaults when fields are missing", () => {
    const options = parseConversionOptions(new FormData());
    expect(options).toEqual(DEFAULT_OPTIONS);
  });

  it("clamps numeric fields into safe ranges", () => {
    const data = new FormData();
    data.set("width", "99999");
    data.set("quality", "-4");
    data.set("concurrency", "200");

    const options = parseConversionOptions(data);

    expect(options.width).toBe(8000);
    expect(options.quality).toBe(1);
    expect(options.concurrency).toBe(8);
  });

  it("parses boolean options from form fields", () => {
    const data = new FormData();
    data.set("autoOrient", "false");
    data.set("stripMetadata", "false");
    data.set("lossless", "true");

    const options = parseConversionOptions(data);

    expect(options.autoOrient).toBe(false);
    expect(options.stripMetadata).toBe(false);
    expect(options.lossless).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm test tests/server/filenames.test.ts tests/server/options.test.ts
```

Expected:

```text
FAIL tests/server/filenames.test.ts
FAIL tests/server/options.test.ts
Cannot find module '@/lib/server/...'
```

- [ ] **Step 4: Implement constants and types**

Create `src/lib/server/types.ts`:

```ts
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
```

Create `src/lib/server/constants.ts`:

```ts
import os from "node:os";
import path from "node:path";
import type { ConversionOptions } from "./types";

export const ACCEPTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export const MAX_FILES_PER_JOB = 50;
export const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;
export const JOB_RETENTION_MS = 60 * 60 * 1000;
export const TMP_JOBS_ROOT = path.join(process.cwd(), "tmp", "jobs");

export const DEFAULT_CONCURRENCY = Math.min(Math.max(os.cpus().length - 1, 1), 4);

export const DEFAULT_OPTIONS: ConversionOptions = {
  width: 1280,
  quality: 82,
  autoOrient: true,
  stripMetadata: true,
  lossless: false,
  concurrency: DEFAULT_CONCURRENCY
};
```

- [ ] **Step 5: Implement filename utilities**

Create `src/lib/server/filenames.ts`:

```ts
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const CONTROL_CHARS = /[\x00-\x1f\x80-\x9f]/g;
const RESERVED_CHARS = /[<>:"/\\|?*]+/g;

export function sanitizeBaseName(input: string): string {
  const normalized = input.replace(WINDOWS_DRIVE, "").replace(/\\/g, "/");
  const basename = normalized.split("/").filter(Boolean).at(-1) ?? "";
  const extensionIndex = basename.lastIndexOf(".");
  const rawBase =
    extensionIndex > 0
      ? basename.slice(0, extensionIndex)
      : basename.startsWith(".")
        ? ""
        : basename;
  const cleaned = rawBase
    .replace(CONTROL_CHARS, "")
    .replace(RESERVED_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();

  return cleaned.length > 0 ? cleaned : "image";
}

export function makeOutputName(originalName: string): string {
  return `${sanitizeBaseName(originalName)}.webp`;
}

export function uniqueOutputNames(originalNames: string[]): string[] {
  const used = new Map<string, number>();

  return originalNames.map((originalName) => {
    const base = sanitizeBaseName(originalName);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);

    if (seen === 0) {
      return `${base}.webp`;
    }

    return `${base}-${seen + 1}.webp`;
  });
}
```

- [ ] **Step 6: Implement option parsing**

Create `src/lib/server/options.ts`:

```ts
import { DEFAULT_OPTIONS } from "./constants";
import type { ConversionOptions } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseNumber(value: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp(Math.round(parsed), min, max);
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

export function parseConversionOptions(formData: FormData): ConversionOptions {
  return {
    width: parseNumber(formData.get("width"), DEFAULT_OPTIONS.width, 1, 8000),
    quality: parseNumber(formData.get("quality"), DEFAULT_OPTIONS.quality, 1, 100),
    autoOrient: parseBoolean(formData.get("autoOrient"), DEFAULT_OPTIONS.autoOrient),
    stripMetadata: parseBoolean(formData.get("stripMetadata"), DEFAULT_OPTIONS.stripMetadata),
    lossless: parseBoolean(formData.get("lossless"), DEFAULT_OPTIONS.lossless),
    concurrency: parseNumber(
      formData.get("concurrency"),
      DEFAULT_OPTIONS.concurrency,
      1,
      8
    )
  };
}
```

- [ ] **Step 7: Verify tests pass**

Run:

```bash
pnpm test tests/server/filenames.test.ts tests/server/options.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/server/filenames.test.ts
PASS tests/server/options.test.ts
```

- [ ] **Step 8: Commit validation utilities**

Run:

```bash
git add src/lib/server/constants.ts src/lib/server/types.ts src/lib/server/filenames.ts src/lib/server/options.ts tests/server/filenames.test.ts tests/server/options.test.ts
git commit -m "feat: add conversion validation utilities"
```

## Task 3: Job Store, Temporary Storage, And Cleanup

**Files:**
- Create: `src/lib/server/storage.ts`
- Create: `src/lib/server/job-store.ts`
- Create: `src/lib/server/cleanup.ts`
- Create: `tests/server/job-store.test.ts`

- [ ] **Step 1: Write job store tests**

Create `tests/server/job-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/server/constants";
import { createJobStore } from "@/lib/server/job-store";
import type { JobFile } from "@/lib/server/types";

function file(overrides: Partial<JobFile> = {}): JobFile {
  return {
    id: "file-1",
    originalName: "reef.jpg",
    safeOutputName: "reef.webp",
    mimeType: "image/jpeg",
    inputBytes: 1000,
    inputPath: "/tmp/in.jpg",
    outputPath: "/tmp/out.webp",
    status: "queued",
    ...overrides
  };
}

describe("job store", () => {
  it("creates a queued job with expiry", () => {
    const store = createJobStore();
    const job = store.create("job-1", [file()], DEFAULT_OPTIONS);

    expect(job.status).toBe("queued");
    expect(job.files[0].status).toBe("queued");
    expect(job.expiresAt).toBeGreaterThan(job.createdAt);
  });

  it("marks job done when all files are done", () => {
    const store = createJobStore();
    const job = store.create("job-1", [file()], DEFAULT_OPTIONS);

    store.updateFile(job.id, "file-1", {
      status: "done",
      outputBytes: 500,
      reductionPercent: 50
    });
    store.refreshJobStatus(job.id);

    expect(store.get(job.id)?.status).toBe("done");
  });

  it("marks job partial when at least one file fails and one succeeds", () => {
    const store = createJobStore();
    const job = store.create(
      "job-1",
      [
        file({ id: "file-1", status: "queued" }),
        file({ id: "file-2", originalName: "bad.jpg", status: "queued" })
      ],
      DEFAULT_OPTIONS
    );

    store.updateFile(job.id, "file-1", { status: "done", outputBytes: 500 });
    store.updateFile(job.id, "file-2", { status: "failed", error: "Corrupt image" });
    store.refreshJobStatus(job.id);

    expect(store.get(job.id)?.status).toBe("partial");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm test tests/server/job-store.test.ts
```

Expected:

```text
FAIL tests/server/job-store.test.ts
Cannot find module '@/lib/server/job-store'
```

- [ ] **Step 3: Implement temporary storage**

Create `src/lib/server/storage.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { TMP_JOBS_ROOT } from "./constants";

export interface JobPaths {
  jobDir: string;
  inputDir: string;
  outputDir: string;
}

export function getJobPaths(jobId: string): JobPaths {
  const jobDir = path.join(TMP_JOBS_ROOT, jobId);

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

export async function safeRemove(pathToRemove: string): Promise<void> {
  await fs.rm(pathToRemove, { recursive: true, force: true });
}
```

- [ ] **Step 4: Implement job store**

Create `src/lib/server/job-store.ts`:

```ts
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
```

- [ ] **Step 5: Implement cleanup**

Create `src/lib/server/cleanup.ts`:

```ts
import fs from "node:fs/promises";
import { TMP_JOBS_ROOT } from "./constants";
import { jobStore } from "./job-store";
import { safeRemove, getJobPaths } from "./storage";

let startupCleanupPromise: Promise<void> | undefined;

export async function cleanupExpiredJobs(now = Date.now()): Promise<void> {
  for (const job of jobStore.list()) {
    if (job.expiresAt <= now) {
      await safeRemove(getJobPaths(job.id).jobDir);
      jobStore.remove(job.id);
    }
  }
}

export async function cleanupTmpRoot(): Promise<void> {
  await fs.rm(TMP_JOBS_ROOT, { recursive: true, force: true });
  await fs.mkdir(TMP_JOBS_ROOT, { recursive: true });
}

export function runStartupCleanupOnce(): Promise<void> {
  startupCleanupPromise ??= cleanupTmpRoot();
  return startupCleanupPromise;
}
```

- [ ] **Step 6: Verify job store tests pass**

Run:

```bash
pnpm test tests/server/job-store.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/server/job-store.test.ts
```

- [ ] **Step 7: Commit job state and storage**

Run:

```bash
git add src/lib/server/storage.ts src/lib/server/job-store.ts src/lib/server/cleanup.ts tests/server/job-store.test.ts
git commit -m "feat: add job storage state"
```

## Task 4: Sharp Image Engine

**Files:**
- Create: `src/lib/server/image-engine.ts`
- Create: `tests/server/image-engine.test.ts`

- [ ] **Step 1: Write image engine tests**

Create `tests/server/image-engine.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convertToWebP } from "@/lib/server/image-engine";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-webp-engine-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function createJpeg(fileName: string, width = 1800, height = 900): Promise<string> {
  const inputPath = path.join(tempDir, fileName);
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#2f7d73"
    }
  })
    .jpeg()
    .toFile(inputPath);
  return inputPath;
}

describe("convertToWebP", () => {
  it("converts and resizes without enlargement", async () => {
    const inputPath = await createJpeg("large.jpg", 1800, 900);
    const outputPath = path.join(tempDir, "large.webp");

    const result = await convertToWebP(inputPath, outputPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });

    const metadata = await sharp(outputPath).metadata();
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(640);
  });

  it("does not enlarge images smaller than the target width", async () => {
    const inputPath = await createJpeg("small.jpg", 640, 320);
    const outputPath = path.join(tempDir, "small.webp");

    await convertToWebP(inputPath, outputPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });

    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(320);
  });

  it("strips metadata by default and preserves it when requested", async () => {
    const inputPath = path.join(tempDir, "meta.jpg");
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: "#d8f3dc"
      }
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Blog WebP Optimizer" } })
      .toFile(inputPath);

    const strippedPath = path.join(tempDir, "stripped.webp");
    const keptPath = path.join(tempDir, "kept.webp");

    await convertToWebP(inputPath, strippedPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: true,
      lossless: false,
      concurrency: 1
    });
    await convertToWebP(inputPath, keptPath, {
      width: 1280,
      quality: 82,
      autoOrient: true,
      stripMetadata: false,
      lossless: false,
      concurrency: 1
    });

    const strippedMetadata = await sharp(strippedPath).metadata();
    const keptMetadata = await sharp(keptPath).metadata();

    expect(strippedMetadata.exif).toBeUndefined();
    expect(keptMetadata.exif?.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm test tests/server/image-engine.test.ts
```

Expected:

```text
FAIL tests/server/image-engine.test.ts
Cannot find module '@/lib/server/image-engine'
```

- [ ] **Step 3: Implement image engine**

Create `src/lib/server/image-engine.ts`:

```ts
import fs from "node:fs/promises";
import sharp from "sharp";
import type { ConversionOptions } from "./types";

export interface ConversionResult {
  outputBytes: number;
  reductionPercent: number;
}

export async function convertToWebP(
  inputPath: string,
  outputPath: string,
  options: ConversionOptions
): Promise<ConversionResult> {
  const inputStat = await fs.stat(inputPath);
  let pipeline = sharp(inputPath, { failOn: "none" });

  if (options.autoOrient) {
    pipeline = pipeline.rotate();
  }

  pipeline = pipeline.resize({
    width: options.width,
    fit: "inside",
    withoutEnlargement: true
  });

  if (!options.stripMetadata) {
    pipeline = pipeline.keepMetadata();
  }

  await pipeline
    .webp({
      quality: options.quality,
      lossless: options.lossless
    })
    .toFile(outputPath);

  const outputStat = await fs.stat(outputPath);
  const reductionPercent =
    inputStat.size > 0
      ? Math.round((1 - outputStat.size / inputStat.size) * 1000) / 10
      : 0;

  return {
    outputBytes: outputStat.size,
    reductionPercent
  };
}
```

- [ ] **Step 4: Verify image engine tests pass**

Run:

```bash
pnpm test tests/server/image-engine.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/server/image-engine.test.ts
```

- [ ] **Step 5: Commit image engine**

Run:

```bash
git add src/lib/server/image-engine.ts tests/server/image-engine.test.ts
git commit -m "feat: add sharp webp engine"
```

## Task 5: Job Runner And Upload API

**Files:**
- Create: `src/lib/server/job-runner.ts`
- Create: `src/app/api/jobs/route.ts`
- Create: `src/app/api/jobs/[jobId]/route.ts`
- Modify: `src/lib/server/cleanup.ts`

- [ ] **Step 1: Implement job runner**

Create `src/lib/server/job-runner.ts`:

```ts
import pLimit from "p-limit";
import { convertToWebP } from "./image-engine";
import { jobStore } from "./job-store";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Image conversion failed";
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
```

- [ ] **Step 2: Keep startup cleanup awaitable from API routes**

Keep `src/lib/server/cleanup.ts` as:

```ts
import fs from "node:fs/promises";
import { TMP_JOBS_ROOT } from "./constants";
import { jobStore } from "./job-store";
import { safeRemove, getJobPaths } from "./storage";

let startupCleanupPromise: Promise<void> | undefined;

export async function cleanupExpiredJobs(now = Date.now()): Promise<void> {
  for (const job of jobStore.list()) {
    if (job.expiresAt <= now) {
      await safeRemove(getJobPaths(job.id).jobDir);
      jobStore.remove(job.id);
    }
  }
}

export async function cleanupTmpRoot(): Promise<void> {
  await fs.rm(TMP_JOBS_ROOT, { recursive: true, force: true });
  await fs.mkdir(TMP_JOBS_ROOT, { recursive: true });
}

export function runStartupCleanupOnce(): Promise<void> {
  startupCleanupPromise ??= cleanupTmpRoot();
  return startupCleanupPromise;
}
```

- [ ] **Step 3: Implement job creation route**

Create `src/app/api/jobs/route.ts`:

```ts
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES, MAX_BYTES_PER_FILE, MAX_FILES_PER_JOB } from "@/lib/server/constants";
import { runStartupCleanupOnce } from "@/lib/server/cleanup";
import { uniqueOutputNames } from "@/lib/server/filenames";
import { jobStore } from "@/lib/server/job-store";
import { processJob } from "@/lib/server/job-runner";
import { parseConversionOptions } from "@/lib/server/options";
import { ensureJobDirs, writeUploadedFile } from "@/lib/server/storage";
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
  const paths = await ensureJobDirs(tempJobId);

  const jobFiles: JobFile[] = [];

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

  const job = jobStore.create(tempJobId, jobFiles, options);

  void processJob(job.id);

  return Response.json(jobStore.toPublic(job), { status: 202 });
}
```

- [ ] **Step 4: Implement job status route**

Create `src/app/api/jobs/[jobId]/route.ts`:

```ts
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
```

- [ ] **Step 5: Verify upload API compiles**

Run:

```bash
pnpm test tests/server/job-store.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/server/job-store.test.ts
# no TypeScript errors
```

- [ ] **Step 6: Commit upload API**

Run:

```bash
git add src/lib/server/job-runner.ts src/lib/server/job-store.ts src/lib/server/cleanup.ts src/app/api/jobs/route.ts src/app/api/jobs/[jobId]/route.ts tests/server/job-store.test.ts
git commit -m "feat: add upload job api"
```

## Task 6: Download APIs And ZIP Creation

**Files:**
- Create: `src/lib/server/zip.ts`
- Create: `src/app/api/jobs/[jobId]/files/[fileId]/route.ts`
- Create: `src/app/api/jobs/[jobId]/download/route.ts`
- Create: `tests/server/zip.test.ts`

- [ ] **Step 1: Write ZIP test**

Create `tests/server/zip.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createZipBuffer } from "@/lib/server/zip";
import type { JobFile } from "@/lib/server/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-webp-zip-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function jobFile(id: string, status: JobFile["status"], outputName: string): JobFile {
  return {
    id,
    originalName: `${id}.jpg`,
    safeOutputName: outputName,
    mimeType: "image/jpeg",
    inputBytes: 10,
    inputPath: path.join(tempDir, `${id}.jpg`),
    outputPath: path.join(tempDir, outputName),
    status
  };
}

describe("createZipBuffer", () => {
  it("includes successful output files only", async () => {
    const done = jobFile("done", "done", "done.webp");
    const failed = jobFile("failed", "failed", "failed.webp");
    await fs.writeFile(done.outputPath, Buffer.from("webp data"));
    await fs.writeFile(failed.outputPath, Buffer.from("bad data"));

    const zip = await createZipBuffer([done, failed]);

    expect(zip.length).toBeGreaterThan(20);
    expect(zip.toString("latin1")).toContain("done.webp");
    expect(zip.toString("latin1")).not.toContain("failed.webp");
  });
});
```

- [ ] **Step 2: Run ZIP test and verify it fails**

Run:

```bash
pnpm test tests/server/zip.test.ts
```

Expected:

```text
FAIL tests/server/zip.test.ts
Cannot find module '@/lib/server/zip'
```

- [ ] **Step 3: Implement ZIP utility**

Create `src/lib/server/zip.ts`:

```ts
import archiver from "archiver";
import type { JobFile } from "./types";

export async function createZipBuffer(files: JobFile[]): Promise<Buffer> {
  const successfulFiles = files.filter((file) => file.status === "done");

  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    archive.on("warning", reject);
    archive.on("error", reject);
    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    for (const file of successfulFiles) {
      archive.file(file.outputPath, { name: file.safeOutputName });
    }

    void archive.finalize();
  });
}
```

- [ ] **Step 4: Implement individual download route**

Create `src/app/api/jobs/[jobId]/files/[fileId]/route.ts`:

```ts
import fs from "node:fs/promises";
import { cleanupExpiredJobs, runStartupCleanupOnce } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";

export const runtime = "nodejs";

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

  const buffer = await fs.readFile(file.outputPath);

  return new Response(buffer, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.safeOutputName)}"`
    }
  });
}
```

- [ ] **Step 5: Implement ZIP download route**

Create `src/app/api/jobs/[jobId]/download/route.ts`:

```ts
import { cleanupExpiredJobs, runStartupCleanupOnce } from "@/lib/server/cleanup";
import { jobStore } from "@/lib/server/job-store";
import { createZipBuffer } from "@/lib/server/zip";

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

  const successfulFiles = job.files.filter((file) => file.status === "done");
  if (successfulFiles.length === 0) {
    return Response.json({ error: "No converted files are ready." }, { status: 404 });
  }

  const buffer = await createZipBuffer(successfulFiles);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="blog-webp-${job.id}.zip"`
    }
  });
}
```

- [ ] **Step 6: Verify download utilities**

Run:

```bash
pnpm test tests/server/zip.test.ts
pnpm typecheck
```

Expected:

```text
PASS tests/server/zip.test.ts
# no TypeScript errors
```

- [ ] **Step 7: Commit downloads**

Run:

```bash
git add src/lib/server/zip.ts src/app/api/jobs/[jobId]/files/[fileId]/route.ts src/app/api/jobs/[jobId]/download/route.ts tests/server/zip.test.ts
git commit -m "feat: add webp download routes"
```

## Task 7: Client UI

**Files:**
- Create: `src/components/OptimizerApp.tsx`
- Create: `src/lib/client/format.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add client formatting helpers**

Create `src/lib/client/format.ts`:

```ts
export function formatBytes(bytes?: number): string {
  if (bytes === undefined) {
    return "-";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatReduction(value?: number): string {
  if (value === undefined) {
    return "-";
  }

  if (value < 0) {
    return `+${Math.abs(value).toFixed(1)}%`;
  }

  return `${value.toFixed(1)}%`;
}
```

- [ ] **Step 2: Add main optimizer component**

Create `src/components/OptimizerApp.tsx`:

```tsx
"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileArchive, ImagePlus, Loader2, RotateCcw, Settings2, UploadCloud } from "lucide-react";
import { formatBytes, formatReduction } from "@/lib/client/format";

type FileStatus = "queued" | "processing" | "done" | "failed";
type JobStatus = "queued" | "processing" | "done" | "failed" | "partial";

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

interface OptionsState {
  width: number;
  quality: number;
  autoOrient: boolean;
  stripMetadata: boolean;
  lossless: boolean;
  concurrency: "" | number;
}

const DEFAULT_OPTIONS: OptionsState = {
  width: 1280,
  quality: 82,
  autoOrient: true,
  stripMetadata: true,
  lossless: false,
  concurrency: ""
};

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function statusLabel(status: FileStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
  }
}

export function OptimizerApp() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [options, setOptions] = useState<OptionsState>(DEFAULT_OPTIONS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSuccessfulFiles = useMemo(
    () => Boolean(job?.files.some((file) => file.status === "done")),
    [job]
  );

  useEffect(() => {
    if (!job || ["done", "failed", "partial"].includes(job.status)) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (!response.ok) {
        window.clearInterval(interval);
        setError("The conversion job could not be found.");
        return;
      }

      const nextJob = (await response.json()) as PublicJob;
      setJob(nextJob);

      if (["done", "failed", "partial"].includes(nextJob.status)) {
        window.clearInterval(interval);
      }
    }, 800);

    return () => window.clearInterval(interval);
  }, [job]);

  function addFiles(incoming: File[]) {
    const accepted = incoming.filter(isAccepted);
    const rejectedNames = incoming
      .filter((file) => !isAccepted(file))
      .map((file) => file.name);

    setFiles(accepted.slice(0, 50));
    setRejected(rejectedNames);
    setJob(null);
    setError(null);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  async function submit() {
    if (files.length === 0) {
      setError("Select at least one image.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    formData.set("width", String(options.width));
    formData.set("quality", String(options.quality));
    formData.set("autoOrient", String(options.autoOrient));
    formData.set("stripMetadata", String(options.stripMetadata));
    formData.set("lossless", String(options.lossless));
    if (options.concurrency !== "") {
      formData.set("concurrency", String(options.concurrency));
    }

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Upload failed.");
        return;
      }

      setJob(payload as PublicJob);
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setFiles([]);
    setRejected([]);
    setJob(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <main className="page-shell">
      <section className="workspace">
        <header className="app-header">
          <div>
            <h1>Blog WebP Optimizer</h1>
            <p>Convert blog images locally on localhost. Nothing leaves this machine.</p>
          </div>
          <div className="port-badge">127.0.0.1:9732</div>
        </header>

        <section className="tool-layout">
          <div className="main-column">
            <div
              className="dropzone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud aria-hidden="true" size={34} />
              <strong>Drop images here</strong>
              <span>or choose JPG, PNG, and WebP files</span>
              <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFileInput}
                hidden
              />
            </div>

            {rejected.length > 0 ? (
              <div className="notice danger">
                Skipped unsupported files: {rejected.join(", ")}
              </div>
            ) : null}

            {error ? <div className="notice danger">{error}</div> : null}

            <div className="file-panel">
              <div className="panel-header">
                <h2>Files</h2>
                <button className="ghost-button" onClick={reset} type="button">
                  <RotateCcw size={16} aria-hidden="true" />
                  Reset
                </button>
              </div>

              {job ? (
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Saved</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.files.map((file) => (
                      <tr key={file.id}>
                        <td>
                          <span className="file-name">{file.originalName}</span>
                          {file.error ? <span className="file-error">{file.error}</span> : null}
                        </td>
                        <td>
                          <span className={`status-pill ${file.status}`}>
                            {file.status === "processing" ? (
                              <Loader2 className="spin" size={14} aria-hidden="true" />
                            ) : null}
                            {statusLabel(file.status)}
                          </span>
                        </td>
                        <td>{formatBytes(file.inputBytes)}</td>
                        <td>{formatBytes(file.outputBytes)}</td>
                        <td>{formatReduction(file.reductionPercent)}</td>
                        <td>
                          {file.status === "done" ? (
                            <a
                              className="icon-link"
                              href={`/api/jobs/${job.id}/files/${file.id}`}
                              title={`Download ${file.safeOutputName}`}
                            >
                              <Download size={16} aria-hidden="true" />
                              Download
                            </a>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : files.length > 0 ? (
                <ul className="selected-list">
                  {files.map((file) => (
                    <li key={`${file.name}-${file.size}`}>
                      <ImagePlus size={16} aria-hidden="true" />
                      <span>{file.name}</span>
                      <span>{formatBytes(file.size)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No images selected.</p>
              )}
            </div>
          </div>

          <aside className="options-panel">
            <div className="panel-header">
              <h2>
                <Settings2 size={18} aria-hidden="true" />
                Options
              </h2>
            </div>

            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                max={8000}
                value={options.width}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    width: Number(event.target.value)
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
                disabled={options.lossless}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    quality: Number(event.target.value)
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Concurrency (blank means auto)</span>
              <input
                type="number"
                min={1}
                max={8}
                value={options.concurrency}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    concurrency:
                      event.target.value === "" ? "" : Number(event.target.value)
                  }))
                }
              />
            </label>

            <label className="check-field">
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

            <label className="check-field">
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

            <label className="check-field">
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

            <button
              className="primary-button"
              type="button"
              onClick={submit}
              disabled={files.length === 0 || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : null}
              Convert
            </button>

            {job && hasSuccessfulFiles ? (
              <a className="zip-button" href={`/api/jobs/${job.id}/download`}>
                <FileArchive size={18} aria-hidden="true" />
                Download ZIP
              </a>
            ) : null}
          </aside>
        </section>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Wire component into the page**

Replace `src/app/page.tsx` with:

```tsx
import { OptimizerApp } from "@/components/OptimizerApp";

export default function HomePage() {
  return <OptimizerApp />;
}
```

- [ ] **Step 4: Replace global CSS**

Replace `src/app/globals.css` with:

```css
:root {
  color-scheme: light;
  --background: #f7f8fa;
  --surface: #ffffff;
  --surface-muted: #f0f3f6;
  --text: #17202a;
  --muted: #657386;
  --border: #d8dee7;
  --accent: #0f766e;
  --accent-strong: #0b5f59;
  --danger: #b42318;
  --success: #147a3f;
  --warning: #9a6700;
  --shadow: 0 14px 34px rgba(24, 36, 51, 0.09);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

button,
input {
  font: inherit;
}

a {
  color: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.page-shell {
  min-height: 100vh;
  padding: 32px;
}

.workspace {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.app-header h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.1;
}

.app-header p {
  margin: 8px 0 0;
  color: var(--muted);
}

.port-badge {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 13px;
}

.tool-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: start;
}

.main-column {
  display: grid;
  gap: 16px;
}

.dropzone,
.file-panel,
.options-panel,
.notice {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.dropzone {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  border-style: dashed;
  color: var(--muted);
  text-align: center;
}

.dropzone strong {
  color: var(--text);
  font-size: 20px;
}

.notice {
  padding: 12px 14px;
}

.notice.danger {
  color: var(--danger);
}

.file-panel,
.options-panel {
  padding: 18px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-header h2 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 18px;
}

.ghost-button,
.icon-link,
.zip-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border-radius: 8px;
  text-decoration: none;
  white-space: nowrap;
}

.ghost-button {
  background: var(--surface-muted);
  color: var(--muted);
  padding: 0 12px;
}

.primary-button,
.zip-button {
  width: 100%;
  padding: 0 14px;
  background: var(--accent);
  color: white;
  font-weight: 700;
}

.zip-button {
  margin-top: 10px;
  background: var(--accent-strong);
}

.icon-link {
  color: var(--accent-strong);
  font-weight: 700;
}

.file-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.file-table th,
.file-table td {
  border-top: 1px solid var(--border);
  padding: 12px 8px;
  text-align: left;
  vertical-align: middle;
}

.file-table th {
  color: var(--muted);
  font-weight: 700;
}

.file-name,
.file-error {
  display: block;
}

.file-error {
  margin-top: 4px;
  color: var(--danger);
  font-size: 12px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.status-pill.done {
  background: #e8f5ed;
  color: var(--success);
}

.status-pill.failed {
  background: #fdecec;
  color: var(--danger);
}

.status-pill.processing {
  background: #fff6df;
  color: var(--warning);
}

.selected-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.selected-list li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border-top: 1px solid var(--border);
  padding: 10px 0;
}

.empty-state,
.muted {
  color: var(--muted);
}

.options-panel {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 20px;
}

.field,
.check-field {
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-size: 14px;
}

.field input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--text);
}

.check-field {
  grid-template-columns: 18px 1fr;
  align-items: center;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 920px) {
  .tool-layout {
    grid-template-columns: 1fr;
  }

  .options-panel {
    position: static;
  }
}

@media (max-width: 720px) {
  .page-shell {
    padding: 16px;
  }

  .app-header {
    display: grid;
  }

  .file-table {
    display: block;
    overflow-x: auto;
  }
}
```

- [ ] **Step 5: Verify UI compiles**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected:

```text
# no TypeScript errors
# Next.js build completes successfully
```

- [ ] **Step 6: Commit UI**

Run:

```bash
git add src/components/OptimizerApp.tsx src/lib/client/format.ts src/app/page.tsx src/app/globals.css
git commit -m "feat: add optimizer interface"
```

## Task 8: README And End-To-End Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add README**

Create `README.md`:

```md
# Blog WebP Optimizer

Local localhost WebP conversion for blog images.

## What It Does

- Converts `jpg`, `jpeg`, `png`, and `webp` images to WebP
- Supports multiple files at once
- Resizes to width `1280` by default without enlarging smaller images
- Uses WebP quality `82` by default
- Auto-orients images by default
- Strips metadata by default
- Provides individual WebP downloads and a ZIP download
- Runs locally on `127.0.0.1:9732`

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer

## Run

```bash
pnpm install
pnpm dev
```

Open:

```text
http://127.0.0.1:9732
```

## Test

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Notes

This is a local tool. Images are uploaded only to the local Next.js server running on this machine. Temporary job files are written under `tmp/jobs` and are ignored by git.
```

- [ ] **Step 2: Run full automated verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected:

```text
Test Files  5 passed
# no TypeScript errors
# Next.js build completes successfully
```

- [ ] **Step 3: Start local dev server**

Run:

```bash
pnpm dev
```

Expected:

```text
Local: http://127.0.0.1:9732
```

Keep the session running for the next steps.

- [ ] **Step 4: Verify HTTP bind**

In another shell, run:

```bash
curl -I http://127.0.0.1:9732
```

Expected:

```text
HTTP/1.1 200 OK
```

- [ ] **Step 5: Verify browser workflow manually**

Open `http://127.0.0.1:9732` in a browser and verify:

- The first screen is the converter UI.
- Dragging multiple images into the dropzone lists files.
- Clicking Convert creates a job.
- Each successful file shows a Download button.
- Download ZIP appears when at least one file succeeds.
- Unsupported files are rejected before upload.
- The browser page has no overlapping text at desktop width and mobile width.

- [ ] **Step 6: Commit documentation**

Run:

```bash
git add README.md
git commit -m "docs: add usage instructions"
```

## Task 9: Publish Public GitHub Repository

**Files:**
- Modify: git remote configuration

- [ ] **Step 1: Confirm clean working tree**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main
```

- [ ] **Step 2: Confirm GitHub auth**

Run:

```bash
gh auth status
```

Expected:

```text
Logged in to github.com account Strongorange
```

- [ ] **Step 3: Create and push public repository**

Run:

```bash
gh repo create Strongorange/blog-webp-optimizer --public --source=. --remote=origin --push
```

Expected:

```text
https://github.com/Strongorange/blog-webp-optimizer
```

- [ ] **Step 4: Verify clone URL**

Run:

```bash
git remote -v
gh repo view Strongorange/blog-webp-optimizer --json nameWithOwner,visibility,url --jq '.nameWithOwner + " " + .visibility + " " + .url'
```

Expected:

```text
origin  git@github.com:Strongorange/blog-webp-optimizer.git (fetch)
origin  git@github.com:Strongorange/blog-webp-optimizer.git (push)
Strongorange/blog-webp-optimizer PUBLIC https://github.com/Strongorange/blog-webp-optimizer
```

## Final Verification Checklist

Run these commands before calling implementation complete:

```bash
pnpm test
pnpm typecheck
pnpm build
git status --short --branch
```

Expected:

```text
Test Files  5 passed
# no TypeScript errors
# Next.js build completes successfully
## main
```

Start the app:

```bash
pnpm dev
```

Verify:

```bash
curl -I http://127.0.0.1:9732
```

Expected:

```text
HTTP/1.1 200 OK
```
