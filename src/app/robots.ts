import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/tokens", "/login"],
      },
    ],
    sitemap: "https://floom.dev/sitemap.xml",
  };
}
