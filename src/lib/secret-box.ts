import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// Authenticated encryption for secrets held in the settings table.
//
// WHAT THIS DOES AND DOES NOT BUY YOU. It protects a database that leaves the
// host: a mysqldump, a backup copied to cloud storage, a snapshot, a stolen
// volume, or a database server reachable by someone who does not own the app
// host. It does NOT protect against compromise of the app host itself, because
// the key lives in that host's environment. Saying otherwise would be theatre.
//
// Why encryption rather than hashing: this key has to be REPLAYED to Hevy on
// every request, so it must be reversible. Hashing (bcrypt/argon2) is right for
// passwords precisely because you only ever verify them — it is not an option
// for a third-party credential.

const ENV_VAR = "SETTINGS_ENCRYPTION_KEY";

/** Marks an encrypted value. Also makes plaintext obvious in a DB dump. */
const PREFIX = "enc:v1:";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the size GCM is defined for
const TAG_BYTES = 16;

export class SecretBoxError extends Error {}

/**
 * Decodes a 32-byte key from an env var's raw value.
 *
 * Accepts base64 or hex so operators can paste whatever their tooling emits;
 * both must decode to exactly 32 bytes. A short key is rejected rather than
 * padded — silently stretching a weak key would be the worst of both worlds.
 * `varName` is only ever used to write the error message.
 */
export function parseKeyMaterial(raw: string, varName: string): Buffer {
  const decoded = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (decoded.length !== KEY_BYTES) {
    throw new SecretBoxError(
      `${varName} must decode to ${KEY_BYTES} bytes (got ${decoded.length}). ` +
        `Generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return decoded;
}

/** Parses the configured settings key, or returns null when none is set. */
function loadKey(): Buffer | null {
  const raw = process.env[ENV_VAR]?.trim();
  if (!raw) return null;
  return parseKeyMaterial(raw, ENV_VAR);
}

/**
 * AES-256-GCM with an EXPLICIT key. The primitive behind encryptSecret, split
 * out so other subsystems can hold their own key rather than sharing the
 * settings one (auth sessions do — see lib/auth/session.ts).
 *
 * The difference that matters: this pair has no "no key configured" fallback.
 * encryptSecret below deliberately passes plaintext through when the settings
 * key is absent, which is right for a database column that must stay readable
 * during a migration, and catastrophically wrong for a session token — an
 * unkeyed `seal` would mint credentials anyone could forge. Callers that must
 * fail closed use these two and supply the key themselves.
 *
 * `context` is bound as GCM additional authenticated data, so a value sealed
 * for one purpose cannot be replayed as another.
 */
export function seal(plaintext: string, context: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Opens a `seal()` value. Throws SecretBoxError on any tampering. */
export function open(sealed: string, context: string, key: Buffer): string {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new SecretBoxError("Sealed value is malformed.");

  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
  if (iv!.length !== IV_BYTES || tag!.length !== TAG_BYTES) {
    throw new SecretBoxError("Sealed value has a bad nonce or tag length.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv!);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("Sealed value failed authentication.");
  }
}

export function encryptionEnabled(): boolean {
  return loadKey() !== null;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/**
 * Encrypts `plaintext`, binding it to `context` (the setting key).
 *
 * `context` is passed as GCM additional authenticated data, so a ciphertext
 * cannot be moved from one settings row to another and still decrypt. Cheap,
 * and it removes a whole class of row-swapping mischief.
 *
 * Returns the plaintext unchanged when no key is configured — the caller is
 * responsible for warning about that (see settings.ts).
 */
export function encryptSecret(plaintext: string, context: string): string {
  const key = loadKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypts a stored value.
 *
 * A value without the prefix is legacy plaintext and is returned as-is: this is
 * what makes turning encryption on non-destructive for a database that already
 * holds a key. `migrateSecretToEncrypted` in settings.ts upgrades those.
 *
 * Throws SecretBoxError when an encrypted value cannot be opened — a wrong or
 * rotated key, or tampering. Callers must decide what that means for the user
 * rather than crashing the page.
 */
export function decryptSecret(stored: string, context: string): string {
  if (!isEncrypted(stored)) return stored;

  const key = loadKey();
  if (!key) {
    throw new SecretBoxError(
      `A stored value is encrypted but ${ENV_VAR} is not set. Restore the key to read it.`,
    );
  }

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new SecretBoxError("Encrypted value is malformed.");

  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
  if (iv!.length !== IV_BYTES || tag!.length !== TAG_BYTES) {
    throw new SecretBoxError("Encrypted value has a bad nonce or tag length.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv!);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString("utf8");
  } catch {
    // Deliberately not chaining the underlying error: it is noise here, and the
    // one thing that matters is that authentication failed.
    throw new SecretBoxError(
      "Stored value could not be decrypted — the encryption key does not match the one that wrote it.",
    );
  }
}

/** Constant-time compare, for callers that need to check a secret's equality. */
export function secretEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
