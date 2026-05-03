import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Datenschutzerklärung · Floom",
  description:
    "Datenschutzerklärung gemäß DSGVO Art. 13 für Floom – welche Daten wir verarbeiten, auf welcher Grundlage und welche Rechte du hast.",
  alternates: { canonical: `${SITE_URL}/datenschutz` },
};

export default function DatenschutzPage() {
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
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "12px" }}>
          DSGVO Art. 13
        </p>
        <h1
          style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "16px" }}
        >
          Datenschutzerklärung
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "8px" }}>
          English version:{" "}
          <a href="/privacy" style={{ color: "var(--accent)" }}>
            /privacy
          </a>
        </p>

        {/* ── 1. Verantwortlicher ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            1. Verantwortlicher
          </h2>
          <p style={{ marginBottom: "8px" }}>
            Verantwortlicher im Sinne der DSGVO ist:
          </p>
          <p style={{ marginBottom: "4px" }}>Federico De Ponte</p>
          <p style={{ marginBottom: "4px" }}>Mansteinstraße 27, 20253 Hamburg, Germany</p>
          <p>
            E-Mail:{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
          </p>
        </section>

        {/* ── 2. Verarbeitete Daten ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            2. Verarbeitete Daten, Zweck und Rechtsgrundlage
          </h2>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            a) Konto-Daten (E-Mail-Adresse, Anzeigename)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Beim Einloggen über Google OAuth übermittelt Google deine E-Mail-Adresse und deinen
            Anzeigenamen. Diese werden in unserer Datenbank gespeichert, um dir ein Nutzerkonto
            anzulegen und den Dienst bereitzustellen.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
            <br />
            <strong>Speicherdauer:</strong> Bis zur Löschung des Kontos.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            b) App-Eingaben und -Ausgaben (Ausführungsdaten)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Wenn du eine App ausführst, werden Eingaben und Ausgaben als Ausführungsprotokoll
            gespeichert. Diese Daten benötigst du für den Run-Verlauf und das Debugging.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO.
            <br />
            <strong>Speicherdauer:</strong> Bis zur Löschung der App oder 2 Jahre ab Ausführung,
            je nachdem was zuerst eintritt.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            c) Agent-Token
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Agent-Token werden als kryptografische Hashes gespeichert. Der Klartext-Token wird
            dir einmalig bei der Erstellung angezeigt und danach nicht mehr gespeichert.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO.
            <br />
            <strong>Speicherdauer:</strong> Bis zur manuellen Löschung durch dich.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            d) App-Secrets
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Secrets, die du für deine Apps hinterlegst, werden verschlüsselt gespeichert.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO.
            <br />
            <strong>Speicherdauer:</strong> Bis zur Löschung der App.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            e) OAuth-Verbindungen (Composio-Integrationen)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Wenn du freiwillig eine Integration (z. B. Google Drive) verknüpfst, werden deine
            OAuth-Token verschlüsselt in unserer Datenbank gespeichert und an Composio Inc. als
            Auftragsverarbeiter übermittelt.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (nur bei aktiver
            Verbindung durch dich).
            <br />
            <strong>Speicherdauer:</strong> Bis zur Trennung der Verbindung durch dich.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            f) IP-Adresse (Rate-Limiting)
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            IP-Adressen werden zur Missbrauchsprävention und Rate-Limiting ausgewertet, aber
            nicht dauerhaft gespeichert.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse:
            Betriebssicherheit des Dienstes).
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            g) Sentry – Fehlerberichte
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Auftretende Fehler werden inklusive IP-Adresse, User-Agent und minimalem Stack-Trace
            an Sentry übermittelt, um Bugs zu beheben.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse:
            Dienststabilität).
            <br />
            <strong>Speicherdauer:</strong> 30 Tage.
          </p>

          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            h) Vercel Analytics – Seitenaufrufstatistiken
          </h3>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Wir nutzen Vercel Analytics in der cookie-freien, anonymisierten Variante für
            aggregierte Seitenaufrufzahlen. Personenbezogene Daten werden dabei nicht erhoben.
            <br />
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO.
          </p>
        </section>

        {/* ── 3. Auftragsverarbeiter ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            3. Auftragsverarbeiter (Art. 28 DSGVO)
          </h2>
          <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
            Wir setzen folgende Dienstleister ein, mit denen wir Verträge zur
            Auftragsverarbeitung (AVV) geschlossen haben oder schließen:
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
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Anbieter</th>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Zweck</th>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Land / Garantie</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--muted)" }}>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Vercel Inc.</td>
                <td style={{ padding: "8px 0" }}>Hosting, CDN, Edge-Funktionen</td>
                <td style={{ padding: "8px 0" }}>USA – US-DPF / SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Supabase Inc.</td>
                <td style={{ padding: "8px 0" }}>Datenbank, Auth</td>
                <td style={{ padding: "8px 0" }}>USA (EU-Region) – SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Resend Inc.</td>
                <td style={{ padding: "8px 0" }}>Transaktionale E-Mails</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Sentry</td>
                <td style={{ padding: "8px 0" }}>Fehlerüberwachung</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>Composio Inc.</td>
                <td style={{ padding: "8px 0" }}>OAuth-Proxying für Integrationen</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs (nur bei aktiver Verbindung)</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 0" }}>E2B Inc.</td>
                <td style={{ padding: "8px 0" }}>Sandbox-Laufzeitumgebung für Apps</td>
                <td style={{ padding: "8px 0" }}>USA – SCCs</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0" }}>Google LLC</td>
                <td style={{ padding: "8px 0" }}>Gemini API (für Demo-Apps, die Gemini verwenden)</td>
                <td style={{ padding: "8px 0" }}>USA – US-DPF / SCCs</td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            EU → USA-Übertragungen erfolgen auf Grundlage von Standardvertragsklauseln (SCCs) gemäß
            Art. 46 Abs. 2 lit. c DSGVO sowie — sofern vorhanden — dem EU-US Data Privacy Framework
            (US-DPF).
          </p>
        </section>

        {/* ── 4. Deine Rechte ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
            4. Deine Rechte (Art. 15–22 DSGVO)
          </h2>
          <p style={{ marginBottom: "12px", color: "var(--muted)" }}>
            Du hast das Recht auf:
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
              <strong>Auskunft</strong> (Art. 15) – welche Daten wir über dich speichern
            </li>
            <li>
              <strong>Berichtigung</strong> (Art. 16) – Korrektur unrichtiger Daten
            </li>
            <li>
              <strong>Löschung</strong> (Art. 17) – Löschung deiner Daten (&ldquo;Recht auf
              Vergessenwerden&rdquo;)
            </li>
            <li>
              <strong>Einschränkung der Verarbeitung</strong> (Art. 18)
            </li>
            <li>
              <strong>Datenübertragbarkeit</strong> (Art. 20) – Export deiner Daten in
              maschinenlesbarem Format
            </li>
            <li>
              <strong>Widerspruch</strong> (Art. 21) – gegen Verarbeitungen auf Basis berechtigten
              Interesses
            </li>
          </ul>
          <p style={{ color: "var(--muted)" }}>
            Anfragen richtest du an{" "}
            <a href="mailto:team@floom.dev" style={{ color: "var(--accent)" }}>
              team@floom.dev
            </a>
            .
          </p>
        </section>

        {/* ── 5. Beschwerderecht ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            5. Beschwerderecht bei der Aufsichtsbehörde
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Du hast das Recht, dich bei der zuständigen Datenschutzbehörde zu beschweren. Für
            Hamburg ist das der{" "}
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

        {/* ── 6. Pflichtangaben ── */}
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: "32px", marginTop: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            6. Pflichtangabe der Daten
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Die Angabe deiner E-Mail-Adresse ist erforderlich, um ein Konto zu erstellen und den
            Dienst zu nutzen. Ohne diese Angabe kann kein Konto angelegt werden. Alle anderen
            Daten (z. B. OAuth-Verbindungen) sind freiwillig.
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
          Stand: 2026-05-03
        </p>
      </article>
      <FloomFooter />
    </main>
  );
}
