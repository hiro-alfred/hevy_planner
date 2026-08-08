import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for lib/ logic only — no React rendering, so the plain node
// environment is enough. Tests that touch the DB point DATABASE_PATH at a temp
// file before importing the db client (see src/lib/hevy/catalog.test.ts).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
