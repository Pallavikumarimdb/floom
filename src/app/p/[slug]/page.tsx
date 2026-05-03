import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppPermalinkPage, { type PermalinkInitialApp } from "./AppPermalinkPage";
import { demoApp, hasBrowserAuthConfig, hasSupabaseConfig } from "@/lib/demo-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const SITE_URL = "https://floom.dev";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  let appName = slug;
  let appDescription = "";
  try {
    const res = await fetch(`${SITE_URL}/api/apps/${slug}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
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
  // OG/Twitter cards are never blank.
  if (!appDescription) {
    appDescription = `${appName} on Floom`;
  }

  // Title is bare app name; layout.tsx metadata.title.template adds " · Floom".
  const title = appName;
  const fullTitle = `${appName} · Floom`;
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
  if (await isUnavailablePermalink(slug)) {
    notFound();
  }

  // Pre-fetch the app data server-side so the first paint renders the form
  // rather than a loading skeleton.
  const initialApp = await fetchInitialApp(slug);

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
      <AppPermalinkPage initialApp={initialApp ?? undefined} />
    </>
  );
}

async function fetchInitialApp(slug: string): Promise<PermalinkInitialApp | null> {
  if (!hasSupabaseConfig()) {
    const { demoApp } = await import("@/lib/demo-app");
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

  try {
    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from("apps")
      .select("id, slug, name, handler, public, app_versions(input_schema)")
      .eq("slug", slug)
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
      public: app.public as boolean,
    };
  } catch {
    return null;
  }
}

async function isUnavailablePermalink(slug: string) {
  if (!hasSupabaseConfig()) {
    return slug !== demoApp.slug;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("apps")
      .select("id, owner_id, public")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) {
      return true;
    }

    if (data.public === true) {
      return false;
    }

    if (!hasBrowserAuthConfig()) {
      return true;
    }

    const supabase = await createServerSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return true;
    }

    return userData.user.id !== data.owner_id;
  } catch {
    return true;
  }
}
