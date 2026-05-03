import type { MetadataRoute } from "next";

// Explicit allow rules for major AI crawlers so Floom docs appear in
// AI-generated answers. Reference to llms.txt helps agents find the
// machine-readable summary without scraping HTML.
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    "GPTBot",
    "Google-Extended",
    "ClaudeBot",
    "PerplexityBot",
    "anthropic-ai",
    "cohere-ai",
    "Applebot-Extended",
  ];

  return {
    rules: [
      // Default: allow everything except auth/private routes.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/tokens", "/login"],
      },
      // Explicit allow for each AI crawler — belt-and-suspenders alongside
      // the wildcard rule above. Some crawlers check their own rule first.
      ...aiCrawlers.map((ua) => ({
        userAgent: ua,
        allow: ["/", "/docs", "/docs/", "/llms.txt", "/llms-full.txt", "/p/"],
      })),
    ],
    sitemap: "https://floom.dev/sitemap.xml",
  };
}
