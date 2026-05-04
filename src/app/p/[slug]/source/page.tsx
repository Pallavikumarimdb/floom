import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig, demoApp } from "@/lib/demo-app";
import { SITE_URL } from "@/lib/config/origin";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

// Fresh (non-cached) app metadata for generateMetadata — per OG fix pattern.
async function getAppMeta(slug: string) {
  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      return { name: demoApp.name, description: null, public: true as const };
    }
    return null;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("apps")
      .select("name, description, public")
      .eq("slug", slug)
      .eq("public", true)
      .maybeSingle();
    if (error || !data) return null;
    return data as { name: string; description: string | null; public: true };
  } catch {
    return null;
  }
}

// Source data fetched server-side for SSR.
async function getSourceData(slug: string) {
  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      const handler = (demoApp as Record<string, unknown>).handler as string | undefined;
      if (handler) {
        return {
          kind: "single_file" as const,
          filename: "app.py",
          content: handler,
        };
      }
      return {
        kind: "single_file" as const,
        filename: "app.py",
        content:
          "# Demo app\ndef run(inputs: dict) -> dict:\n    name = inputs.get('name', 'world')\n    return {'greeting': f'Hello, {name}!'}",
      };
    }
    return { kind: "error" as const, message: "Supabase is not configured." };
  }

  const MAX_DISPLAY = 100 * 1024;

  try {
    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from("apps")
      .select(
        "id, slug, name, owner_id, public, entrypoint, handler, app_versions(id, bundle_path, bundle_kind)"
      )
      .eq("slug", slug)
      .eq("public", true)
      .order("version", { foreignTable: "app_versions", ascending: false })
      .limit(1, { foreignTable: "app_versions" })
      .maybeSingle();

    if (error || !app) {
      return { kind: "error" as const, message: "App not found." };
    }

    const typedApp = app as typeof app & {
      entrypoint?: string | null;
      handler?: string | null;
      app_versions?: Array<{ id: string; bundle_path: string | null; bundle_kind: string | null }>;
    };

    const latestVersion = typedApp.app_versions?.[0];

    if (!latestVersion?.bundle_path) {
      if (typedApp.handler) {
        return {
          kind: "single_file" as const,
          filename: typedApp.entrypoint ?? "app.py",
          content: typedApp.handler,
        };
      }
      return { kind: "error" as const, message: "Source not available for this app." };
    }

    const bundleKind = latestVersion.bundle_kind ?? "single_file";
    if (bundleKind === "tarball") {
      return {
        kind: "tarball" as const,
        message:
          "This app is deployed as a multi-file bundle. Source cannot be displayed inline.",
        downloadUrl: `${SITE_URL}/api/apps/${slug}/source`,
      };
    }

    const { data: blob, error: dlError } = await admin.storage
      .from("app-bundles")
      .download(latestVersion.bundle_path);

    if (dlError || !blob) {
      return { kind: "error" as const, message: "Source file could not be retrieved." };
    }

    if (blob.size > MAX_DISPLAY) {
      return {
        kind: "too_large" as const,
        message: `Source file is ${Math.round(blob.size / 1024)} KB — too large to display inline.`,
        downloadUrl: `${SITE_URL}/api/apps/${slug}/source`,
      };
    }

    const content = await blob.text();
    return {
      kind: "single_file" as const,
      filename: typedApp.entrypoint ?? "app.py",
      content,
    };
  } catch {
    return { kind: "error" as const, message: "Source could not be loaded." };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const app = await getAppMeta(slug);
  const appName = app?.name ?? slug;
  const title = `${appName} source`;
  const fullTitle = `${appName} source · Floom`;
  const description = `Read or fork the source code for ${slug} on Floom.`;
  const url = `${SITE_URL}/p/${slug}/source`;
  const ogImage = `${SITE_URL}/p/${slug}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: fullTitle,
      description,
      url,
      siteName: "Floom",
      images: [{ url: ogImage, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage],
    },
  };
}

export default async function SourcePage({ params }: Props) {
  const { slug } = await params;
  const [app, sourceData] = await Promise.all([getAppMeta(slug), getSourceData(slug)]);

  if (!app) {
    return (
      <div style={{ fontFamily: "inherit", padding: "64px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>App not found</h1>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          No public app at <code>/p/{slug}</code>
        </p>
        <Link
          href="/"
          style={{
            padding: "10px 20px",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Back home
        </Link>
      </div>
    );
  }

  const isCode = sourceData.kind === "single_file";
  const filename = isCode ? (sourceData as { kind: "single_file"; filename: string; content: string }).filename : null;
  const content = isCode ? (sourceData as { kind: "single_file"; filename: string; content: string }).content : null;

  return (
    <div style={{ fontFamily: "inherit", padding: "14px 24px 64px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 18,
          fontSize: 12.5,
          color: "var(--muted)",
        }}
      >
        <Link href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>
          Home
        </Link>
        <span aria-hidden="true" style={{ color: "var(--line)" }}>/</span>
        <Link href={`/p/${slug}`} style={{ color: "var(--muted)", textDecoration: "none" }}>
          {app.name}
        </Link>
        <span aria-hidden="true" style={{ color: "var(--line)" }}>/</span>
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>Source</span>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 4px",
              color: "var(--ink)",
              letterSpacing: "-0.02em",
            }}
          >
            {app.name} — Source
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            {filename ? (
              <>
                <code
                  style={{
                    fontFamily: "JetBrains Mono, ui-monospace, monospace",
                    fontSize: 12,
                    background: "var(--studio, #f5f4f0)",
                    padding: "1px 5px",
                    borderRadius: 4,
                  }}
                >
                  {filename}
                </code>
                {" — public, read-only"}
              </>
            ) : (
              "Source code for this Floom app"
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Copy shareable URL button — client-side, done via data-copy-url attribute */}
          <CopyShareButton url={`${SITE_URL}/p/${slug}/source`} />
          <Link
            href={`/p/${slug}`}
            style={{
              padding: "8px 14px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--ink)",
              background: "var(--card)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Run app &rarr;
          </Link>
        </div>
      </div>

      {/* Source code block */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* File tab bar */}
        {filename && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderBottom: "1px solid var(--line)",
              background: "var(--studio, #f5f4f0)",
            }}
          >
            <span
              style={{
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {filename}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <DownloadLink slug={slug} filename={filename} />
            </div>
          </div>
        )}

        {/* Content area */}
        <div style={{ padding: "16px 20px", overflowX: "auto" }}>
          {sourceData.kind === "single_file" && content && (
            <pre
              style={{
                margin: 0,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--ink)",
                whiteSpace: "pre",
                overflowX: "auto",
              }}
            >
              {content}
            </pre>
          )}

          {(sourceData.kind === "tarball" || sourceData.kind === "too_large") && (
            <div style={{ padding: "24px 0" }}>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--muted)" }}>
                {sourceData.message}
              </p>
              {"downloadUrl" in sourceData && (
                <a
                  href={(sourceData as { downloadUrl: string }).downloadUrl}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 16px",
                    background: "var(--accent)",
                    color: "#fff",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Download source
                </a>
              )}
            </div>
          )}

          {sourceData.kind === "error" && (
            <p style={{ margin: "24px 0", fontSize: 14, color: "var(--muted)" }}>
              {sourceData.message}
            </p>
          )}
        </div>
      </div>

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 18,
          fontSize: 12.5,
          flexWrap: "wrap",
        }}
      >
        <Link href={`/p/${slug}/api`} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
          API docs &rarr;
        </Link>
        <Link href={`/p/${slug}/mcp`} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
          MCP install &rarr;
        </Link>
      </div>
    </div>
  );
}

/* --------- tiny server-side-renderable client components --------- */

// These are inline client components using script tags for copy behavior,
// avoiding a full 'use client' boundary on the server page.

function CopyShareButton({ url }: { url: string }) {
  return (
    <>
      <button
        type="button"
        data-copy-url={url}
        style={{
          padding: "8px 14px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--ink)",
          background: "var(--card)",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        onClick={undefined}
      >
        <ShareIconSvg />
        Share source
      </button>
      {/* Inline script to wire up the copy button — no React hydration needed */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  document.querySelectorAll('button[data-copy-url]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var url = btn.getAttribute('data-copy-url');
      if (url) {
        navigator.clipboard.writeText(url).then(function() {
          var original = btn.innerHTML;
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.innerHTML = original; }, 1500);
        }).catch(function() {});
      }
    });
  });
})();
          `,
        }}
      />
    </>
  );
}

function DownloadLink({ slug, filename }: { slug: string; filename: string }) {
  return (
    <a
      href={`/api/apps/${slug}/source`}
      download={filename}
      style={{
        padding: "4px 10px",
        border: "1px solid var(--line)",
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--ink)",
        background: "var(--card)",
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      Download
    </a>
  );
}

function ShareIconSvg() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={18} cy={5} r={3} stroke="currentColor" strokeWidth="1.8" />
      <circle cx={6} cy={12} r={3} stroke="currentColor" strokeWidth="1.8" />
      <circle cx={18} cy={19} r={3} stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
