import type { Metadata } from "next";
import AppPermalinkPage from "./AppPermalinkPage";

const SITE_URL = "https://floom-60sec.vercel.app";

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
      const data = (await res.json()) as { name?: string; description?: string };
      if (data.name) appName = data.name;
      if (data.description) {
        appDescription = data.description.replace(/\s+/g, " ").trim().slice(0, 220);
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

export default function Page() {
  return <AppPermalinkPage />;
}
