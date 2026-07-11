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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.cdninstagram.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.fbcdn.net",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
