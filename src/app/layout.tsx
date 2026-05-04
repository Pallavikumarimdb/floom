import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SkipLink } from "@/components/SkipLink";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { SITE_URL } from "@/lib/config/origin";

const SITE_NAME = "Floom";
const SITE_TAGLINE = "Localhost to live in 60 seconds";
const SITE_DESCRIPTION =
  "Publish small AI apps from anywhere. Public URL, REST API, MCP for agents.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Floom" }],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME}: ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon",
  },
};

// JSON-LD structured data — describes Floom as a SoftwareApplication so
// search engines and previewers can render rich results. Kept minimal +
// truthful. No fake star ratings or aggregate review counts.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/floom-mark.svg`,
      sameAs: [
        "https://github.com/floomhq/floom",
        "https://discord.gg/8fXGXjxcRz",
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web, macOS, Linux, Windows",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Public apps and public runs are free during alpha.",
      },
      publisher: { "@id": `${SITE_URL}#org` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Note: proxy.ts generates a per-request nonce and sets it in the CSP header.
  // Next.js 16 automatically reads 'nonce-{value}' from the CSP header and
  // attaches it to all framework scripts, hydration chunks, and inline scripts
  // it generates — no headers() call needed here.
  //
  // The JSON-LD <script type="application/ld+json"> is a data block, not an
  // executable script. CSP script-src does not apply to data scripts (RFC), so
  // no nonce is required on this tag for security. Omitting headers() keeps the
  // layout sync and allows CDN caching of pages that have no per-request data.

  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body className="min-h-screen bg-white text-slate-900">
        <SkipLink />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(STRUCTURED_DATA) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
