import { NextResponse, type NextRequest } from "next/server";

// Auth-gate redirect at the edge — issues a clean HTTP 307 to /login when an
// unauthenticated request hits a gated route. Server-component `redirect()`
// from `/tokens/page.tsx` works for browsers (they handle the RSC payload)
// but curl + crawlers see HTTP 200 with redirect logic in the payload, which
// the audit caught. Proxy runs before the page handler, then the server
// component re-validates the session.
//
// Detection: Supabase SSR sets one of two cookies — `sb-<project>-auth-token`
// or a chunked variant. We don't validate the JWT here (avoid the round-trip
// on every request), we just check presence. The page-level
// `auth.getSession()` does the real validation.

const SUPABASE_AUTH_COOKIE_PREFIX = "sb-";
const SUPABASE_AUTH_COOKIE_SUFFIX = "-auth-token";

const GATED_PATHS = new Set<string>(["/tokens"]);

// Public paths that serve the same HTML to every visitor and must be CDN-cached.
// Nonce-based CSP generates a unique nonce per request, which causes Next.js to
// embed the nonce in the link preload headers it generates for these routes.
// Because the nonce changes on every request, the response differs each time and
// Vercel cannot serve a cached copy — effectively disabling ISR for these pages.
//
// For these paths we use a static CSP (no per-request nonce). 'strict-dynamic'
// is retained to block dynamically-injected scripts; 'unsafe-inline' is added
// for the inline JSON-LD script that Next.js cannot hash at build time.
// This is the correct trade-off: ISR performance gains outweigh the marginal
// per-request nonce benefit on pages that are public anyway.
const CDN_CACHEABLE_PATH_PREFIXES: string[] = ["/p/"];

function isCdnCacheablePath(pathname: string): boolean {
  return CDN_CACHEABLE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function hasSupabaseSession(req: NextRequest): boolean {
  for (const cookie of req.cookies.getAll()) {
    if (
      cookie.name.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) &&
      cookie.name.includes(SUPABASE_AUTH_COOKIE_SUFFIX) &&
      cookie.value.length > 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Build a per-request nonce-based Content-Security-Policy header.
 *
 * script-src uses 'nonce-XXX' + 'strict-dynamic' so Next.js runtime chunks
 * and inline bootstrap scripts are all covered. 'unsafe-inline' and
 * 'unsafe-eval' are intentionally absent in production.
 *
 * 'unsafe-eval' is added in development because React uses eval() to
 * reconstruct server-side error stacks in the browser for debugging.
 *
 * style-src keeps 'unsafe-inline' because Tailwind CSS injects inline styles
 * at runtime — this is accepted scope (DOM XSS surface, not script execution).
 *
 * Next.js 16 automatically reads the nonce from the CSP header value
 * (pattern: 'nonce-{value}') and attaches it to all framework scripts,
 * hydration chunks, and inline scripts it generates.
 */
function buildNoncedCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.composio.dev",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.vercel.app https://*.sentry.io https://*.ingest.sentry.io https://va.vercel-scripts.com",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Static CSP for CDN-cached public pages.
 *
 * Nonce-based CSP is incompatible with CDN caching: the per-request nonce causes
 * Next.js to embed it in link preload headers, making every response unique.
 * For pages that serve identical HTML to every visitor, a static CSP that omits
 * the nonce allows Vercel's edge to cache and serve PRERENDER/ISR responses.
 *
 * 'unsafe-inline' is required for the inline JSON-LD <script type="application/ld+json">
 * that Next.js cannot hash at build time (content is per-slug). Data-block scripts
 * (type != text/javascript) don't execute as JS but are still covered by script-src.
 */
function buildStaticCsp(): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} 'strict-dynamic' https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.composio.dev",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.vercel.app https://*.sentry.io https://*.ingest.sentry.io https://va.vercel-scripts.com",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth-gate: redirect unauthenticated requests on gated paths before
  // adding the CSP, so we don't waste a nonce on a redirect response.
  if (GATED_PATHS.has(pathname) && !hasSupabaseSession(req)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl, 307);
  }

  // CDN-cacheable public pages use a static CSP (no per-request nonce).
  // All other pages use a per-request nonce for maximum XSS protection.
  if (isCdnCacheablePath(pathname)) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", buildStaticCsp());
    return res;
  }

  // Generate a fresh nonce for every page request.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildNoncedCsp(nonce);

  // Forward the nonce to Server Components via request header so layout.tsx
  // and any page component can read it with headers().get('x-nonce') when
  // they need to attach a nonce prop to an additional inline <script>.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  // Set CSP on the response so the browser enforces it.
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    /*
     * Run on all page requests. Exclude:
     * - _next/static  — immutable static assets, no CSP needed
     * - _next/image   — image optimisation service
     * - favicon.ico, icon.svg, apple-icon, opengraph-image — static resources
     * - api/ routes   — CSP is not meaningful for JSON API responses
     *
     * Prefetch requests (next-router-prefetch / purpose: prefetch) are
     * excluded so we don't burn a nonce on RSC payload fetches.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon|opengraph-image|api/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
