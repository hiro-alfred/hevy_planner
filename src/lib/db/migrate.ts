import { migrate } from "drizzle-orm/mysql2/migrator";
import { db } from "./client";

// Applies any pending migrations from ./drizzle (tracked in
// __drizzle_migrations, so this is idempotent). Called once per server boot
// from src/instrumentation.ts — there is no manual migration step.
// The Docker image must ship the drizzle/ folder next to the working dir.

/**
 * How long to keep retrying a database that is not accepting connections yet.
 *
 * The file-backed database this replaced was always ready the moment the
 * process was. MariaDB is a separate container that routinely takes a few
 * seconds longer than the app to accept connections, and compose's
 * `depends_on: service_healthy` only covers an orchestrated start — a bare
 * `docker start`, a host reboot, or a MariaDB restart under a running app all
 * reintroduce the race. Without this the app crash-loops on boot.
 */
const CONNECT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 1_000;

/** Connection-phase errors worth waiting out; anything else is a real fault. */
const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ER_GET_CONNECTION_TIMEOUT",
  "PROTOCOL_CONNECTION_LOST",
]);

function isTransient(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code !== undefined && TRANSIENT_CODES.has(code);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runMigrations(): Promise<void> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;

  for (;;) {
    try {
      await migrate(db, { migrationsFolder: "./drizzle" });
      return;
    } catch (error) {
      // A schema error is permanent: retrying it for a minute only delays a
      // failure the operator has to see. Only wait out "not up yet".
      if (!isTransient(error) || Date.now() >= deadline) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
}
