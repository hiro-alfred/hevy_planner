export async function register() {
  // Runs once per server start, in the Node runtime only (never edge/client),
  // so a fresh clone or container boots straight into a migrated database.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("@/lib/db/migrate");
    await runMigrations();

    // Upgrades any secret still stored as plaintext, so switching encryption on
    // does not invalidate a key the user already entered. No-op once done.
    const { migrateSecretsToEncrypted } = await import("@/lib/settings");
    await migrateSecretsToEncrypted();
  }
}
