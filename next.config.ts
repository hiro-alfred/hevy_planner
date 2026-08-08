import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone: a self-contained server with only the node_modules
  // it actually uses, so the Docker image doesn't ship the whole dependency
  // tree. See the Dockerfile — it copies that output rather than the source.
  output: "standalone",

  // better-sqlite3 is a native module. It must be require()d from the Node
  // runtime at runtime rather than bundled, or the .node binding is lost.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
