const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const CONTROL_CHARS = /[\x00-\x1f\x80-\x9f]/g;
const RESERVED_CHARS = /[<>:"/\\|?*]+/g;
const WINDOWS_RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeBaseName(input: string): string {
  const normalized = input.replace(WINDOWS_DRIVE, "").replace(/\\/g, "/");
  const basename = normalized.split("/").filter(Boolean).at(-1) ?? "";
  const extensionIndex = basename.lastIndexOf(".");
  const rawBase =
    extensionIndex > 0
      ? basename.slice(0, extensionIndex)
      : basename.startsWith(".")
        ? ""
        : basename;
  const cleaned = rawBase
    .replace(CONTROL_CHARS, "")
    .replace(RESERVED_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();

  if (cleaned.length === 0) {
    return "image";
  }

  if (WINDOWS_RESERVED_DEVICE_NAME.test(cleaned)) {
    return `image-${cleaned}`;
  }

  return cleaned;
}

export function makeOutputName(originalName: string): string {
  return `${sanitizeBaseName(originalName)}.webp`;
}

export function uniqueOutputNames(originalNames: string[]): string[] {
  const used = new Set<string>();

  return originalNames.map((originalName) => {
    const base = sanitizeBaseName(originalName);
    let suffix = 1;
    let outputName = `${base}.webp`;

    while (used.has(outputName.toLocaleLowerCase("en-US"))) {
      suffix += 1;
      outputName = `${base}-${suffix}.webp`;
    }

    used.add(outputName.toLocaleLowerCase("en-US"));
    return outputName;
  });
}
