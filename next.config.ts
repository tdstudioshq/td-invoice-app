import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — there are unrelated lockfiles higher up the tree.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/invoices/\\[id\\]/pdf": ["./public/invoice-logo.png"],
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
