import type { Metadata } from "next";
import { Suspense } from "react";
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

  // Use the same cached Supabase query as Page() — no fetch() to a dynamic API route.
  // Fetching /api/apps/[slug] (a dynamic ƒ route) from generateMetadata was causing
  // Next.js to classify this page as fully dynamic, defeating ISR. Direct admin
  // query wrapped in unstable_cache keeps the page in the ISR window.
  const app = await getPublicAppMeta(slug);

  let appName = app?.name ?? slug;
  let appDescription = "";
  const appFound = app !== null;

  if (app) {
    // Prefer the app's description column; fall back to the first input field's description.
    if (app.description) {
      appDescription = app.description.replace(/\s+/g, " ").trim().slice(0, 220);
    } else if (app.input_schema) {
      const schema = app.input_schema as { properties?: Record<string, { description?: string }> };
      const props = schema.properties ?? {};
      const firstField = Object.values(props)[0];
      const candidate = firstField?.description?.trim();
      if (candidate) {
        appDescription = candidate.replace(/\s+/g, " ").slice(0, 220);
      }
    }
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
  const appMeta = await getPublicAppMeta(slug);

  const initialApp: PermalinkInitialApp | undefined = appMeta
    ? {
        id: appMeta.id,
        slug: appMeta.slug,
        name: appMeta.name,
        handler: appMeta.handler,
        input_schema: appMeta.input_schema as Record<string, unknown> | null,
        public: true,
      }
    : undefined;

  // JSON-LD: describe each public app as a WebApplication hosted on the Floom
  // platform. Helps LLMs understand "this is a deployable app on Floom" when
  // they crawl https://floom.dev/p/<slug>.
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: appMeta?.name ?? slug,
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
      {/* AppPermalinkPage uses useSearchParams() which opts the page into dynamic
          rendering without a Suspense boundary. Wrapping it in Suspense allows
          Next.js to statically render the outer page shell (JSON-LD, metadata)
          and stream the dynamic content after hydration, keeping the route
          eligible for ISR caching (Cache-Control: public, s-maxage=300). */}
      <Suspense>
        <AppPermalinkPage initialApp={initialApp} />
      </Suspense>
    </>
  );
}

// App metadata shape returned by getPublicAppMeta — a superset of PermalinkInitialApp
// that includes the description column used in generateMetadata.
type PublicAppMeta = {
  id: string;
  slug: string;
  name: string;
  handler: string | null;
  description: string | null;
  input_schema: unknown;
  public: true;
};

// Cached public-only app metadata lookup.
// Both generateMetadata and Page() call this function — unstable_cache deduplicates
// the Supabase query within the same request and across requests within the 300s window.
//
// This is the only async data operation in this file. No fetch(), no cookies(), no
// headers() — the Supabase admin client is auth'd via service-role key in env vars.
// Keeping this as the sole data boundary ensures Next.js can classify the route as ISR.
async function getPublicAppMeta(slug: string): Promise<PublicAppMeta | null> {
  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      return {
        id: demoApp.id,
        slug: demoApp.slug,
        name: demoApp.name,
        handler: ((demoApp as Record<string, unknown>).handler as string) ?? null,
        description: null,
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
          .select("id, slug, name, handler, description, public, app_versions(input_schema)")
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
          description: (app.description as string | null) ?? null,
          input_schema: latestVersion?.input_schema ?? null,
          public: true as const,
        } satisfies PublicAppMeta;
      } catch {
        return null;
      }
    },
    ["public-app-meta", slug],
    { revalidate: 300, tags: [`app:${slug}`] }
  )(slug);
}
