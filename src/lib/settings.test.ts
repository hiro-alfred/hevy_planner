import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// See knowledge/systems/testing-setup.md: DATABASE_PATH must be set before the
// db client module is imported, hence the dynamic imports.
let settingsModule: typeof import("./settings");
let dir: string;

const KEY = "11111111-2222-3333-4444-5555abcd";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "hevy-settings-"));
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  const { runMigrations } = await import("@/lib/db/migrate");
  runMigrations();
  settingsModule = await import("./settings");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows holds the SQLite lock until exit */
  }
});

beforeEach(async () => {
  const { db } = await import("@/lib/db/client");
  const { settings } = await import("@/lib/db/schema");
  await db.delete(settings);
  delete process.env.HEVY_API_KEY;
});

describe("hevy api key", () => {
  it("reports not-configured on a clean install", async () => {
    expect(await settingsModule.getHevyKeyStatus()).toEqual({
      configured: false,
      last4: null,
      fromEnv: false,
      updatedAt: null,
    });
    expect(await settingsModule.getHevyApiKey()).toBeNull();
  });

  it("stores a key and exposes only the last 4 characters to the UI", async () => {
    await settingsModule.setHevyApiKey(KEY);

    const status = await settingsModule.getHevyKeyStatus();
    expect(status.configured).toBe(true);
    expect(status.last4).toBe("abcd");
    expect(status.fromEnv).toBe(false);
    // The status object is what reaches React — it must not carry the secret.
    expect(JSON.stringify(status)).not.toContain(KEY);
    // ...while the server-side accessor still returns the real key.
    expect(await settingsModule.getHevyApiKey()).toBe(KEY);
  });

  it("trims surrounding whitespace and rejects an empty key", async () => {
    await settingsModule.setHevyApiKey(`  ${KEY}  `);
    expect(await settingsModule.getHevyApiKey()).toBe(KEY);
    await expect(settingsModule.setHevyApiKey("   ")).rejects.toThrow(/must not be empty/i);
  });

  it("overwrites rather than duplicating on re-save", async () => {
    await settingsModule.setHevyApiKey(KEY);
    await settingsModule.setHevyApiKey("aaaaaaaa-bbbb-cccc-dddd-eeeeffff9999");

    expect(await settingsModule.getHevyApiKey()).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeffff9999");
    expect((await settingsModule.getHevyKeyStatus()).last4).toBe("9999");
  });

  it("falls back to the env var, and prefers the stored key over it", async () => {
    process.env.HEVY_API_KEY = "env-key-0000";
    expect(await settingsModule.getHevyApiKey()).toBe("env-key-0000");
    expect(await settingsModule.getHevyKeyStatus()).toMatchObject({
      configured: true,
      fromEnv: true,
      last4: "0000",
    });

    await settingsModule.setHevyApiKey(KEY);
    expect(await settingsModule.getHevyApiKey()).toBe(KEY);
    expect(await settingsModule.getHevyKeyStatus()).toMatchObject({ fromEnv: false });
  });

  it("clearing the stored key re-activates the env fallback", async () => {
    process.env.HEVY_API_KEY = "env-key-0000";
    await settingsModule.setHevyApiKey(KEY);
    await settingsModule.clearHevyApiKey();

    expect(await settingsModule.getHevyApiKey()).toBe("env-key-0000");
    expect(await settingsModule.getHevyKeyStatus()).toMatchObject({ fromEnv: true });
  });

  it("ignores a blank env var", async () => {
    process.env.HEVY_API_KEY = "   ";
    expect(await settingsModule.getHevyApiKey()).toBeNull();
    expect(await settingsModule.getHevyKeyStatus()).toMatchObject({ configured: false });
  });
});

describe("weight unit", () => {
  it("defaults to kg and round-trips lbs", async () => {
    expect(await settingsModule.getWeightUnit()).toBe("kg");
    await settingsModule.setWeightUnit("lbs");
    expect(await settingsModule.getWeightUnit()).toBe("lbs");
    await settingsModule.setWeightUnit("kg");
    expect(await settingsModule.getWeightUnit()).toBe("kg");
  });
});
