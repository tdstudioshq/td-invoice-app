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
  },
  images: {
    // The premade-designs gallery (/qr-generator/designs) is the one place that
    // renders bucket images through next/image, so its Supabase Storage host has
    // to be allow-listed here. The other bucket galleries (portfolio, gso,
    // taste-budz, mafiaterpz) deliberately use plain <img>, so they need nothing.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tbgyyyffbxveukbihnhp.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
