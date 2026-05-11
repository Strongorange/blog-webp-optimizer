const TRUSTED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export function isTrustedLocalRequest(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && !TRUSTED_FETCH_SITES.has(secFetchSite)) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
