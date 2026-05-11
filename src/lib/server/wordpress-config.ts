export interface WordPressConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

interface WordPressEnv {
  [key: string]: string | undefined;
  WORDPRESS_URL?: string;
  WORDPRESS_USERNAME?: string;
  WORDPRESS_APP_PASSWORD?: string;
}

function normalizedValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getWordPressConfig(env: WordPressEnv = process.env): WordPressConfig | null {
  const rawUrl = normalizedValue(env.WORDPRESS_URL);
  const username = normalizedValue(env.WORDPRESS_USERNAME);
  const appPassword = normalizedValue(env.WORDPRESS_APP_PASSWORD).replace(/\s+/g, "");

  if (!rawUrl || !username || !appPassword) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return {
      siteUrl: url.origin,
      username,
      appPassword
    };
  } catch {
    return null;
  }
}

export function hasWordPressConfig(env: WordPressEnv = process.env): boolean {
  return getWordPressConfig(env) !== null;
}
