import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Floom, Inc.: acceptable use, intellectual property, disclaimers, and governing law.",
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of
          floom.dev and related services (collectively, the &ldquo;Service&rdquo;) operated by
          <strong> Floom, Inc.</strong>, a United States corporation (&ldquo;Floom&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By using the Service, you
          agree to these Terms.
        </p>

        {/* ── 1. Eligibility ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            1. Eligibility
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You must be at least 13 years old to use the Service. If you are using the Service on
            behalf of an organization, you represent that you have authority to bind that
            organization to these Terms.
          </p>
        </section>

        {/* ── 2. Account ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            2. Your account
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You are responsible for maintaining the confidentiality of your credentials and for all
            activity that occurs under your account. You must notify us promptly at{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>{" "}
            if you believe your account has been compromised.
          </p>
        </section>

        {/* ── 3. Acceptable use ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            3. Acceptable use
          </h2>
          <p style={{ marginBottom: "12px", color: "var(--muted)" }}>
            You may use the Service only for lawful purposes. You may not use the Service to:
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
            <li>Violate any applicable law or regulation</li>
            <li>Infringe the intellectual property rights of others</li>
            <li>Distribute malware, spyware, or other malicious code</li>
            <li>Engage in abusive, harassing, or harmful conduct toward others</li>
            <li>
              Attempt to gain unauthorized access to the Service or its underlying infrastructure
            </li>
            <li>Circumvent rate limits, access controls, or usage policies</li>
            <li>
              Build or publish apps that process sensitive personal data without appropriate
              safeguards
            </li>
          </ul>
          <p style={{ color: "var(--muted)" }}>
            We reserve the right to suspend or terminate accounts and remove apps that violate
            these Terms without prior notice.
          </p>
        </section>

        {/* ── 4. Your content ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            4. Your content
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You retain ownership of the apps, code, and other content you create using the Service
            (&ldquo;Your Content&rdquo;). By publishing an app as public, you grant other users a
            limited, non-exclusive right to run that app through the Service. You are solely
            responsible for Your Content, including ensuring you have all rights necessary to
            publish it.
          </p>
        </section>

        {/* ── 5. Intellectual property ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            5. Intellectual property
          </h2>
          <p style={{ color: "var(--muted)" }}>
            The Service, including its software, design, and documentation, is owned by Floom,
            Inc. and protected by United States and international intellectual property laws. You
            may not copy, modify, distribute, sell, or lease any part of the Service without our
            written permission, except as permitted by applicable open-source license terms.
          </p>
        </section>

        {/* ── 6. Third-party services ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            6. Third-party services
          </h2>
          <p style={{ color: "var(--muted)" }}>
            The Service relies on third-party providers including Vercel, Supabase, E2B, and
            others. We are not responsible for the availability or content of third-party services.
            Your use of any third-party service is governed by that service&rsquo;s own terms.
          </p>
        </section>

        {/* ── 7. Disclaimers ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            7. Disclaimer of warranties
          </h2>
          <p style={{ color: "var(--muted)" }}>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
            WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
            WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
            COMPONENTS.
          </p>
        </section>

        {/* ── 8. Limitation of liability ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            8. Limitation of liability
          </h2>
          <p style={{ color: "var(--muted)" }}>
            TO THE FULLEST EXTENT PERMITTED BY LAW, FLOOM, INC. SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
            PROFITS OR DATA, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE
            HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU FOR
            ANY CLAIM ARISING FROM THESE TERMS SHALL NOT EXCEED THE GREATER OF (A) $100 USD OR
            (B) THE AMOUNTS YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
          </p>
        </section>

        {/* ── 9. Indemnification ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            9. Indemnification
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You agree to indemnify and hold harmless Floom, Inc. and its officers, directors,
            employees, and agents from any claims, damages, losses, or expenses (including
            reasonable legal fees) arising from Your Content, your use of the Service, or your
            violation of these Terms.
          </p>
        </section>

        {/* ── 10. Termination ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            10. Termination
          </h2>
          <p style={{ color: "var(--muted)" }}>
            You may stop using the Service at any time. We may suspend or terminate your access
            for any violation of these Terms, or for operational reasons, with or without notice.
            Upon termination, your right to use the Service ends immediately. Sections covering
            intellectual property, disclaimers, limitation of liability, and governing law survive
            termination.
          </p>
        </section>

        {/* ── 11. Changes ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            11. Changes to these Terms
          </h2>
          <p style={{ color: "var(--muted)" }}>
            We may update these Terms from time to time. We will update the &ldquo;Last
            updated&rdquo; date above. Continued use of the Service after changes constitutes
            acceptance of the revised Terms.
          </p>
        </section>

        {/* ── 12. Governing law ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            12. Governing law
          </h2>
          <p style={{ color: "var(--muted)" }}>
            These Terms are governed by the laws of the United States. Any disputes arising from
            these Terms or your use of the Service shall be resolved in courts of competent
            jurisdiction in the United States.
          </p>
        </section>

        {/* ── 13. Contact ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            13. Contact
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Questions about these Terms? Contact us at{" "}
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
