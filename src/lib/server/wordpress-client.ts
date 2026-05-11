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
      body: file.buffer as unknown as BodyInit
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
