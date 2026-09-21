import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/clients", "/client-portals", "/invoices", "/settings", "/portal", "/partner", "/zaza-orders", "/account", "/onboarding", "/login", "/sign-up", "/reset-password", "/auth/", "/designs", "/gso", "/taste-budz", "/mafiaterpz", "/martyig", "/premadedesigns", "/newpremades", "/whiteash", "/mylar-requests", "/design-requests", "/qr", "/q/"],
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).href,
  };
}
