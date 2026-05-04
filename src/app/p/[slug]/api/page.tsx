import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig, demoApp } from "@/lib/demo-app";
import { SITE_URL } from "@/lib/config/origin";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

type InputField = { name: string; type?: string; description?: string };

interface AppApiMeta {
  name: string;
  description: string | null;
  isPublic: boolean;
  inputFields: InputField[];
}

// Fresh query — not cached, per OG fix pattern.
async function getAppApiMeta(slug: string): Promise<AppApiMeta | null> {
  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      const schema = (demoApp as Record<string, unknown>).input_schema as
        | { properties?: Record<string, { type?: string; description?: string }> }
        | null
        | undefined;
      const fields: InputField[] = schema?.properties
        ? Object.entries(schema.properties).map(([n, p]) => ({
            name: n,
            type: p.type ?? "string",
            description: p.description,
          }))
        : [];
      return {
        name: demoApp.name,
        description: null,
        isPublic: true,
        inputFields: fields,
      };
    }
    return null;
  }

  try {
    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from("apps")
      .select("name, description, public, app_versions(input_schema)")
      .eq("slug", slug)
      .eq("public", true)
      .order("version", { foreignTable: "app_versions", ascending: false })
      .limit(1, { foreignTable: "app_versions" })
      .maybeSingle();

    if (error || !app) return null;

    const typedApp = app as {
      name: string;
      description: string | null;
      public: boolean;
      app_versions?: Array<{
        input_schema: {
          properties?: Record<string, { type?: string; description?: string }>;
        } | null;
      }>;
    };

    const schema = typedApp.app_versions?.[0]?.input_schema;
    const fields: InputField[] = schema?.properties
      ? Object.entries(schema.properties).map(([n, p]) => ({
          name: n,
          type: p.type ?? "string",
          description: p.description,
        }))
      : [];

    return {
      name: typedApp.name,
      description: typedApp.description,
      isPublic: typedApp.public,
      inputFields: fields,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const app = await getAppApiMeta(slug);
  const appName = app?.name ?? slug;
  const title = `${appName} API`;
  const fullTitle = `${appName} API · Floom`;
  const description = `OpenAPI spec and usage examples for the ${slug} app on Floom.`;
  const url = `${SITE_URL}/p/${slug}/api`;
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

export default async function ApiPage({ params }: Props) {
  const { slug } = await params;
  const app = await getAppApiMeta(slug);

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

  const runEndpoint = `${SITE_URL}/api/apps/${slug}/run`;
  const pollEndpoint = `${SITE_URL}/api/runs/{execution_id}`;
  const openApiUrl = `${SITE_URL}/p/${slug}/openapi`;

  // Build example input object from schema fields.
  const exampleInputs: Record<string, unknown> =
    app.inputFields.length > 0
      ? Object.fromEntries(
          app.inputFields.map((f) => [
            f.name,
            f.type === "integer" || f.type === "number"
              ? 1
              : f.type === "boolean"
              ? true
              : `your ${f.name} here`,
          ])
        )
      : {};

  const curlSnippet = app.isPublic
    ? `curl -X POST ${runEndpoint} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ inputs: exampleInputs })}'`
    : `curl -X POST ${runEndpoint} \\
  -H "Authorization: Bearer YOUR_FLOOM_AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ inputs: exampleInputs })}'`;

  const jsSnippet = `const res = await fetch("${runEndpoint}", {
  method: "POST",${
    app.isPublic
      ? ""
      : `
  headers: {
    "Authorization": "Bearer YOUR_FLOOM_AGENT_TOKEN",
    "Content-Type": "application/json",
  },`
  }${
    app.isPublic
      ? `
  headers: { "Content-Type": "application/json" },`
      : ""
  }
  body: JSON.stringify({ inputs: ${JSON.stringify(exampleInputs, null, 4)
    .split("\n")
    .join("\n    ")} }),
});
const { execution_id, view_token, status, output } = await res.json();`;

  const pythonSnippet = `import requests

resp = requests.post(
    "${runEndpoint}",
    ${app.isPublic ? "" : `headers={"Authorization": "Bearer YOUR_FLOOM_AGENT_TOKEN"},\n    `}json={"inputs": ${JSON.stringify(exampleInputs, null, 4)
      .split("\n")
      .join("\n    ")}},
)
data = resp.json()
execution_id = data["execution_id"]
output = data.get("output")`;

  const pollCurl = `curl "${SITE_URL}/api/runs/{execution_id}" \\
  -H "Authorization: ViewToken {view_token}"`;

  return (
    <div style={{ fontFamily: "inherit", padding: "14px 24px 64px", maxWidth: 900, margin: "0 auto" }}>
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
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>API</span>
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
            {app.name} — API
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            {app.isPublic
              ? "Public app — no authentication required."
              : "Private app — Floom agent token required."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={openApiUrl}
            target="_blank"
            rel="noreferrer"
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
              gap: 5,
            }}
          >
            openapi.json &rarr;
          </a>
          <CopyShareButton url={`${SITE_URL}/p/${slug}/api`} label="Share API" />
        </div>
      </div>

      {/* Endpoint reference */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Endpoint</SectionLabel>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <EndpointRow method="POST" url={runEndpoint} />
        </div>
      </section>

      {/* Request body */}
      {app.inputFields.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Request body</SectionLabel>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--muted)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Field
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--muted)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--muted)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {app.inputFields.map((f, i) => (
                  <tr
                    key={f.name}
                    style={{
                      borderBottom:
                        i < app.inputFields.length - 1 ? "1px solid var(--line)" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <code
                        style={{
                          fontFamily: "JetBrains Mono, ui-monospace, monospace",
                          fontSize: 12,
                          color: "var(--ink)",
                        }}
                      >
                        {f.name}
                      </code>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <code
                        style={{
                          fontFamily: "JetBrains Mono, ui-monospace, monospace",
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        {f.type ?? "string"}
                      </code>
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--muted)", fontSize: 13 }}>
                      {f.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Response shape */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Response</SectionLabel>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Field
                </th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Type
                </th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "execution_id", type: "string (uuid)", desc: "Unique run ID. Poll GET /api/runs/{execution_id} for status." },
                { name: "view_token", type: "string", desc: "Opaque token — store client-side to re-read this run later." },
                { name: "status", type: "string", desc: "queued | running | succeeded | failed | timed_out" },
                { name: "output", type: "object | null", desc: "App output when status is succeeded." },
              ].map((row, i, arr) => (
                <tr key={row.name} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : undefined }}>
                  <td style={{ padding: "10px 16px" }}>
                    <code style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 12, color: "var(--ink)" }}>{row.name}</code>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <code style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 12, color: "var(--muted)" }}>{row.type}</code>
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--muted)", fontSize: 13 }}>{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Polling */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Polling</SectionLabel>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>
          Some apps finish synchronously; others are async. Poll until{" "}
          <code
            style={{
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 12,
              background: "var(--studio, #f5f4f0)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            status
          </code>{" "}
          reaches a terminal value (succeeded, failed, timed_out, cancelled).
        </p>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <EndpointRow method="GET" url={pollEndpoint} />
        </div>
        <CodeBlock value={pollCurl} id="poll-curl" />
      </section>

      {/* Auth */}
      {!app.isPublic && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Authentication</SectionLabel>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>
            This private app requires a Floom agent token.{" "}
            <a
              href="/tokens"
              style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
            >
              Mint one &rarr;
            </a>
          </p>
          <CodeBlock
            value={`Authorization: Bearer YOUR_FLOOM_AGENT_TOKEN`}
            id="auth-header"
          />
        </section>
      )}

      {/* Examples */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Examples</SectionLabel>

        <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
          cURL
        </p>
        <CodeBlock value={curlSnippet} id="curl-example" />

        <p style={{ margin: "16px 0 8px", fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
          JavaScript
        </p>
        <CodeBlock value={jsSnippet} id="js-example" />

        <p style={{ margin: "16px 0 8px", fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
          Python
        </p>
        <CodeBlock value={pythonSnippet} id="python-example" />
      </section>

      {/* Footer links */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, flexWrap: "wrap" }}>
        <Link href={`/p/${slug}/source`} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
          View source &rarr;
        </Link>
        <Link href={`/p/${slug}/mcp`} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
          MCP install &rarr;
        </Link>
        <a
          href={openApiUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
        >
          openapi.json &rarr;
        </a>
      </div>
    </div>
  );
}

/* ---- sub-components ---- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--muted)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        margin: "0 0 8px",
      }}
    >
      {children}
    </h2>
  );
}

function EndpointRow({ method, url }: { method: string; url: string }) {
  const methodColor = method === "POST" ? "#2563eb" : "#7c3aed";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
      }}
    >
      <span
        style={{
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 11.5,
          fontWeight: 700,
          color: methodColor,
          background: `${methodColor}14`,
          padding: "2px 7px",
          borderRadius: 5,
          flexShrink: 0,
        }}
      >
        {method}
      </span>
      <code
        style={{
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 12.5,
          color: "var(--ink)",
          wordBreak: "break-all",
        }}
      >
        {url}
      </code>
    </div>
  );
}

function CodeBlock({ value, id }: { value: string; id: string }) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--studio, #f5f4f0)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 4,
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
          top: 10,
          right: 10,
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
      if (btn._wired) return;
      btn._wired = true;
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
    document.querySelectorAll('button[data-copy-pre]').forEach(function(btn) {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-copy-pre');
        var el = id ? document.getElementById(id) : null;
        if (el) {
          navigator.clipboard.writeText(el.textContent || '').then(function() {
            var original = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = 'var(--muted)';
            btn.style.borderColor = 'var(--line)';
            setTimeout(function() {
              btn.textContent = original;
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
