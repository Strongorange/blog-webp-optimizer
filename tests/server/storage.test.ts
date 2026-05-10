import path from "node:path";
import { describe, expect, it } from "vitest";
import { TMP_JOBS_ROOT } from "@/lib/server/constants";
import { getJobPaths, removeJobDir } from "@/lib/server/storage";

describe("job storage paths", () => {
  it("rejects path traversal job ids", () => {
    expect(() => getJobPaths("../../somewhere")).toThrow(/Invalid job id/);
  });

  it("keeps job paths inside the temporary jobs root", () => {
    const paths = getJobPaths("job-1");
    const root = path.resolve(TMP_JOBS_ROOT);

    expect(paths.jobDir).toBe(path.join(root, "job-1"));
    expect(paths.inputDir.startsWith(`${root}${path.sep}`)).toBe(true);
    expect(paths.outputDir.startsWith(`${root}${path.sep}`)).toBe(true);
  });

  it("rejects path traversal ids before removing job directories", async () => {
    await expect(removeJobDir("../../somewhere")).rejects.toThrow(/Invalid job id/);
  });
});
