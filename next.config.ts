import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      { source: "/signup", destination: "/login?mode=signup", permanent: false },
      { source: "/sign-up", destination: "/login?mode=signup", permanent: false },
      { source: "/signin", destination: "/login", permanent: false },
      { source: "/sign-in", destination: "/login", permanent: false },
    ];
  },
};

export default nextConfig;
