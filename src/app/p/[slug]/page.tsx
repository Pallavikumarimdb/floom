import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import AppPermalinkPage, { type PermalinkInitialApp } from "./AppPermalinkPage";
import { demoApp, hasSupabaseConfig } from "@/lib/demo-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { SITE_URL } from "@/lib/config/origin";

// ISR: public app pages are CDN-cached for 5 minutes.
// No server-side auth or cookies() anywhere in this file — every code path
// uses the admin (service-role) client with no cookie/header access.
// Auth and private-app gating are handled entirely client-side:
//   - AppPermalinkPage fetches /api/apps/[slug] with the user's bearer token
//   - The API returns 404 for private apps the caller cannot access
//   - The client component shows the "not found" state in that case
// This ensures Vercel treats this route as ISR-cacheable (s-maxage=300, swr=86400).
export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  let appName = slug;
  let appDescription = "";
  let appFound = false;
  try {
    const res = await fetch(`${SITE_URL}/api/apps/${slug}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      appFound = true;
      const data = (await res.json()) as {
        name?: string;
        description?: string;
        input_schema?: { properties?: Record<string, { description?: string }> };
      };
      if (data.name) appName = data.name;
      if (data.description) {
        appDescription = data.description.replace(/\s+/g, " ").trim().slice(0, 220);
      } else {
        // Fallback: first input field's `description`. Until apps.description
        // is a first-class column, the input-schema description is the only
        // app-authored summary available — generic enough for meta + OG, and
        // strictly better than the static "Run this Floom app..." stub.
        const props = data.input_schema?.properties ?? {};
        const firstField = Object.values(props)[0];
        const candidate = firstField?.description?.trim();
        if (candidate) {
          appDescription = candidate.replace(/\s+/g, " ").slice(0, 220);
        }
      }
    }
  } catch {
    // Fall back to slug + generic description.
  }

  // If no description was found from any source, emit a minimal fallback so
  // OG/Twitter cards are never blank. For not-found apps, use a generic message.
  if (!appDescription) {
    appDescription = appFound
      ? `Run ${appName} on Floom — Claude apps as shareable URLs with REST API and MCP support.`
      : "This Floom app does not exist.";
  }

  // Title is bare app name; layout.tsx metadata.title.template adds " · Floom".
  // For not-found apps, use a generic title.
  const title = appFound ? appName : "Not found";
  const fullTitle = `${title} · Floom`;
  const url = `${SITE_URL}/p/${slug}`;
  const ogImage = `${SITE_URL}/p/${slug}/opengraph-image`;

  return {
    title,
    description: appDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: fullTitle,
      description: appDescription,
      url,
      siteName: "Floom",
      images: [{ url: ogImage, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: appDescription,
      images: [ogImage],
    },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;

  // Pre-fetch only PUBLIC app metadata server-side so the first paint renders
  // the form rather than a loading skeleton. Private apps return null here and
  // the client component handles them via the authenticated API fetch.
  const initialApp = await fetchPublicInitialApp(slug);

  // JSON-LD: describe each public app as a WebApplication hosted on the Floom
  // platform. Helps LLMs understand "this is a deployable app on Floom" when
  // they crawl https://floom.dev/p/<slug>.
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: initialApp?.name ?? slug,
    url: `${SITE_URL}/p/${slug}`,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    isPartOf: { "@id": `${SITE_URL}#app` },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    // Point agents to the REST and MCP entry-points for this app.
    potentialAction: [
      {
        "@type": "Action",
        name: "Run via REST API",
        target: `${SITE_URL}/api/apps/${slug}/run`,
      },
      {
        "@type": "Action",
        name: "Run via MCP (run_app tool)",
        target: `${SITE_URL}/mcp`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(appJsonLd) }}
      />
      <AppPermalinkPage initialApp={initialApp ?? undefined} />
    </>
  );
}

// Fetch public-only app metadata for server-side pre-rendering.
// Only returns data for apps with public=true; private apps return null so
// the client component handles auth and renders after hydration.
// No cookies(), no headers(), no server auth — this keeps the route ISR-cacheable.
//
// Wrapped in unstable_cache so Next.js treats the Supabase query result as
// explicitly cached data (not an uncached non-fetch call). Without this, the
// Supabase JS client's internal fetch — which includes auth headers — is not
// coalesced into the route's ISR window, leaving the route classified as
// fully dynamic. unstable_cache makes the cache boundary explicit.
async function fetchPublicInitialApp(slug: string): Promise<PermalinkInitialApp | null> {
  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      return {
        id: demoApp.id,
        slug: demoApp.slug,
        name: demoApp.name,
        handler: ((demoApp as Record<string, unknown>).handler as string) ?? null,
        input_schema:
          ((demoApp as Record<string, unknown>).input_schema as Record<string, unknown>) ?? null,
        public: true,
      };
    }
    return null;
  }

  return unstable_cache(
    async (slug: string) => {
      try {
        const admin = createAdminClient();
        const { data: app, error } = await admin
          .from("apps")
          .select("id, slug, name, handler, public, app_versions(input_schema)")
          .eq("slug", slug)
          .eq("public", true) // Only pre-render public apps server-side
          .order("version", { foreignTable: "app_versions", ascending: false })
          .limit(1, { foreignTable: "app_versions" })
          .maybeSingle();

        if (error || !app) return null;

        const latestVersion = (
          app.app_versions as Array<{ input_schema: Record<string, unknown> | null }>
        )?.[0];

        return {
          id: app.id,
          slug: app.slug,
          name: app.name,
          handler: (app.handler as string | null) ?? null,
          input_schema: latestVersion?.input_schema ?? null,
          public: true,
        } satisfies PermalinkInitialApp;
      } catch {
        return null;
      }
    },
    ["public-app", slug],
    { revalidate: 300, tags: [`app:${slug}`] }
  )(slug);
}
