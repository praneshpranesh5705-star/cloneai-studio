import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PDF and DOCX parsing stay outside the webpack bundle. pdfjs-dist loads its
  // worker as a sibling file at runtime; bundled into .next/server/chunks that
  // path does not exist and every PDF fails with "Setting up fake worker
  // failed". Loading from node_modules keeps the real file paths intact.
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  // Tell Vercel's file tracing to ship the worker next to the function.
  outputFileTracingIncludes: {
    "/api/agents/[id]/documents/upload": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  // Keep the build inside a small container's memory budget.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
