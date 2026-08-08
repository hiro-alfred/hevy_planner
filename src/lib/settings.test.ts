import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase } from "@/test/database";

// See knowledge/systems/testing-setup.md: DATABASE_URL must be set before the
// db client module is imported, hence the dynamic imports.
const database = createTempDatabase("hevy_settings");
let settingsModule: typeof import("./settings");

const KEY = "11111111-2222-3333-4444-5555abcd";

// Exercise the encrypted path by default — that is what a deployment runs.
process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

beforeAll(async () => {
  await database.migrate();
  settingsModule = await import("./settings");
});

afterAll(() => database.cleanup());

beforeEach(async () => {
  const { db } = await import("@/lib/db/client");
  const { settings } = await import("@/lib/db/schema");
  await db.delete(settings);
  delete process.env.HEVY_API_KEY;
});

describe("encryption at rest", () => {
  it("never writes the key to the table in the clear", async () => {
    const { db } = await import("@/lib/db/client");
    const { settings } = await import("@/lib/db/schema");
    await settingsModule.setHevyApiKey(KEY);

    const [row] = await db.select().from(settings);
    expect(row!.value).not.toContain(KEY);
    expect(row!.value.startsWith("enc:v1:")).toBe(true);
    // ...and it still round-trips.
    expect(await settingsModule.getHevyApiKey()).toBe(KEY);
  });

  it("masks the real key, not the ciphertext", async () => {
    await settingsModule.setHevyApiKey(KEY);
    expect((await settingsModule.getHevyKeyStatus()).last4).toBe(KEY.slice(-4));
  });

  it("upgrades a plaintext key written before encryption was enabled", async () => {
    const { db } = await import("@/lib/db/client");
    const { settings } = await import("@/lib/db/schema");
    const writtenAt = "2026-01-01T00:00:00.000Z";
    await db.insert(settings).values({ key: "hevy_api_key", value: KEY, updatedAt: writtenAt });

    // Readable before the upgrade, so enabling encryption is non-destructive.
    expect(await settingsModule.getHevyApiKey()).toBe(KEY);

    expect(await settingsModule.migrateSecretsToEncrypted()).toBe(1);

    const [row] = await db.select().from(settings);
    expect(row!.value.startsWith("enc:v1:")).toBe(true);
    // The value did not change, only its representation.
    expect(row!.updatedAt).toBe(writtenAt);
    expect(await settingsModule.getHevyApiKey()).toBe(KEY);

    // Idempotent.
    expect(await settingsModule.migrateSecretsToEncrypted()).toBe(0);
  });

  it("reports a stored-but-unreadable key distinctly from no key", async () => {
    const { db } = await import("@/lib/db/client");
    const { settings } = await import("@/lib/db/schema");
    await db.insert(settings).values({
      key: "hevy_api_key",
      // Well-formed envelope, wrong key — what a rotated secret looks like.
      value: "enc:v1:" + [12, 16, 32].map((n) => Buffer.alloc(n, 9).toString("base64")).join(":"),
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const status = await settingsModule.getHevyKeyStatus();
    expect(status.undecryptable).toBe(true);
    expect(status.configured).toBe(false);
    // Must not crash the pages that merely check for a key.
    expect(await settingsModule.getHevyApiKey()).toBeNull();
  });
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
    await expect(settingsModule.setHevyApiKey("   ")).rejects.toThrow(/enter an api key/i);
  });

  /**
   * A key containing a newline makes the fetch layer throw with the WHOLE key
   * quoted in its message — which a server action would then hand back to the
   * browser. Rejecting the shape here means that message is never produced.
   */
  it("refuses keys that could leak through a header error, without quoting them", async () => {
    for (const bad of ["abc\ndef", "abc def", "abc\r\ndef", "abc\0def", "abc\tdef"]) {
      await expect(settingsModule.setHevyApiKey(bad)).rejects.toThrow(
        /spaces or control characters/i,
      );
      // The rejection message must not contain the value it rejected.
      await settingsModule.setHevyApiKey(bad).catch((error: Error) => {
        expect(error.message).not.toContain("abc");
      });
    }
    expect(await settingsModule.getHevyApiKey()).toBeNull();
  });

  it("shows nothing rather than the whole secret when a key is too short to mask", async () => {
    process.env.HEVY_API_KEY = "abc";
    expect(await settingsModule.getHevyKeyStatus()).toMatchObject({
      configured: true,
      last4: null,
    });
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
