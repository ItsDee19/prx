import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: must stay external so Turbopack/webpack don't try to bundle it.
  serverExternalPackages: ["better-sqlite3"],
  // Hide the Next.js dev badge and the X-Powered-By header.
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
