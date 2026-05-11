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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
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

  it("returns a failed result when WordPress returns successful non-object JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(null), {
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

  it("returns a failed result when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));

    await expect(uploadWordPressMediaFile(config, uploadFile())).resolves.toEqual({
      fileId: "file-1",
      status: "failed",
      error: "Network unavailable"
    });
  });

  it("encodes attachment filenames in the upload headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 123, source_url: "https://example.com/reef.webp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await uploadWordPressMediaFile(config, uploadFile({ filename: "reef image.webp" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Disposition": 'attachment; filename="reef%20image.webp"'
        })
      })
    );
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

  it("limits concurrent uploads to two files and preserves result order", async () => {
    const responses = [
      deferred<Response>(),
      deferred<Response>(),
      deferred<Response>()
    ];
    const started = [deferred<void>(), deferred<void>(), deferred<void>()];
    let activeFetches = 0;
    let maxActiveFetches = 0;
    let callIndex = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const index = callIndex;
        callIndex += 1;
        activeFetches += 1;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
        started[index].resolve();

        try {
          return await responses[index].promise;
        } finally {
          activeFetches -= 1;
        }
      })
    );

    const uploadPromise = uploadWordPressMediaFiles(config, [
      uploadFile({ fileId: "a", filename: "a.webp" }),
      uploadFile({ fileId: "b", filename: "b.webp" }),
      uploadFile({ fileId: "c", filename: "c.webp" })
    ]);

    await Promise.all([started[0].promise, started[1].promise]);
    expect(activeFetches).toBe(2);
    expect(maxActiveFetches).toBe(2);
    expect(callIndex).toBe(2);

    responses[0].resolve(
      new Response(JSON.stringify({ id: 1, source_url: "https://example.com/a.webp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );

    await started[2].promise;
    expect(maxActiveFetches).toBe(2);

    responses[2].resolve(
      new Response(JSON.stringify({ id: 3, source_url: "https://example.com/c.webp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    responses[1].resolve(
      new Response(JSON.stringify({ id: 2, source_url: "https://example.com/b.webp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );

    const results = await uploadPromise;

    expect(maxActiveFetches).toBe(2);
    expect(results.map((result) => result.fileId)).toEqual(["a", "b", "c"]);
    expect(results.map((result) => result.status)).toEqual(["uploaded", "uploaded", "uploaded"]);
  });
});
