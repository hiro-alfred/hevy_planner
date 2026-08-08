import mysql from "mysql2/promise";
import { adminUrl } from "./database";

// Fails the run early, with an instruction, when the test database is not up.
//
// Without this the first DB-touching file dies on a bare ECONNREFUSED from deep
// inside the driver, in parallel, several times over — which reads like a code
// failure rather than "you forgot to start the container".

const TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function setup() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: unknown;

  // Retries rather than checking once: `npm run test:db:up` returns as soon as
  // the container is healthy, but a cold MariaDB still refuses connections for
  // a moment after that.
  for (;;) {
    try {
      const connection = await mysql.createConnection(adminUrl());
      await connection.end();
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) break;
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw new Error(
    `Could not reach the test database at ${adminUrl()} after ${TIMEOUT_MS / 1000}s.\n` +
      `Start it with:  npm run test:db:up\n` +
      `Or point TEST_DATABASE_URL at your own MariaDB (it will CREATE and DROP databases).\n` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
