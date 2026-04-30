import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Floom v0</p>
        <h1>Localhost to live apps.</h1>
        <p>
          Ship a tiny function app as a generated UI backed by JSON Schema,
          Supabase records, and sandbox execution.
        </p>
        <div className="ctaGrid">
          <a className="ctaPanel" href="https://github.com/floomhq/floomit">
            <span className="ctaLabel">Install</span>
            <strong>floomit skill</strong>
            <span>Floom MCP next</span>
          </a>
          <Link className="ctaPanel ctaPanelPrimary" href="/p/demo">
            <span className="ctaLabel">Run</span>
            <strong>Test live app</strong>
            <span>Generated UI</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
