import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

// Applies any pending migrations from ./drizzle (tracked in
// __drizzle_migrations, so this is idempotent). Called once per server boot
// from src/instrumentation.ts — there is no manual migration step.
// The Docker image must ship the drizzle/ folder next to the working dir.
export function runMigrations() {
  migrate(db, { migrationsFolder: "./drizzle" });
}
