/**
 * Single source of truth for Floom's public origin.
 *
 * SITE_URL   — build-time constant used in metadata, sitemaps, and JSON-LD.
 * siteOrigin — runtime resolver that honours env overrides, falling back to
 *              SITE_URL. Resolution order:
 *                FLOOM_ORIGIN > NEXT_PUBLIC_FLOOM_ORIGIN > NEXT_PUBLIC_APP_URL > SITE_URL
 *
 * Both are re-exported from here so every callsite imports from a single
 * location instead of redefining the string or the resolver inline.
 */

export const SITE_URL = "https://floom.dev";

function cleanOrigin(rawOrigin: string | undefined): string | null {
  if (!rawOrigin) return null;
  try {
    const parsed = new URL(rawOrigin);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function siteOrigin(): string {
  return (
    cleanOrigin(process.env.FLOOM_ORIGIN) ??
    cleanOrigin(process.env.NEXT_PUBLIC_FLOOM_ORIGIN) ??
    cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    SITE_URL
  );
}
