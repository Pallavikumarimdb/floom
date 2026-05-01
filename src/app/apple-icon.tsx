import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 180, height: 180 };

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#047857",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 110,
          fontWeight: 900,
          letterSpacing: "-0.04em",
        }}
      >
        f
      </div>
    ),
    { ...size },
  );
}
