import type { MetadataRoute } from "next"

// Lets phones install TanyApps to the home screen and open it without browser chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TanyApps",
    short_name: "TanyApps",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
