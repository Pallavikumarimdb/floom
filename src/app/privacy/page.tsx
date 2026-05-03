import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Privacy Policy · Floom",
  description:
    "Privacy policy under GDPR Art. 13 for Floom — what data we process, on what legal basis, and your rights.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <main id="main" className="min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--ink)]">
      <SiteHeader />
      <article
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "48px 24px 120px",
          fontSize: "14px",
          lineHeight: 1.7,
        }}
      >
        <p
          style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "12px" }}
        >
          GDPR Art. 13
        </p>
        <h1
          style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "16px" }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
          Deutsche Version:{" "}
          <a href="/datenschutz" style={{ color: "var(--accent)" }}>
            /datenschutz
          </a>
        </p>

        {/* ── 1. Controller ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            1. Controller
          </h2>
          <p style={{ marginBottom: "8px" }}>
            The controller under GDPR is:
          </p>
          <p style={{ marginBottom: "4px" }}>Federico De Ponte</p>
          <p style={{ marginBottom: "4px" }}>Mansteinstraße 27, 20253 Hamburg, Germany</p>
          <p>
            Email:{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
          </p>
        </section>

        {/* ── 2. Data processed ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            2. Data processed, purpose, and legal basis
          </h2>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            a) Account data (email address, display name)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            When you sign in via Google OAuth, Google provides your email address and display name.
            These are stored to create your account and provide the service.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(b) GDPR (performance of a contract).
            <br />
            <strong>Retention:</strong> Until account deletion.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            b) App inputs and outputs (execution data)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            When you run an app, inputs and outputs are stored as an execution record for run
            history and debugging.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(b) GDPR.
            <br />
            <strong>Retention:</strong> Until you delete the app, or 2 years from execution,
            whichever comes first.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            c) Agent tokens
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Agent tokens are stored as cryptographic hashes. The plaintext token is shown once at
            creation and never stored.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(b) GDPR.
            <br />
            <strong>Retention:</strong> Until you delete the token.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            d) App secrets
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Secrets you store for your apps are encrypted at rest.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(b) GDPR.
            <br />
            <strong>Retention:</strong> Until you delete the app.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            e) OAuth connections (Composio integrations)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            If you voluntarily connect an integration (e.g. Google Drive), your OAuth tokens are
            encrypted in our database and forwarded to Composio Inc. as a data processor.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(b) GDPR (only when you actively connect).
            <br />
            <strong>Retention:</strong> Until you disconnect.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            f) IP address (rate limiting)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            IP addresses are used for abuse prevention and rate limiting. They are not retained
            long-term.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest: service
            security).
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            g) Sentry error reports
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Errors are sent to Sentry including IP address, user agent, and minimal stack trace,
            to diagnose and fix bugs.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest: service
            stability).
            <br />
            <strong>Retention:</strong> 30 days.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            h) Vercel Analytics — page view statistics
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            We use Vercel Analytics in its cookie-free, anonymised mode for aggregate page-view
            counts. No personal data is collected.
            <br />
            <strong>Legal basis:</strong> Art. 6(1)(f) GDPR.
          </p>
        </section>

        {/* ── 3. Data processors ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            3. Data processors (Art. 28 GDPR)
          </h2>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            We engage the following service providers under data processing agreements (DPAs):
          </p>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Provider</th>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Purpose</th>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Country / Safeguard</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--muted)" }}>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Vercel Inc.</td>
                <td style={{ padding: "8px 0" }}>Hosting, CDN, edge functions</td>
                <td style={{ padding: "8px 0" }}>USA – US-DPF / SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Supabase Inc.</td>
                <td style={{ padding: "8px 0" }}>Database, auth</td>
                <td style={{ padding: "8px 0" }}>USA (EU region) – SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Resend Inc.</td>
                <td style={{ padding: "8px 0" }}>Transactional email</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Sentry</td>
                <td style={{ padding: "8px 0" }}>Error monitoring</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Composio Inc.</td>
                <td style={{ padding: "8px 0" }}>OAuth proxying for integrations</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs (only for active connections)</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>E2B Inc.</td>
                <td style={{ padding: "8px 0" }}>Sandbox runtime for app execution</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0" }}>Google LLC</td>
                <td style={{ padding: "8px 0" }}>Gemini API (for demo apps using Gemini)</td>
                <td style={{ padding: "8px 0" }}>USA – US-DPF / SCCs</td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            EU → USA transfers are based on Standard Contractual Clauses (SCCs) under Art. 46(2)(c)
            GDPR and, where applicable, the EU-US Data Privacy Framework (US-DPF).
          </p>
        </section>

        {/* ── 4. Your rights ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            4. Your rights (Art. 15–22 GDPR)
          </h2>
          <p style={{ marginBottom: "12px", color: "var(--muted)" }}>
            You have the right to:
          </p>
          <ul
            style={{
              paddingLeft: "20px",
              color: "var(--muted)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <li>
              <strong>Access</strong> (Art. 15) — which data we hold about you
            </li>
            <li>
              <strong>Rectification</strong> (Art. 16) — correction of inaccurate data
            </li>
            <li>
              <strong>Erasure</strong> (Art. 17) — deletion of your data (&ldquo;right to be forgotten&rdquo;)
            </li>
            <li>
              <strong>Restriction of processing</strong> (Art. 18)
            </li>
            <li>
              <strong>Data portability</strong> (Art. 20) — export your data in machine-readable
              format
            </li>
            <li>
              <strong>Objection</strong> (Art. 21) — to processing based on legitimate interest
            </li>
          </ul>
          <p style={{ color: "var(--muted)" }}>
            Send requests to{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
            .
          </p>
        </section>

        {/* ── 5. Supervisory authority ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            5. Right to lodge a complaint
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You have the right to lodge a complaint with a supervisory authority. The competent
            authority for Hamburg, Germany is the{" "}
            <a
              href="https://datenschutz.hamburg.de"
              rel="noopener noreferrer"
              target="_blank"
              style={{ color: "var(--accent)" }}
            >
              Hamburgische Beauftragte für Datenschutz und Informationsfreiheit
            </a>
            , Ludwig-Erhard-Str. 22, 20459 Hamburg.
          </p>
        </section>

        {/* ── 6. Mandatory data ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            6. Mandatory data
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Providing your email address is required to create an account and use the service.
            Without it, no account can be created. All other data (e.g. OAuth connections) is
            voluntary.
          </p>
        </section>

        <p
          style={{
            marginTop: "56px",
            fontSize: "12px",
            color: "var(--muted)",
            opacity: 0.7,
          }}
        >
          Last updated: 2026-05-03
        </p>
      </article>
      <FloomFooter />
    </main>
  );
}
