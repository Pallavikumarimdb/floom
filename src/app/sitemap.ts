import type { MetadataRoute } from "next";
import { SITE_URL as SITE } from "@/lib/config/origin";

// All /docs/<slug> sub-pages added in PR #69. Keep in sync with
// src/app/docs/*/page.tsx files.
const DOC_SLUGS = [
  "quickstart",
  "manifest",
  "schemas",
  "secrets",
  "auth",
  "api",
  "mcp",
  "connections",
  "ci",
  "examples",
  "limits",
  "faq",
] as const;

// Public demo apps with their own permalink pages.
const DEMO_APP_SLUGS = [
  "meeting-action-items",
  "invoice-calculator",
  "utm-url-builder",
  "csv-stats",
  "multi-file-python",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    // Docs index
    {
      url: `${SITE}/docs`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // All docs sub-pages
    ...DOC_SLUGS.map((slug) => ({
      url: `${SITE}/docs/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    // Public demo app permalinks
    ...DEMO_APP_SLUGS.map((slug) => ({
      url: `${SITE}/p/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    // Static pages
    {
      url: `${SITE}/legal`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    // Legal pages
    {
      url: `${SITE}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    // Machine-readable docs for AI agents
    {
      url: `${SITE}/llms.txt`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];
}
