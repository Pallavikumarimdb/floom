import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Floom",
    short_name: "Floom",
    description:
      "Localhost to live in 60 seconds. Your AI just wrote some code. Floom puts it online.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f5",
    theme_color: "#047857",
    icons: [
      { src: "/floom-mark.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/favicon.ico", sizes: "256x256", type: "image/x-icon" },
    ],
  };
}
