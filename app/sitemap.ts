import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/mylar-printing", "/portfolio", "/custom-design-request"].map((path) => ({
    url: new URL(path, SITE_URL).href,
  }));
}
