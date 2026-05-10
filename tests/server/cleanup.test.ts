import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globalCleanup = globalThis as typeof globalThis & {
  __blogWebpOptimizerStartupCleanupPromise?: Promise<void>;
};

describe("cleanup", () => {
  beforeEach(() => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.resetModules();
    vi.doUnmock("node:fs/promises");
  });

  afterEach(() => {
    delete globalCleanup.__blogWebpOptimizerStartupCleanupPromise;
    vi.doUnmock("node:fs/promises");
  });

  it("keeps the startup cleanup promise stable across module reloads", async () => {
    const firstModule = await import("@/lib/server/cleanup");
    const firstPromise = firstModule.runStartupCleanupOnce();

    vi.resetModules();

    const secondModule = await import("@/lib/server/cleanup");
    const secondPromise = secondModule.runStartupCleanupOnce();

    expect(secondPromise).toBe(firstPromise);
    await firstPromise;
  });

  it("clears the startup cleanup promise after rejection so a later call retries", async () => {
    const rm = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary cleanup failure"))
      .mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);

    vi.doMock("node:fs/promises", () => ({
      default: {
        rm,
        mkdir
      }
    }));

    const cleanupModule = await import("@/lib/server/cleanup");

    await expect(cleanupModule.runStartupCleanupOnce()).rejects.toThrow(
      "temporary cleanup failure"
    );
    await expect(cleanupModule.runStartupCleanupOnce()).resolves.toBeUndefined();

    expect(rm).toHaveBeenCalledTimes(2);
    expect(mkdir).toHaveBeenCalledTimes(1);
  });
});
