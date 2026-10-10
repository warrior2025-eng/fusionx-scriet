import type { MetadataRoute } from "next";
import { siteName } from "@/lib/site-config";

// Served at /manifest.webmanifest: what a phone uses for "Add to Home Screen".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: "FusionX",
    description: "Student Innovation & Research Network",
    start_url: "/",
    display: "standalone",
    // The logo's navy.
    background_color: "#00030D",
    theme_color: "#00030D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
