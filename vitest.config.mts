import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for lib/ logic only — no React rendering, so the plain node
// environment is enough. Tests that touch the DB claim a throwaway MariaDB
// database and point DATABASE_URL at it before importing the db client
// (see src/test/database.ts). Start the server first: npm run test:db:up
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside an RSC graph — see the stub's comment.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Turns "database not running" into one clear instruction instead of a
    // pile of parallel driver errors.
    globalSetup: ["./src/test/global-setup.ts"],
    // Each DB-touching file creates and migrates its own database; on a cold
    // MariaDB the first of those is slower than the 5s default allows.
    hookTimeout: 30_000,
  },
});
