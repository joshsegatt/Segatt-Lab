import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Keeps verification screenshots clean; build and runtime errors still show.
  devIndicators: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

