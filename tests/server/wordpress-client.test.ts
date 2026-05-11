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
