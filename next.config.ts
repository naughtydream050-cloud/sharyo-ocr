import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pizzip', 'docxtemplater'],
  images: { remotePatterns: [] },
};

export default nextConfig;
