import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Floom, Inc.: what data we collect, how we use it, and your rights.",
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
          Last updated: 2026-05-03
        </p>
        <h1
          style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "16px" }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
          This Privacy Policy describes how Floom, Inc. (&ldquo;Floom&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and shares information when you
          use floom.dev and related services (collectively, the &ldquo;Service&rdquo;).
        </p>

        {/* ── 1. Controller ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            1. Who we are
          </h2>
          <p style={{ color: "var(--muted)" }}>
            The Service is operated by <strong>Floom, Inc.</strong>, a United States corporation.
            Contact us at{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
            .
          </p>
        </section>

        {/* ── 2. Data collected ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            2. Information we collect
          </h2>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            a) Account data
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            When you sign in via Google OAuth, Google provides your email address and display name.
            We store these to create and identify your account.
            <br />
            <strong>Retention:</strong> Until you delete your account.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            b) App run inputs and outputs
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            When you run an app, inputs and outputs are stored as an execution record for run
            history and debugging.
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
            <strong>Retention:</strong> Until you delete the token.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            d) App secrets
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Secrets you store for your apps are encrypted at rest.
            <br />
            <strong>Retention:</strong> Until you delete the app.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            e) OAuth connections (Composio integrations)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            If you choose to connect an external integration (e.g. Google Drive), your OAuth tokens
            are encrypted in our database and forwarded to Composio Inc. as a sub-processor.
            This is opt-in only.
            <br />
            <strong>Retention:</strong> Until you disconnect.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            f) IP address
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            IP addresses are used for rate limiting and abuse prevention. They are not retained
            long-term and are not associated with your account record.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            g) Error reports
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Errors are sent to Sentry including IP address, user agent, and minimal stack trace to
            diagnose bugs.
            <br />
            <strong>Retention:</strong> 30 days.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            h) Aggregate analytics
          </h3>
          <p style={{ marginBottom: "0", color: "var(--muted)" }}>
            We use Vercel Analytics in its cookie-free, anonymised mode for aggregate page-view
            counts. No personal data is collected through analytics.
          </p>
        </section>

        {/* ── 3. How we use information ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            3. How we use your information
          </h2>
          <ul
            style={{
              paddingLeft: "20px",
              color: "var(--muted)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <li>To provide, maintain, and improve the Service</li>
            <li>To authenticate you and secure your account</li>
            <li>To detect abuse and enforce rate limits</li>
            <li>To send transactional emails (account, service notices)</li>
            <li>To diagnose and fix errors</li>
          </ul>
          <p style={{ marginTop: "16px", color: "var(--muted)" }}>
            We do not sell your personal information to third parties. We do not use your data for
            advertising.
          </p>
        </section>

        {/* ── 4. Sub-processors ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            4. Service providers
          </h2>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            We share information with the following providers solely to operate the Service:
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
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Country</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--muted)" }}>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Vercel Inc.</td>
                <td style={{ padding: "8px 0" }}>Hosting, CDN, edge functions</td>
                <td style={{ padding: "8px 0" }}>United States</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Supabase Inc.</td>
                <td style={{ padding: "8px 0" }}>Database, authentication</td>
                <td style={{ padding: "8px 0" }}>United States (EU region)</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Resend Inc.</td>
                <td style={{ padding: "8px 0" }}>Transactional email</td>
                <td style={{ padding: "8px 0" }}>United States</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Sentry</td>
                <td style={{ padding: "8px 0" }}>Error monitoring</td>
                <td style={{ padding: "8px 0" }}>United States</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Composio Inc.</td>
                <td style={{ padding: "8px 0" }}>OAuth proxying for integrations (opt-in)</td>
                <td style={{ padding: "8px 0" }}>United States</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>E2B Inc.</td>
                <td style={{ padding: "8px 0" }}>Sandbox runtime for app execution</td>
                <td style={{ padding: "8px 0" }}>United States</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0" }}>Google LLC</td>
                <td style={{ padding: "8px 0" }}>Gemini API (demo apps)</td>
                <td style={{ padding: "8px 0" }}>United States</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ── 5. CCPA ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            5. California consumer rights (CCPA)
          </h2>
          <p style={{ marginBottom: "12px", color: "var(--muted)" }}>
            If you are a California resident, you have the right to:
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
            <li><strong>Know</strong>: what personal information we collect and how we use it</li>
            <li><strong>Access</strong>: a copy of your personal information</li>
            <li><strong>Delete</strong>: your personal information, subject to certain exceptions</li>
            <li><strong>Opt out of sale</strong>: we do not sell personal information</li>
            <li><strong>Non-discrimination</strong>: we will not penalize you for exercising these rights</li>
          </ul>
          <p style={{ color: "var(--muted)" }}>
            To exercise any of these rights, email{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
            .
          </p>
        </section>

        {/* ── 6. Your rights ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            6. Data access and deletion
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You may request access to, correction of, or deletion of your data at any time by
            emailing{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
            . Account deletion removes your profile, app records, and run history.
          </p>
        </section>

        {/* ── 7. Cookies ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            7. Cookies
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Floom sets a session cookie after sign-in for authentication. We do not use advertising
            cookies. Vercel Analytics is cookie-free.
          </p>
        </section>

        {/* ── 8. Changes ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            8. Changes to this policy
          </h2>
          <p style={{ color: "var(--muted)" }}>
            We may update this policy from time to time. We will update the &ldquo;Last
            updated&rdquo; date at the top. Continued use of the Service after changes constitutes
            acceptance of the revised policy.
          </p>
        </section>

        {/* ── 9. Contact ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            9. Contact
          </h2>
          <p style={{ color: "var(--muted)" }}>
            For privacy questions or requests, contact us at{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
            .
          </p>
        </section>
      </article>
      <FloomFooter />
    </main>
  );
}
