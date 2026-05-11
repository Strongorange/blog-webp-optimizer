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
- Optionally uploads converted WebP files to WordPress Media Library
- Limits each job to 50 files and each file to 25MB
- Runs locally on `127.0.0.1:9732`

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer

If pnpm is not available yet, enable it through Corepack:

```bash
corepack enable
```

## Run

```bash
pnpm install
pnpm dev
```

Open:

```text
http://127.0.0.1:9732
```

For a production-mode local run:

```bash
pnpm build
pnpm start
```

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

## Stop

Stop the local server with `Ctrl-C` in the terminal running `pnpm dev` or
`pnpm start`.

This app is intended as an on-demand localhost utility. It does not need to run
as a long-lived service on a remote server.

## Test

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Verification

The current implementation was checked with:

- `pnpm test`: 10 files and 46 tests passed
- `pnpm typecheck`: passed
- `pnpm build`: passed
- `curl -I http://127.0.0.1:9732`: returned `HTTP/1.1 200 OK`
- Browser workflow: multiple images selected, unsupported files rejected before upload, conversions completed, individual WebP downloads worked, and ZIP download contained the converted files

## Notes

This is a local-first tool. Images are processed by the local Next.js server
running on this machine, and WordPress upload happens only when explicitly
configured and clicked. Uploaded originals and converted outputs are written
under `tmp/jobs/<jobId>/input` and `tmp/jobs/<jobId>/output`; `tmp/jobs` is
ignored by git. Job files expire after about one hour and the temp directory is
also cleaned when the server starts.
