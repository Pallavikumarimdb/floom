import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Floom — Ship AI apps fast";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #faf9f5 0%, #f1efe7 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#11110f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#047857",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            f
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span>floom</span>
            <span style={{ color: "#047857" }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
            }}
          >
            <span>Ship AI apps</span>
            <span style={{ color: "#047857", textDecoration: "underline", textDecorationThickness: 6, textUnderlineOffset: 14 }}>
              fast
            </span>
            <span>.</span>
          </div>
          <div style={{ fontSize: 32, color: "#5a564f", fontWeight: 500 }}>
            Localhost to live in 60 seconds.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#5a564f",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div>floom-60sec.vercel.app</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: "#047857" }} />
            <span>Open source · MCP · REST · UI</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
