const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolveMcpForwardOrigin(requestUrl: string): string | null {
  const localOrigin = localRequestOrigin(requestUrl);
  if (localOrigin && process.env.NODE_ENV !== "production") {
    return localOrigin;
  }

  // On Vercel preview deploys prefer the request's own origin so MCP calls
  // stay inside the deploy under test. The configured FLOOM_ORIGIN points at
  // production which may lack the new routes/runtime that the preview is
  // shipping, breaking preview-side verification.
  if (process.env.VERCEL_ENV === "preview") {
    const requestOrigin = sameOriginAsRequest(requestUrl);
    if (requestOrigin) {
      return requestOrigin;
    }
  }

  return configuredFloomOrigin();
}

function sameOriginAsRequest(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredFloomOrigin(): string | null {
  const rawOrigin =
    process.env.FLOOM_ORIGIN ||
    process.env.NEXT_PUBLIC_FLOOM_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!rawOrigin) {
    return null;
  }

  try {
    const origin = new URL(rawOrigin);
    if (!["https:", "http:"].includes(origin.protocol)) {
      return null;
    }

    return origin.origin;
  } catch {
    return null;
  }
}

function localRequestOrigin(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    return LOCAL_HOSTS.has(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}
