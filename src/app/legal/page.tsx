import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

const SITE_URL = "https://floom-60sec.vercel.app";

export const metadata: Metadata = {
  title: "Legal & privacy",
  description:
    "Floom alpha service notice: data handled, private/public apps, abuse policy, contact. Honest scope, no enterprise theatre.",
  alternates: { canonical: `${SITE_URL}/legal` },
  openGraph: {
    type: "article",
    title: "Floom — Legal & privacy",
    description: "Alpha service notice. Honest scope.",
    url: `${SITE_URL}/legal`,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Floom — Legal & privacy",
    description: "Alpha service notice. Honest scope.",
    images: [`${SITE_URL}/opengraph-image`],
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[#ded8cc] py-8">
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-neutral-600">{children}</div>
    </section>
  );
}

export default function LegalPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />

      <article className="mx-auto max-w-3xl px-5 py-14">
        <p className="mb-3 text-sm font-semibold text-emerald-700">
          Floom alpha notice
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Legal, privacy, and contact.
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          This page is a minimal alpha notice for testers using Floom.
        </p>

        <Section title="Service status">
          <p>
            Floom is an alpha service for publishing small function-style apps.
            Availability, limits, and supported runtimes may change during alpha.
          </p>
        </Section>

        <Section title="User code">
          <p>
            Users are responsible for the code, inputs, outputs, and apps they
            publish. Do not publish apps that process sensitive data unless the
            data handling has been reviewed for that use case.
          </p>
        </Section>

        <Section title="Data handled by Floom">
          <p>
            Floom stores account records, app metadata, app bundles, app versions,
            run records, and token metadata. Agent tokens are stored as hashes;
            raw tokens are shown once at creation.
          </p>
          <p>
            App inputs and outputs can be stored with execution records for run
            history and debugging.
          </p>
        </Section>

        <Section title="Private and public apps">
          <p>
            Apps are private by default. Apps with <code>public: true</code> in
            the manifest can be viewed and run by anyone with the app URL.
          </p>
        </Section>

        <Section title="Abuse and removal">
          <p>
            Apps that create abuse, privacy risk, security risk, or operational
            risk may be disabled or removed during alpha.
          </p>
        </Section>

        <Section title="Cookies and tracking">
          <p>
            Floom does not use third-party analytics, advertising, or tracking
            cookies. The only cookies we set are Supabase Auth session cookies
            (issued after sign-in, scoped to floom-60sec.vercel.app) and a
            small CSRF cookie used by the auth callback. No banner is shown
            because no consent is required for strictly necessary auth
            cookies.
          </p>
        </Section>

        <Section title="Pricing">
          <p>
            Public apps and public runs are free during alpha. There is no
            payment, no card on file, and no automatic charge.
          </p>
          <p className="text-sm text-neutral-500">
            Pricing for private apps, dependencies, and higher run limits will
            be announced before billing starts. Anyone using Floom today owes
            nothing.
          </p>
        </Section>

        <Section title="Status and outages">
          <p>
            For service status and outage updates, follow{" "}
            <a
              href="https://github.com/floomhq/floom-minimal"
              className="font-semibold text-emerald-700 underline underline-offset-2"
            >
              floomhq/floom-minimal
            </a>{" "}
            on GitHub or watch our Discord. A dedicated status page lands in
            v0.1.
          </p>
        </Section>

        <Section title="Security">
          <p>
            For security reports, email{" "}
            <code>security@floom.dev</code>. See{" "}
            <a
              href="https://github.com/floomhq/floom-minimal/blob/main/SECURITY.md"
              className="font-semibold text-emerald-700 underline underline-offset-2"
            >
              SECURITY.md
            </a>{" "}
            for scope and disclosure policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For access, deletion, or abuse reports, contact{" "}
            <code>team@floom.dev</code>.
          </p>
        </Section>
      </article>
    </main>
  );
}
