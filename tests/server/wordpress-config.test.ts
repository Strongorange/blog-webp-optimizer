import { describe, expect, it } from "vitest";
import { getWordPressConfig, hasWordPressConfig } from "@/lib/server/wordpress-config";

describe("wordpress config", () => {
  it("returns null when required env values are missing", () => {
    expect(
      getWordPressConfig({
        WORDPRESS_URL: "https://strongorange.net",
        WORDPRESS_USERNAME: "strongorange"
      })
    ).toBeNull();
  });

  it("normalizes configured values", () => {
    expect(
      getWordPressConfig({
        WORDPRESS_URL: "https://strongorange.net/",
        WORDPRESS_USERNAME: " strongorange ",
        WORDPRESS_APP_PASSWORD: "abcd efgh ijkl mnop qrst uvwx"
      })
    ).toEqual({
      siteUrl: "https://strongorange.net",
      username: "strongorange",
      appPassword: "abcdefghijklmnopqrstuvwx"
    });
  });

  it("rejects invalid urls", () => {
    expect(
      getWordPressConfig({
        WORDPRESS_URL: "not a url",
        WORDPRESS_USERNAME: "strongorange",
        WORDPRESS_APP_PASSWORD: "abcd"
      })
    ).toBeNull();
  });

  it("reports whether config exists", () => {
    expect(
      hasWordPressConfig({
        WORDPRESS_URL: "https://strongorange.net",
        WORDPRESS_USERNAME: "strongorange",
        WORDPRESS_APP_PASSWORD: "abcd"
      })
    ).toBe(true);
    expect(hasWordPressConfig({})).toBe(false);
  });
});
