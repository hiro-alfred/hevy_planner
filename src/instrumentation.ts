export async function register() {
  // Runs once per server start, in the Node runtime only (never edge/client),
  // so a fresh clone or container boots straight into a migrated database.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("@/lib/db/migrate");
    runMigrations();
  }
}
