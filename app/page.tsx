import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Floom v0</p>
        <h1>Run generated apps from JSON Schema.</h1>
        <p>
          This scaffold keeps the surface to two routes: a tiny index and a
          generated app form.
        </p>
        <Link className="button" href="/p/demo">
          Open demo app
        </Link>
      </section>
    </main>
  );
}
