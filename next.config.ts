import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the build inside a small container's memory budget.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
