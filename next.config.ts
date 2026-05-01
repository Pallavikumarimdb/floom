import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://*.supabase.co https://*.vercel.app",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
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
      { source: "/status", destination: "/legal#status-and-outages", permanent: false },
      // The canonical demo migrated from pitch-coach (echo stub) to
      // meeting-action-items (real Gemini handler). Old links keep working.
      { source: "/p/pitch-coach", destination: "/p/meeting-action-items", permanent: false },
    ];
  },
};

export default nextConfig;
