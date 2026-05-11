# WordPress Media Upload Design

## Summary

Add a small WordPress upload layer to `blog-webp-optimizer` so converted WebP files can be uploaded from the local app to the WordPress media library. The feature stays focused on media upload only: it does not edit posts, insert blocks into drafts, or introduce a Cloudflare proxy.

The app remains an on-demand localhost tool. WordPress credentials are read only by local Next.js server routes from `.env.local`; they are never exposed to browser JavaScript.

## Goals

- Upload converted WebP outputs to the WordPress media library.
- Support both per-file upload and batch upload from successful conversion results.
- Show upload status per converted file.
- Return and display the WordPress attachment ID and media URL for each successful upload.
- Provide a simple `Copy all URLs` action after upload.
- Keep the implementation local-first and clone-friendly.
- Document required WordPress Application Password settings.

## Non-Goals

- No automatic post or draft editing.
- No Gutenberg block insertion.
- No automatic alt text, caption, or title generation in the first version.
- No WordPress plugin.
- No Cloudflare Worker proxy.
- No Cloudflare Secrets Store integration in this version.
- No image conversion inside WordPress.
- No ZIP upload to WordPress.

## Recommended Approach

Use the existing Next.js app and add a local server-side API route:

```text
POST /api/wordpress/upload
```

The route receives a `jobId` and a list of converted `fileIds`, reads the corresponding WebP outputs from `tmp/jobs`, then uploads each file to:

```text
POST <WORDPRESS_URL>/wp-json/wp/v2/media
```

Authentication uses WordPress Application Password over Basic Auth. Credentials are stored in `.env.local`:

```env
WORDPRESS_URL=https://strongorange.net
WORDPRESS_USERNAME=your-wordpress-username
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

This approach is preferred because it preserves the local tool model, avoids exposing credentials to the browser, and avoids adding a network proxy just to hide secrets.

Rejected alternatives:

- Cloudflare Worker proxy with Workers Secrets or Secrets Store: useful for hosted services, but adds another deployed component and routes image uploads through Cloudflare.
- OS keychain or password manager CLI: stronger local secret storage, but too much setup for the first upload MVP.
- WordPress-side conversion plugin: automates uploads inside WordPress, but loses the local conversion policy and increases server-side complexity.

## Cloudflare Secret Management Decision

Cloudflare provides secret-management options, but they are not the right first step for this local-only feature.

- Workers Secrets are scoped to a Worker and are available as Worker bindings at runtime.
- Cloudflare Secrets Store is closer to AWS Secrets Manager because it can hold account-level secrets and bind them to Workers. It is still a Cloudflare Worker-centered model.
- The local Next.js app cannot directly consume Cloudflare Secrets Store without introducing a Cloudflare Worker or API integration layer.
- Routing media uploads through a Worker would weaken the current local-first privacy model because converted files would pass through an additional cloud service.

Decision: use `.env.local` for the MVP and document that the WordPress Application Password should be created for a limited WordPress user and revoked if exposed.

## Configuration

Required environment variables:

- `WORDPRESS_URL`: the WordPress site origin, for example `https://strongorange.net`.
- `WORDPRESS_USERNAME`: the WordPress username that owns the Application Password.
- `WORDPRESS_APP_PASSWORD`: the generated WordPress Application Password.

The app should provide a safe disabled state when required variables are missing:

- Hide or disable WordPress upload controls.
- Show a short setup message in the UI.
- Keep conversion and downloads fully usable.

## API Design

### `GET /api/wordpress/status`

Purpose: let the browser know whether WordPress upload is configured without exposing secrets.

Response when configured:

```json
{
  "configured": true,
  "siteUrl": "https://strongorange.net"
}
```

Response when not configured:

```json
{
  "configured": false
}
```

### `POST /api/wordpress/upload`

Purpose: upload one or more successful converted files from an existing conversion job.

Request body:

```json
{
  "jobId": "job-id",
  "fileIds": ["file-id-1", "file-id-2"]
}
```

Validation:

- Reject when WordPress env vars are missing.
- Reject cross-origin requests using the same local request guard as `/api/jobs`.
- Reject missing jobs.
- Reject unknown file IDs.
- Reject files that are not `done`.
- Reject files whose output artifact is missing.
- Limit request size by accepting IDs only, never raw file data from the browser.

Response:

```json
{
  "results": [
    {
      "fileId": "file-id-1",
      "status": "uploaded",
      "attachmentId": 123,
      "url": "https://strongorange.net/wp-content/uploads/2026/05/image.webp"
    },
    {
      "fileId": "file-id-2",
      "status": "failed",
      "error": "WordPress rejected the upload."
    }
  ]
}
```

The route should return `200` when the request was processed, even if some files failed. Use `4xx` only for request-level failures such as missing configuration, missing job, invalid body, or no eligible files.

## WordPress Upload Behavior

For each file:

- Read the converted WebP output from disk.
- Send it as the request body to `/wp-json/wp/v2/media`.
- Set `Content-Type: image/webp`.
- Set `Content-Disposition: attachment; filename="<safeOutputName>"`.
- Use Basic Auth with `WORDPRESS_USERNAME` and `WORDPRESS_APP_PASSWORD`.
- Parse WordPress response fields `id` and `source_url` as the attachment ID and media URL.

The first version should not set alt text, caption, or title separately. WordPress can infer an attachment title from the filename, and richer metadata can be added later.

Batch upload should use bounded concurrency:

```text
default: 2 concurrent WordPress uploads
maximum: 3 concurrent WordPress uploads
```

This protects the WordPress/PHP side from accidental bursts.

## UI Design

Only show WordPress upload controls after a conversion job has at least one successful file.

Per-file row additions:

- Upload status: `Ready`, `Uploading`, `Uploaded`, or `Failed`.
- `Upload` button for each successful file.
- WordPress media URL after success.
- `Copy URL` button after success.

Batch controls:

- `Upload all to WordPress`
- `Retry failed`
- `Copy all URLs`

The upload controls should sit near the existing download actions, but they should not replace download buttons. Local download remains the core fallback.

If WordPress is not configured:

- Show a compact message such as `WordPress upload is not configured. Add .env.local to enable it.`
- Do not block conversion or downloads.

## Data Flow

```text
User converts files
→ Job reaches done or partial
→ UI checks GET /api/wordpress/status
→ User clicks Upload or Upload all
→ Browser sends jobId and fileIds to POST /api/wordpress/upload
→ Local server reads converted WebP files from tmp/jobs
→ Local server uploads each file to WordPress REST API
→ Local server returns per-file upload results
→ UI shows attachment IDs and URLs
→ User copies URLs for writing workflow
```

## Error Handling

Expected request-level errors:

- WordPress upload is not configured.
- Conversion job not found.
- No eligible converted files selected.
- Cross-origin request rejected.
- Invalid request body.

Expected per-file errors:

- Converted file missing from disk.
- WordPress authentication failed.
- WordPress rejected media upload.
- WordPress returned invalid JSON.
- Network timeout or connection failure.

Per-file errors should not stop the whole batch. The UI should preserve successful uploads and allow retrying only failed files.

## Security

- Never expose `WORDPRESS_APP_PASSWORD` to browser code.
- Add `.env.local` to `.gitignore`; it is already ignored.
- Reuse the local request guard to reject cross-origin upload requests.
- Recommend a dedicated WordPress user with the minimum role required to upload media.
- Recommend revoking and recreating the Application Password if it is exposed.
- Do not log the Authorization header or Application Password.
- Do not accept arbitrary local file paths from the browser; accept only `jobId` and `fileIds`.

## Testing

Unit and route tests:

- WordPress status returns configured and unconfigured states without exposing secrets.
- Upload route rejects missing env.
- Upload route rejects cross-origin requests.
- Upload route rejects missing jobs.
- Upload route rejects non-done files.
- Upload route handles missing output artifacts.
- Upload route sends expected headers and body to WordPress.
- Upload route returns per-file success and failure results.
- Batch upload respects bounded concurrency.

Manual verification:

- Configure `.env.local` with a WordPress Application Password.
- Convert two images.
- Upload one image to WordPress.
- Upload all successful images.
- Confirm media items appear in WordPress Media Library.
- Confirm returned URLs open publicly.
- Confirm `Copy all URLs` provides the uploaded media URLs.

## Open Extension Points

These are intentionally deferred:

- Configurable `WORDPRESS_UPLOAD_CONCURRENCY` environment variable.
- Alt text/title/caption fields.
- Copy Markdown image list.
- Copy HTML image tags.
- Insert uploaded images into a draft post.
- Cloudflare Worker proxy using Workers Secrets or Secrets Store.
- Dedicated WordPress plugin.
