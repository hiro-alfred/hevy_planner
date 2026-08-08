import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const DEFAULT_PATH = "./data/hevy-planner.sqlite";

function createDb() {
  const path = process.env.DATABASE_PATH ?? DEFAULT_PATH;
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Reuse one connection across dev hot-reloads.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> };

export const db = (globalForDb.db ??= createDb());
