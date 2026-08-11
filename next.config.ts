import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone: a self-contained server with only the node_modules
  // it actually uses, so the Docker image doesn't ship the whole dependency
  // tree. See the Dockerfile — it copies that output rather than the source.
  output: "standalone",

  // mysql2 resolves some of its internals dynamically, which the bundler
  // cannot follow. Leaving it external keeps it a plain runtime require.
  serverExternalPackages: ["mysql2"],

  // Dev only: `next dev` answers /_next/* and the HMR socket with 403 for any
  // origin other than the host it was started on (localhost). Reaching the dev
  // server from a phone or another machine on the LAN needs that origin listed;
  // the wildcard keeps it working across DHCP lease changes.
  allowedDevOrigins: ["192.168.0.*"],
};

export default nextConfig;
