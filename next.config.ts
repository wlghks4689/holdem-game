import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow parallel local dev servers to use independent build caches.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
