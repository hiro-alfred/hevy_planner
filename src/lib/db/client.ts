import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// MariaDB connection pool. Unlike the file-backed database this replaced, the
// server is a separate process that may not be up yet when the app boots —
// see ./migrate.ts for the retry that covers container start order.

const DEFAULT_URL = "mysql://hevy:hevy@127.0.0.1:3306/hevy_planner";

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

function createDb() {
  const pool = mysql.createPool({
    uri: databaseUrl(),
    // Small and fixed: this is a single-user app behind one Next server, and an
    // unbounded pool would only queue work deeper inside MariaDB instead.
    connectionLimit: 10,
    waitForConnections: true,
    // Every timestamp in the schema is an ISO-8601 varchar, never DATETIME, so
    // there is no driver-side date parsing to get wrong. Keeping strings here
    // means a server in a different timezone cannot shift a stored value.
    dateStrings: true,
  });
  return drizzle(pool, { schema, mode: "default" });
}

// Reuse one pool across dev hot-reloads; without this each reload leaks a pool
// and MariaDB eventually refuses connections with "too many connections".
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> };

export const db = (globalForDb.db ??= createDb());
