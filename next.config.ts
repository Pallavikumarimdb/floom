import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https://*.googleusercontent.com https://logos.composio.dev",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://*.supabase.co https://*.vercel.app https://*.sentry.io https://*.ingest.sentry.io",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
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
      // The canonical demo migrated from pitch-coach to meeting-action-items.
      // Old links keep working.
      { source: "/p/pitch-coach", destination: "/p/meeting-action-items", permanent: false },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN || !process.env.CI,
  telemetry: false,
  release: {
    create: Boolean(process.env.SENTRY_AUTH_TOKEN),
  },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),
});
