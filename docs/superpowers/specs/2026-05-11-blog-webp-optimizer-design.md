# Blog WebP Optimizer Design

## Summary

`blog-webp-optimizer` is a local-only WebP conversion tool for blog images. It runs as a Next.js app on `http://localhost:9732` and provides a familiar web converter workflow: drag and drop or select multiple images, choose conversion options, process them locally with `sharp`, then download each converted file or all results as a ZIP.

The first version is optimized for repeated blog publishing work rather than broad file conversion. It avoids external upload services, cloud storage, accounts, Docker commands, and folder path entry.

## Goals

- Create a public GitHub repository at `Strongorange/blog-webp-optimizer`.
- Make the project usable after clone with:

  ```bash
  pnpm install
  pnpm dev
  ```

- Run the local UI at `http://localhost:9732`.
- Support multiple image uploads through drag and drop and file picker.
- Convert `jpg`, `jpeg`, `png`, and `webp` inputs to WebP.
- Provide per-file download buttons and an all-results ZIP download.
- Resize images to a default width of `1280` without enlarging smaller originals.
- Use default WebP quality `82`.
- Auto-orient images by default.
- Strip metadata by default, with a user option to preserve metadata.
- Process multiple images concurrently with a safe automatic default.

## Non-Goals

- No Docker-based user workflow.
- No folder path entry.
- No automatic saving beside the original source files.
- No cloud uploads, Dropbox, Google Drive, OneDrive, URL import, login, account, or history.
- No image editing beyond resize, orientation, metadata handling, and WebP output.
- No broad format support beyond `jpg`, `jpeg`, `png`, and `webp` in the first version.
- No Electron or Tauri packaging in the first version.

## Recommended Approach

Use a single Next.js application with server-side image processing APIs. This keeps the project easy to clone, run, and maintain while still providing a normal browser-based UX.

This is a local Node.js application, not a serverless deployment target. Route handlers that touch the filesystem, run `sharp`, manage in-memory job state, or generate ZIP files must use the Node runtime.

Rejected alternatives:

- Express plus Vite split app: clearer separation, but more moving parts for a personal local tool.
- Electron-first desktop app: better native file dialogs, but introduces packaging and native module complexity too early.
- Docker-only wrapper: reuses the old image, but still leaves a rough command-driven workflow.

## Architecture

```text
Next.js App
├─ Web UI
│  ├─ Dropzone / file picker
│  ├─ selected file list
│  ├─ conversion options panel
│  ├─ file status and error display
│  ├─ per-file download buttons
│  └─ all-results ZIP download button
├─ API Routes
│  ├─ POST /api/jobs
│  │  └─ receive multipart upload and create a conversion job
│  ├─ GET /api/jobs/:id
│  │  └─ return job status and per-file results
│  ├─ GET /api/jobs/:id/files/:fileId
│  │  └─ download one converted WebP file
│  └─ GET /api/jobs/:id/download
│     └─ download all successful outputs as a ZIP
└─ Image Engine
   ├─ validate input file type
   ├─ normalize safe filenames
   ├─ auto-orient
   ├─ resize
   ├─ convert to WebP
   ├─ strip or preserve metadata
   ├─ process files with bounded concurrency
   └─ clean temporary job files
```

## UI Design

The first screen is the tool itself, not a marketing page.

Primary areas:

- Upload area: large drag-and-drop target with a file picker button.
- Options panel: compact controls for blog-friendly defaults.
- Job table: one row per file with original name, status, output size, reduction, error, and download action.
- Download area: enabled when at least one file succeeds.

Default options:

- Width: `1280`
- Quality: `82`
- Auto orient: enabled
- Strip metadata: enabled
- Lossless WebP: disabled
- Concurrency: auto

The UI should expose advanced options without making the common path noisy. Height control is not required in the first version.

## Data Flow

```text
User selects or drops files
→ Client validates extension and basic limits
→ Client sends multipart POST /api/jobs
→ Server creates tmp/jobs/<jobId>/
→ Server writes uploaded originals under the job folder
→ Server processes files through the image engine
→ Client polls GET /api/jobs/:id
→ User downloads individual files or ZIP
→ Server cleans old temporary jobs
```

## File Handling

Accepted inputs:

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

Output:

- Every successful result is a `.webp` file.
- Output filenames are derived from the original name but sanitized.
- Duplicate output names receive a stable suffix.
- Failed files do not block successful files.
- ZIP download includes successful outputs only.

Temporary storage:

- Use a project-local `tmp/jobs/<jobId>/` directory.
- Store originals and outputs in separate subdirectories.
- Clean stale jobs at app startup.
- Clean completed jobs after a retention window of `1 hour`.

## Conversion Behavior

Use `sharp` for image processing.

Default pipeline:

```text
input
→ rotate/auto-orient
→ resize({ width: 1280, fit: "inside", withoutEnlargement: true })
→ webp({ quality: 82 })
→ output
```

Metadata:

- Strip metadata by default by relying on sharp output defaults.
- If the user disables metadata stripping, preserve metadata with `keepMetadata()`.

Lossless:

- Lossless WebP is optional and off by default.
- When enabled, quality control may be visually de-emphasized because lossless mode changes the compression tradeoff.

## Concurrency

Use a bounded file-level queue.

Default:

```text
min(max(cpuCount - 1, 1), 4)
```

The user may adjust concurrency in the UI, but the default should be stable on normal laptops and small servers. The implementation should avoid launching one sharp pipeline per file without a limit.

## Error Handling

Jobs are resilient at file level:

- One failed image does not fail the entire batch.
- Each file has its own status: `queued`, `processing`, `done`, or `failed`.
- The UI shows a short actionable error per failed file.

Representative errors:

- Unsupported file type
- Empty upload
- File too large
- Too many files
- Corrupt image
- Sharp conversion failure
- ZIP generation failure
- Temporary storage failure

## Safety

- Bind development server to `127.0.0.1:9732` by default.
- Do not expose a public listener.
- Do not trust uploaded filenames for filesystem paths.
- Normalize filenames before writing.
- Keep each job in an isolated temporary directory.
- Do not read arbitrary local paths from user input.
- Enforce file count and size limits in both client and server.
- Default to metadata stripping for privacy and smaller output.

Initial limits:

- Maximum files per job: `50`
- Maximum size per file: `25MB`

These limits can be made configurable later.

## Testing

Minimum verification:

- `pnpm dev` starts the app on `127.0.0.1:9732`.
- A JPG converts to WebP.
- A PNG converts to WebP.
- A WebP input can be resized/re-encoded as WebP.
- Width `1280` does not enlarge smaller originals.
- Metadata stripping is enabled by default.
- Metadata preservation works when selected.
- Multiple files process concurrently and complete.
- Partial failure keeps successful outputs downloadable.
- Individual download returns a valid WebP.
- ZIP download includes successful outputs only.
- Stale temporary jobs are cleaned.

## Repository And Delivery

The project should live in:

```text
/root/my-pjts/ocean-blog-root/blog-webp-optimizer
```

The intended public GitHub repository is:

```text
Strongorange/blog-webp-optimizer
```

The repository should be clone-friendly and include concise setup instructions in its README during implementation.
