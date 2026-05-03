import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main
        id="main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
            margin: 0,
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.025em",
            margin: "12px 0 14px",
            color: "var(--ink)",
          }}
        >
          Page not found — or this app is private.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--muted)",
            maxWidth: 460,
            lineHeight: 1.55,
            margin: "0 0 28px",
          }}
        >
          {"If you own this app, sign in to access it. Otherwise, browse public apps on the home page."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href="/login"
            style={{
              padding: "10px 20px",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/"
            style={{
              padding: "10px 20px",
              background: "var(--card)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Browse public apps &rarr;
          </Link>
        </div>
      </main>
      <FloomFooter />
    </div>
  );
}
