import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev badge and the X-Powered-By header.
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
