import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

// Per-test-file MariaDB database, created and dropped around the file.
//
// The app's db client reads DATABASE_URL ONCE, at module-evaluation time. So
// createTempDatabase() must run before anything that imports the client — call
// it at the top level of the test file, and import the modules under test
// dynamically inside beforeAll. Everything below follows from that.

/** Server to create the throwaway databases on — see docker-compose.test.yml. */
const DEFAULT_ADMIN_URL = "mysql://root:root@127.0.0.1:3307";

export function adminUrl(): string {
  return (process.env.TEST_DATABASE_URL ?? DEFAULT_ADMIN_URL).replace(/\/+$/, "");
}

export interface TempDatabase {
  name: string;
  migrate(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Claims a uniquely-named database and points DATABASE_URL at it.
 *
 * A database per FILE, not per test: vitest runs files in parallel workers, so
 * sharing one would let an unrelated file's DELETE land in the middle of
 * another's assertions. The random suffix also means a crashed run cannot
 * poison the next one with a half-migrated leftover.
 */
export function createTempDatabase(prefix = "hevy_test"): TempDatabase {
  const name = `${prefix}_${randomBytes(6).toString("hex")}`;
  process.env.DATABASE_URL = `${adminUrl()}/${name}`;

  return {
    name,

    async migrate() {
      const admin = await mysql.createConnection(adminUrl());
      try {
        await admin.query(`CREATE DATABASE \`${name}\``);
      } finally {
        await admin.end();
      }
      // Imported only now: this is the first thing that touches the db client,
      // and by here DATABASE_URL names a database that exists.
      const { runMigrations } = await import("@/lib/db/migrate");
      await runMigrations();
    },

    async cleanup() {
      // Close the app's pool FIRST. Its connections are open against this
      // database; leaving them would both block the DROP and keep the vitest
      // worker's event loop alive until the run times out.
      const { db } = await import("@/lib/db/client");
      await db.$client.end();

      const admin = await mysql.createConnection(adminUrl());
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } finally {
        await admin.end();
      }
    },
  };
}
