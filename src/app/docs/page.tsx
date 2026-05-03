import type { Metadata } from "next";
import DocsContent from "./DocsContent";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Docs",
  description: "Build, publish, and run Floom apps: manifest reference, schemas, secrets, API, CLI, MCP, and examples.",
  alternates: { canonical: `${SITE_URL}/docs` },
  openGraph: {
    title: "Floom Docs",
    description: "Everything you need to build and ship a Floom app: from CLI setup to MCP integration.",
    url: `${SITE_URL}/docs`,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
};

export default function DocsPage() {
  return <DocsContent />;
}
