import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — there are unrelated lockfiles higher up the tree.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/invoices/\\[id\\]/pdf": ["./public/invoice-logo.png"],
  },
};

export default nextConfig;
