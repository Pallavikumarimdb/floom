import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig, demoApp } from "@/lib/demo-app";
import { SITE_URL } from "@/lib/config/origin";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

interface AppMcpMeta {
  name: string;
  isPublic: boolean;
}

// Fresh query — not cached, per OG fix pattern.
async function getAppMcpMeta(slug: string): Promise<AppMcpMeta | null> {
  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      return { name: demoApp.name, isPublic: true };
    }
    return null;
  }

  try {
    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from("apps")
      .select("name, public")
      .eq("slug", slug)
      .eq("public", true)
      .maybeSingle();

    if (error || !app) return null;
    return { name: (app.name as string) ?? slug, isPublic: app.public as boolean };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const app = await getAppMcpMeta(slug);
  const appName = app?.name ?? slug;
  const title = `${appName} MCP install`;
  const fullTitle = `${appName} MCP · Floom`;
  const description = `Install ${slug} as a per-app MCP server in Claude Desktop, Cursor, or any MCP client.`;
  const url = `${SITE_URL}/p/${slug}/mcp`;
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

export default async function McpPage({ params }: Props) {
  const { slug } = await params;
  const app = await getAppMcpMeta(slug);

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

  // Per-app MCP config: v1 uses the global /mcp endpoint. The run_app tool in the
  // server already filters to a specific app when the caller passes "app" in the
  // tool arguments. A true per-app filtered endpoint (/api/apps/<slug>/mcp) will
  // be added in v0.5 when per-app token scoping ships.
  //
  // Until then, install the global endpoint and call run_app with slug as the
  // argument. This is the honest trade-off: shipping a usable config now vs
  // waiting for per-app filtering.

  const mcpUrl = `${SITE_URL}/mcp`;

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        [slug]: {
          type: "streamable-http",
          url: mcpUrl,
          headers: {
            Authorization: "Bearer <your-floom-agent-token>",
          },
        },
      },
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      url: mcpUrl,
      headers: { Authorization: "Bearer <your-floom-agent-token>" },
    },
    null,
    2
  );

  const claudeCliCommand = `claude mcp add ${slug} ${mcpUrl}`;

  // Usage hint shown after install.
  const usageTool = `run_app`;
  const usageArgs = JSON.stringify({ app: slug, inputs: {} }, null, 2);

  return (
    <div
      style={{ fontFamily: "inherit", padding: "14px 24px 64px", maxWidth: 860, margin: "0 auto" }}
    >
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
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>MCP</span>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 28,
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
            {app.name} — MCP Install
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Add {app.name} as an MCP server so Claude, Cursor, or any MCP client can call it as a
            tool.
          </p>
        </div>
        <CopyShareButton url={`${SITE_URL}/p/${slug}/mcp`} label="Share MCP" />
      </div>

      {/* Token notice for private apps */}
      {!app.isPublic && (
        <div
          style={{
            background: "#fff5e8",
            border: "1px solid #f5cf90",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 24,
            fontSize: 13,
            color: "#7c5400",
            lineHeight: 1.55,
          }}
        >
          <strong>Private app.</strong> You need a Floom agent token with access to this app.{" "}
          <a
            href="/tokens"
            style={{ color: "#7c5400", fontWeight: 700, textDecoration: "underline" }}
          >
            Mint one &rarr;
          </a>
        </div>
      )}

      {/* Claude Code (CLI) */}
      <InstallSection
        title="Claude Code (CLI)"
        desc={`One command. This adds ${app.name} as a named MCP server to your Claude Code config.`}
      >
        <SectionLabel>Command</SectionLabel>
        <CodeBlock value={claudeCliCommand} id="claude-cli" />
      </InstallSection>

      {/* Claude Desktop */}
      <InstallSection
        title="Claude Desktop"
        desc={`Edit your claude_desktop_config.json to add ${app.name}. Restart Claude Desktop after saving.`}
      >
        <SectionLabel>claude_desktop_config.json</SectionLabel>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)" }}>
          File location:{" "}
          <code
            style={{
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 11.5,
              background: "var(--studio, #f5f4f0)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            ~/Library/Application Support/Claude/claude_desktop_config.json
          </code>{" "}
          on macOS
        </p>
        <CodeBlock value={claudeDesktopConfig} id="claude-desktop" />
      </InstallSection>

      {/* Cursor / generic MCP client */}
      <InstallSection
        title="Cursor / ChatGPT / generic MCP client"
        desc="Add the URL directly in your MCP client settings. The format varies per client; paste the URL and header below."
      >
        <SectionLabel>MCP URL</SectionLabel>
        <CodeBlock value={mcpUrl} id="mcp-url" />
        <SectionLabel>Config snippet (JSON)</SectionLabel>
        <CodeBlock value={cursorConfig} id="cursor-config" />
      </InstallSection>

      {/* How to use after install */}
      <InstallSection
        title="How to use after install"
        desc={`Once the MCP server is connected, ask your AI assistant to use the ${usageTool} tool with the app parameter set to "${slug}".`}
      >
        <SectionLabel>Tool call</SectionLabel>
        <CodeBlock
          value={`Tool: ${usageTool}\nArguments:\n${usageArgs}`}
          id="usage-hint"
        />
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
          Or just ask naturally:{" "}
          <em>
            &quot;Use the {slug} tool to [describe your task].&quot;
          </em>
        </p>
      </InstallSection>

      {/* v1 limitation note */}
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "12px 16px",
          marginTop: 8,
          marginBottom: 24,
          fontSize: 12.5,
          color: "var(--muted)",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--ink)" }}>v1 note:</strong> This installs the global Floom
        MCP endpoint. All your Floom apps are available as tools once connected. Per-app isolated
        endpoints (a dedicated MCP server exposing only this app) are planned for v0.5.
      </div>

      {/* Footer links */}
      <div style={{ display: "flex", gap: 16, fontSize: 12.5, flexWrap: "wrap" }}>
        <Link
          href={`/p/${slug}/source`}
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
        >
          View source &rarr;
        </Link>
        <Link
          href={`/p/${slug}/api`}
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
        >
          API docs &rarr;
        </Link>
        <Link
          href={`/p/${slug}`}
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
        >
          Run app &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ---- sub-components ---- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--muted)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        margin: "0 0 6px",
      }}
    >
      {children}
    </p>
  );
}

function InstallSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          margin: "0 0 4px",
          color: "var(--ink)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          margin: "0 0 14px",
          lineHeight: 1.55,
        }}
      >
        {desc}
      </p>
      {children}
    </section>
  );
}

function CodeBlock({ value, id }: { value: string; id: string }) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--studio, #f5f4f0)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
      }}
    >
      <pre
        id={id}
        style={{
          margin: 0,
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 12,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          lineHeight: 1.6,
          paddingRight: 56,
        }}
      >
        {value}
      </pre>
      <button
        type="button"
        data-copy-pre={id}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "var(--card)",
          color: "var(--accent)",
          border: "1px solid rgba(4,120,87,0.35)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        Copy
      </button>
    </div>
  );
}

function CopyShareButton({ url, label }: { url: string; label: string }) {
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
          flexShrink: 0,
        }}
      >
        <ShareIconSvg />
        {label}
      </button>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  function wire() {
    document.querySelectorAll('button[data-copy-url]').forEach(function(btn) {
      if (btn._wired) return; btn._wired = true;
      btn.addEventListener('click', function() {
        var url = btn.getAttribute('data-copy-url');
        if (url) {
          navigator.clipboard.writeText(url).then(function() {
            var orig = btn.innerHTML;
            btn.textContent = 'Copied!';
            setTimeout(function() { btn.innerHTML = orig; }, 1500);
          }).catch(function() {});
        }
      });
    });
    document.querySelectorAll('button[data-copy-pre]').forEach(function(btn) {
      if (btn._wired) return; btn._wired = true;
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-copy-pre');
        var el = id ? document.getElementById(id) : null;
        if (el) {
          navigator.clipboard.writeText(el.textContent || '').then(function() {
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = 'var(--muted)';
            btn.style.borderColor = 'var(--line)';
            setTimeout(function() {
              btn.textContent = orig;
              btn.style.color = 'var(--accent)';
              btn.style.borderColor = 'rgba(4,120,87,0.35)';
            }, 1500);
          }).catch(function() {});
        }
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
          `,
        }}
      />
    </>
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
