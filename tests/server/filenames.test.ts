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

  it("prefixes Windows reserved device names with a safe fallback", () => {
    expect(makeOutputName("CON.jpg")).toBe("image-CON.webp");
    expect(makeOutputName("aux.png")).toBe("image-aux.webp");
    expect(makeOutputName("LPT1.webp")).toBe("image-LPT1.webp");
  });

  it("deduplicates output names case-insensitively", () => {
    expect(uniqueOutputNames(["reef.jpg", "REEF.png", "Reef.webp"])).toEqual([
      "reef.webp",
      "REEF-2.webp",
      "Reef-3.webp"
    ]);
  });

  it("deduplicates against existing generated suffixes", () => {
    expect(uniqueOutputNames(["reef.jpg", "reef-2.jpg", "reef.png"])).toEqual([
      "reef.webp",
      "reef-2.webp",
      "reef-3.webp"
    ]);
  });
});
