import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 180, height: 180 };

// Apple touch icon: matches the floom-mark.svg shape (rounded-square + chevron
// reads as forward/play arrow). Drawn here in JSX rather than referenced from
// public/floom-mark.svg because next/og's Satori doesn't render arbitrary SVG
// files — but it does render inline <svg> with a <path>. Same path data as
// public/floom-mark.svg, normalized to fill the 180x180 canvas.
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
          background: "#faf9f5",
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="24 24 52 52"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M32 26 h20 l22 22 a3 3 0 0 1 0 4 l-22 22 h-20 a6 6 0 0 1 -6 -6 v-36 a6 6 0 0 1 6 -6 z"
            fill="#059669"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
