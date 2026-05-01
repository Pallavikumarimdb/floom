import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppPermalinkPage from "./AppPermalinkPage";
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
  let appDescription =
    "Run this Floom app from the browser. Inputs are validated with JSON Schema and executed in an isolated sandbox.";
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

  return <AppPermalinkPage />;
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
