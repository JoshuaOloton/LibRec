import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Playwright run builds into its own directory so it can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // goodbooks-10k cover URLs
    remotePatterns: [{ protocol: "https", hostname: "images.gr-assets.com" }],
  },
};

export default nextConfig;
