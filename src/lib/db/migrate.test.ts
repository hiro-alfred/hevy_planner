import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminUrl } from "@/test/database";

// The UPGRADE path, which nothing else covers.
//
// Every other DB-backed test migrates an empty database from scratch, so a
// migration that is fine on a new schema but destructive on a populated one
// would pass the whole suite. This walks the path a real deployment takes:
// migrate to the previous version, put data in, then migrate forward and check
// the data is still there.
//
// Written when 0001 added plans.derived_from_plan_id; it is deliberately
// generic (last-migration-only is staged out) so it keeps guarding the next one.

const name = `hevy_upgrade_${randomBytes(6).toString("hex")}`;
process.env.DATABASE_URL = `${adminUrl()}/${name}`;

describe("upgrading an existing database", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection(adminUrl());
    await admin.query(`CREATE DATABASE \`${name}\``);
    await admin.end();
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db/client");
    await db.$client.end();
    const admin = await mysql.createConnection(adminUrl());
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.end();
  });

  it("applies the newest migration to a populated database without data loss", async () => {
    // Step 1: migrate to everything EXCEPT the newest migration, by pointing the
    // migrator at a copy of the drizzle folder whose journal stops one short.
    const staged = mkdtempSync(join(tmpdir(), "drizzle-prev-"));
    cpSync("./drizzle", staged, { recursive: true });
    const journalPath = join(staged, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const newest = Math.max(...journal.entries.map((e: { idx: number }) => e.idx));
    journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < newest);
    writeFileSync(journalPath, JSON.stringify(journal));

    const { migrate } = await import("drizzle-orm/mysql2/migrator");
    const { db } = await import("@/lib/db/client");
    await migrate(db, { migrationsFolder: staged });

    // Step 2: real data lands under the OLD schema.
    const { plans } = await import("@/lib/db/schema");
    const now = new Date().toISOString();
    await db.execute(
      `insert into plans (request, plan, status, created_at, updated_at)
       values ('{"goal":"Build muscle"}', null, 'draft', '${now}', '${now}')`,
    );

    // Step 3: the upgrade under test.
    const { runMigrations } = await import("@/lib/db/migrate");
    await runMigrations();

    // The row survived, and the new column is present and null for it.
    const rows = await db.select().from(plans);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.derivedFromPlanId).toBeNull();
    expect(rows[0]!.request.goal).toBe("Build muscle");

    // And it is writable, so forkPlan has somewhere to put the parent id.
    const { eq } = await import("drizzle-orm");
    await db.update(plans).set({ derivedFromPlanId: 42 }).where(eq(plans.id, rows[0]!.id));
    const [updated] = await db.select().from(plans);
    expect(updated!.derivedFromPlanId).toBe(42);
  });
});
