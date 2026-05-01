import { NextResponse, type NextRequest } from "next/server";

// Auth-gate redirect at the edge — issues a clean HTTP 307 to /login when an
// unauthenticated request hits a gated route. Server-component `redirect()`
// from `/tokens/page.tsx` works for browsers (they handle the RSC payload)
// but curl + crawlers see HTTP 200 with redirect logic in the payload, which
// the audit caught. Middleware runs before the page handler, so this is
// belt + suspenders: middleware emits 307, the server component would
// re-emit it if the cookie ever lies.
//
// Detection: Supabase SSR sets one of two cookies — `sb-<project>-auth-token`
// or a chunked variant. We don't validate the JWT here (avoid the round-trip
// on every request), we just check presence. The page-level
// `auth.getSession()` does the real validation.

const SUPABASE_AUTH_COOKIE_PREFIX = "sb-";
const SUPABASE_AUTH_COOKIE_SUFFIX = "-auth-token";

const GATED_PATHS = new Set<string>(["/tokens"]);

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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!GATED_PATHS.has(pathname)) {
    return NextResponse.next();
  }
  if (hasSupabaseSession(req)) {
    return NextResponse.next();
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(loginUrl, 307);
}

export const config = {
  // Only run on the gated paths. Avoids touching every request.
  matcher: ["/tokens"],
};
