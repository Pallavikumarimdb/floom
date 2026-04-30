const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolveMcpForwardOrigin(requestUrl: string): string | null {
  const localOrigin = localRequestOrigin(requestUrl);
  if (localOrigin && process.env.NODE_ENV !== "production") {
    return localOrigin;
  }

  return configuredFloomOrigin();
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
