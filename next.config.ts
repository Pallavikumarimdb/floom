import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy is set per-request by proxy.ts with a fresh nonce
// so that 'unsafe-inline' can be dropped from script-src. The static headers
// below cover the non-CSP security posture: HSTS, framing, MIME sniffing, etc.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const tracedServerExternalPackages = [
  "./node_modules/tar/**/*",
  "./node_modules/@isaacs/fs-minipass/**/*",
  "./node_modules/chownr/**/*",
  "./node_modules/minipass/**/*",
  "./node_modules/minizlib/**/*",
  "./node_modules/yallist/**/*",
  "./node_modules/js-yaml/**/*",
  "./node_modules/argparse/**/*",
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["tar", "js-yaml"],
  outputFileTracingIncludes: {
    "/api/**/*": tracedServerExternalPackages,
    "/mcp": tracedServerExternalPackages,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      { source: "/signup", destination: "/login?mode=signup", permanent: false },
      { source: "/sign-up", destination: "/login?mode=signup", permanent: false },
      { source: "/signin", destination: "/login", permanent: false },
      { source: "/sign-in", destination: "/login", permanent: false },
      // Common URL expectations that don't have dedicated pages in v0:
      { source: "/pricing", destination: "/legal#pricing", permanent: false },
      { source: "/apps", destination: "/", permanent: false },
      { source: "/security", destination: "/legal#security", permanent: false },
      // /status is now a real page; the legal anchor stays as a fallback link from inside /legal.
      // Old single-page docs anchor links — redirect to new sub-pages.
      // Next.js redirects don't support hash fragments on the source side (browsers don't send
      // hashes to the server). These redirect to the closest sub-page. Users landing via
      // /docs#manifest-reference will hit /docs and the sidebar makes the new URL obvious.
      { source: "/docs/getting-started", destination: "/docs/quickstart", permanent: true },
      { source: "/docs/what-is-a-floom-app", destination: "/docs/quickstart", permanent: true },
      { source: "/docs/manifest-reference", destination: "/docs/manifest", permanent: true },
      { source: "/docs/input-output-schemas", destination: "/docs/schemas", permanent: true },
      { source: "/docs/run-through-api", destination: "/docs/api", permanent: true },
      { source: "/docs/async-runs", destination: "/docs/api", permanent: true },
      { source: "/docs/mcp-for-ai-agents", destination: "/docs/mcp", permanent: true },
      { source: "/docs/ci-automation", destination: "/docs/ci", permanent: true },
      { source: "/docs/composio", destination: "/docs/integrations", permanent: true },
      // /legal/privacy and /legal/terms return 404 (no sub-pages exist); redirect to real pages.
      { source: "/legal/privacy", destination: "/privacy", permanent: true },
      { source: "/legal/terms", destination: "/terms", permanent: true },
      // Authed nav routes that don't have pages yet in v0.4 — redirect to the
      // existing token dashboard. v0.5 builds proper /me/runs and /studio pages.
      { source: "/me", destination: "/tokens", permanent: false },
      { source: "/account", destination: "/tokens", permanent: false },
      { source: "/studio", destination: "/", permanent: false },
    ];
  },
};

// TODO(Federico): generate Sentry auth token at https://sentry.io/settings/account/api/auth-tokens/
// with scopes: project:releases, org:read. Add to Vercel prod env as SENTRY_AUTH_TOKEN.
// Then set SENTRY_ORG (extract from DSN host, e.g. "openpaper" from oXXX.ingest.sentry.io)
// and SENTRY_PROJECT (extract from DSN path, e.g. "floom-minimal" from /<projectId>).
// Once these three are set, the next deploy will upload source maps automatically.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN || !process.env.CI,
  telemetry: false,
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE || undefined,
    create: Boolean(process.env.SENTRY_AUTH_TOKEN),
  },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),
});
