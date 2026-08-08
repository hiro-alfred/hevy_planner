import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone: a self-contained server with only the node_modules
  // it actually uses, so the Docker image doesn't ship the whole dependency
  // tree. See the Dockerfile — it copies that output rather than the source.
  output: "standalone",

  // mysql2 resolves some of its internals dynamically, which the bundler
  // cannot follow. Leaving it external keeps it a plain runtime require.
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
