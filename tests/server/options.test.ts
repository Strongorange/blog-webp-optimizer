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
