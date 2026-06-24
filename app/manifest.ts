import type { MetadataRoute } from "next";

// Web App Manifest — makes the app installable as a PWA. Next.js auto-injects
// the <link rel="manifest"> tag wherever this file convention exists.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TD Studios — Invoicing",
    short_name: "TD Invoices",
    description:
      "Manage clients, create invoices, track payments, and export PDFs.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#18181b",
    theme_color: "#18181b",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
