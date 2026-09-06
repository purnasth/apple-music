import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static — no server, no DB. Deploys to Cloudflare Pages as plain assets.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
