import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // goodbooks-10k cover URLs
    remotePatterns: [{ protocol: "https", hostname: "images.gr-assets.com" }],
  },
};

export default nextConfig;
