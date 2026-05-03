import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Impressum · Floom",
  description: "Anbieterkennzeichnung nach § 5 TMG.",
  alternates: { canonical: `${SITE_URL}/impressum` },
};

export default function ImpressumPage() {
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
        <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "32px" }}>
          Impressum
        </h1>

        <p style={{ marginBottom: "8px" }}>
          <strong>Angaben gemäß § 5 TMG:</strong>
        </p>
        <p style={{ marginBottom: "4px" }}>Federico De Ponte</p>
        <p style={{ marginBottom: "4px" }}>Mansteinstraße 27</p>
        <p style={{ marginBottom: "32px" }}>20253 Hamburg, Germany</p>

        <p style={{ marginBottom: "8px" }}>
          <strong>Kontakt:</strong>
        </p>
        <p style={{ marginBottom: "4px" }}>
          E-Mail:{" "}
          <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
            team@floom.dev
          </a>
        </p>
        <p style={{ marginBottom: "32px" }}>
          Web:{" "}
          <a href="https://floom.dev" style={{ color: "var(--accent)" }}>
            https://floom.dev
          </a>
        </p>

        <p style={{ marginBottom: "8px" }}>
          <strong>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:</strong>
        </p>
        <p style={{ marginBottom: "32px" }}>Federico De Ponte (Anschrift wie oben)</p>

        <h2
          style={{ fontSize: "20px", fontWeight: 700, marginTop: "40px", marginBottom: "16px" }}
        >
          Haftungsausschluss
        </h2>

        <p style={{ marginBottom: "16px" }}>
          <strong>Haftung für Inhalte:</strong> Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG
          für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
          §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte
          oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die
          auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung
          der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
        </p>

        <p style={{ marginBottom: "16px" }}>
          <strong>Haftung für Links:</strong> Unser Angebot enthält Links zu externen Websites
          Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese
          fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist
          stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
        </p>

        <p style={{ marginBottom: "16px" }}>
          <strong>Urheberrecht:</strong> Die durch die Seitenbetreiber erstellten Inhalte und
          Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Beiträge Dritter sind
          als solche gekennzeichnet.
        </p>

        <h2
          style={{ fontSize: "20px", fontWeight: 700, marginTop: "40px", marginBottom: "16px" }}
        >
          Online-Streitbeilegung
        </h2>

        <p style={{ marginBottom: "16px" }}>
          Die EU-Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            rel="noopener noreferrer"
            target="_blank"
            style={{ color: "var(--accent)" }}
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          . Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor
          einer Verbraucherschlichtungsstelle teilzunehmen.
        </p>

        <p style={{ marginTop: "56px", fontSize: "12px", color: "var(--muted)", opacity: 0.7 }}>
          Stand: 2026-05-03
        </p>
      </article>
      <FloomFooter />
    </main>
  );
}
