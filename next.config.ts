import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — there are unrelated lockfiles higher up the tree.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Only the portal's single-file upload form sends file bytes through a
      // Server Action (its effective ceiling is this limit; Vercel caps request
      // bodies at ~4.5 MB regardless). Admin uploads bypass Server Actions
      // entirely — browser → Storage via signed upload URLs (app/actions/uploads.ts).
      bodySizeLimit: "4mb",
    },
  },
  // The mylar shop is a self-contained static HTML site served from
  // public/mylar/index.html; the rewrite gives it the clean /mylar URL
  // (the public folder does not resolve index.html automatically).
  async rewrites() {
    return [{ source: "/mylar", destination: "/mylar/index.html" }];
  },
  outputFileTracingIncludes: {
    "/api/invoices/\\[id\\]/pdf": ["./public/invoice-logo.png"],
    // Bundle the cutline overlay PDF into the function (it is read with fs at
    // runtime, not served statically). Add new preset assets here too.
    "/api/cutline/generate": ["./public/assets/cutlines/cut-line-file.pdf"],
    // The premade-designs gallery lists this directory with fs.readdir at
    // render time. It is statically prerendered today (so the read happens on
    // the build machine), but tracing the files in means the page keeps working
    // if it ever renders dynamically — otherwise readdir would throw and the
    // page's catch would silently render an empty gallery.
    "/qr-generator/designs": ["./public/promoimages/**"],
  },
  // No `images.remotePatterns`: every next/image source is local (public/ or a
  // same-origin route). Add a pattern here before rendering any remote image.
};

export default nextConfig;
