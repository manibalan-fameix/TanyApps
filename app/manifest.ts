import type { MetadataRoute } from "next"

// Lets phones install ShowMoto to the home screen and open it without browser chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShowMoto",
    short_name: "ShowMoto",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  }
}
