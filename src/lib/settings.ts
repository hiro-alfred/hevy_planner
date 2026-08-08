import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import { decryptSecret, encryptSecret, encryptionEnabled, isEncrypted } from "@/lib/secret-box";

// Typed accessors over the settings key-value table.
//
// SECURITY: the Hevy API key is the one secret this app holds. Four protections
// apply, and they cover different attackers:
//   - "server-only" import: this module can never be pulled into a client bundle
//   - the raw key is never returned to a React component; UI code gets
//     HevyKeyStatus (a boolean + last 4 chars) instead
//   - the key is never logged, and never interpolated into an error message
//   - it is encrypted at rest with AES-256-GCM (see lib/secret-box.ts)
//
// On that last one: it was originally stored in plaintext, on the argument that
// encryption is theatre when the database file sits on the app's own disk.
// Moving to MariaDB invalidated that argument — dumps, backups and snapshots
// now travel independently of the host, so a database-only compromise is a real
// and separate event. It still does NOT defend against owning the app host.

export const SETTING_KEYS = {
  hevyApiKey: "hevy_api_key",
  weightUnit: "weight_unit",
} as const;

/** Settings encrypted at rest. Non-secrets stay readable in a dump on purpose. */
const SECRET_KEYS = new Set<string>([SETTING_KEYS.hevyApiKey]);

/** Warn once per process rather than on every read. */
let warnedAboutPlaintext = false;

function warnIfUnencrypted(): void {
  if (encryptionEnabled() || warnedAboutPlaintext) return;
  warnedAboutPlaintext = true;
  console.warn(
    "[settings] SETTINGS_ENCRYPTION_KEY is not set — the Hevy API key is being stored " +
      "in PLAINTEXT. Anyone with a database dump can read it. Generate a key with: " +
      `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`,
  );
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (!row) return null;
  return SECRET_KEYS.has(key) ? decryptSecret(row.value, key) : row.value;
}

async function setSetting(key: string, value: string): Promise<void> {
  if (SECRET_KEYS.has(key)) warnIfUnencrypted();
  const stored = SECRET_KEYS.has(key) ? encryptSecret(value, key) : value;

  // MySQL/MariaDB upsert. There is no conflict target to name: the clause fires
  // on any unique-key collision, which for this table is only the primary key.
  const updatedAt = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key, value: stored, updatedAt })
    .onDuplicateKeyUpdate({ set: { value: stored, updatedAt } });
}

/**
 * Re-encrypts any secret still sitting in the table as plaintext.
 *
 * Turning encryption on must not invalidate a key the user already entered, so
 * plaintext rows are read normally (see decryptSecret) and upgraded here, once,
 * at boot. `updated_at` is deliberately preserved: the value did not change,
 * only its representation, and moving the timestamp would tell the user their
 * key was touched when it was not.
 *
 * Safe to run on every boot — encrypted rows are skipped, and with no key
 * configured it does nothing at all.
 */
export async function migrateSecretsToEncrypted(): Promise<number> {
  if (!encryptionEnabled()) {
    warnIfUnencrypted();
    return 0;
  }

  let upgraded = 0;
  for (const key of SECRET_KEYS) {
    const [row] = await db
      .select({ value: settings.value, updatedAt: settings.updatedAt })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    if (!row || isEncrypted(row.value)) continue;

    await db
      .update(settings)
      .set({ value: encryptSecret(row.value, key), updatedAt: row.updatedAt })
      .where(eq(settings.key, key));
    upgraded += 1;
  }

  if (upgraded > 0) {
    console.log(`[settings] encrypted ${upgraded} stored secret(s) that were plaintext.`);
  }
  return upgraded;
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

/**
 * The Hevy API key, or null when none is configured.
 *
 * SERVER USE ONLY — never return this value from a server action or pass it
 * into a component's props. The stored key wins over the env fallback so that
 * changing it in the UI takes effect without a redeploy.
 */
export async function getHevyApiKey(): Promise<string | null> {
  let stored: string | null = null;
  try {
    stored = await getSetting(SETTING_KEYS.hevyApiKey);
  } catch (error) {
    // A wrong or rotated SETTINGS_ENCRYPTION_KEY must not take down every page
    // that checks for a key. Fall through to the env value, and let the
    // settings page explain the situation via getHevyKeyStatus.
    console.error("[settings] could not decrypt the stored Hevy key:", error);
  }
  if (stored) return stored;
  const fromEnv = process.env.HEVY_API_KEY?.trim();
  return fromEnv ? fromEnv : null;
}

/**
 * A key must be printable ASCII with no whitespace.
 *
 * Not cosmetic: an interior newline makes the fetch layer reject the header
 * with the whole value quoted in the exception message. Refusing the value here
 * means that message can never be produced in the first place.
 */
const KEY_PATTERN = /^[\x21-\x7e]+$/;

/** Never reveal the whole secret: a key too short to mask shows nothing. */
function maskLast4(value: string): string | null {
  return value.length > 4 ? value.slice(-4) : null;
}

export interface HevyKeyStatus {
  configured: boolean;
  /** Last 4 characters, for a "····abcd" display. Null when not maskable. */
  last4: string | null;
  /** True when the key comes from HEVY_API_KEY rather than the settings table. */
  fromEnv: boolean;
  updatedAt: string | null;
  /**
   * A key IS stored but cannot be read, because SETTINGS_ENCRYPTION_KEY is
   * missing or no longer matches. Distinct from `configured: false`, which
   * would send the user looking for a key that is right there.
   */
  undecryptable?: boolean;
}

/** The only shape of key information allowed to reach the UI. */
export async function getHevyKeyStatus(): Promise<HevyKeyStatus> {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.key, SETTING_KEYS.hevyApiKey))
    .limit(1);

  if (row?.value) {
    // Must decrypt before masking: the stored value is ciphertext, and its last
    // four characters are base64 padding, not the user's key.
    let plaintext: string;
    try {
      plaintext = decryptSecret(row.value, SETTING_KEYS.hevyApiKey);
    } catch {
      return {
        configured: false,
        last4: null,
        fromEnv: false,
        updatedAt: row.updatedAt,
        undecryptable: true,
      };
    }
    return {
      configured: true,
      last4: maskLast4(plaintext),
      fromEnv: false,
      updatedAt: row.updatedAt,
    };
  }

  const fromEnv = process.env.HEVY_API_KEY?.trim();
  if (fromEnv) {
    return { configured: true, last4: maskLast4(fromEnv), fromEnv: true, updatedAt: null };
  }
  return { configured: false, last4: null, fromEnv: false, updatedAt: null };
}

/**
 * Validates and normalises a submitted key.
 *
 * Callers must run this BEFORE handing the value to HevyClient — the point is
 * to stop a malformed key from ever reaching the fetch layer, which would throw
 * with the value quoted in its message.
 */
export function normalizeHevyApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") throw new UserFacingError("Enter an API key.");
  if (!KEY_PATTERN.test(trimmed)) {
    // Deliberately does not quote the offending value.
    throw new UserFacingError(
      "That does not look like an API key — it contains spaces or control characters.",
    );
  }
  return trimmed;
}

export async function setHevyApiKey(key: string): Promise<void> {
  await setSetting(SETTING_KEYS.hevyApiKey, normalizeHevyApiKey(key));
}

/** Removes the stored key. An env-provided key, if any, becomes active again. */
export async function clearHevyApiKey(): Promise<void> {
  await deleteSetting(SETTING_KEYS.hevyApiKey);
}

export type WeightUnit = "kg" | "lbs";

/**
 * Display unit. kg is the only INTERNAL unit (it is what the Hevy API speaks);
 * lbs is a display-only conversion applied in UI components, nowhere else.
 */
export async function getWeightUnit(): Promise<WeightUnit> {
  return (await getSetting(SETTING_KEYS.weightUnit)) === "lbs" ? "lbs" : "kg";
}

export async function setWeightUnit(unit: WeightUnit): Promise<void> {
  await setSetting(SETTING_KEYS.weightUnit, unit);
}
