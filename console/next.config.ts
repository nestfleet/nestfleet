import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin output tracing to this console subdirectory to avoid
  // Next.js incorrectly picking up the parent monorepo lockfile.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
