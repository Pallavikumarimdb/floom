import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Floom app";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AppOpengraphImage({ params }: Props) {
  const { slug } = await params;

  let appName = slug;
  let description: string | null = null;
  try {
    const res = await fetch(`https://floom.dev/api/apps/${slug}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const data = (await res.json()) as { name?: string; description?: string };
      if (data.name) appName = data.name;
      if (data.description) description = data.description.slice(0, 180);
    }
  } catch {
    // Use slug fallback.
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(135deg, #faf9f5 0%, #efece2 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#11110f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 7,
              background: "#047857",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 19,
              fontWeight: 800,
            }}
          >
            f
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span>floom</span>
            <span style={{ color: "#047857" }}>.</span>
          </div>
          <div style={{ display: "flex", marginLeft: 16, fontSize: 18, color: "#8b8680", fontFamily: "ui-monospace, monospace" }}>
            <span>{`/p/${slug}`}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 22, color: "#047857", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            App preview
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            {appName}
          </div>
          {description && (
            <div style={{ fontSize: 26, color: "#5a564f", fontWeight: 500, lineHeight: 1.4, maxWidth: 950 }}>
              {description}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            color: "#5a564f",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <span style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: "#047857" }} />
          <span>Run live · REST · MCP</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
