import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  encryptionEnabled,
  isEncrypted,
  SecretBoxError,
  secretEquals,
} from "./secret-box";

// A fixed 32-byte key, base64. Test-only.
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const CONTEXT = "hevy_api_key";
const SECRET = "11111111-2222-3333-4444-5555abcd";

const original = process.env.SETTINGS_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = KEY_A;
});
afterEach(() => {
  if (original === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
  else process.env.SETTINGS_ENCRYPTION_KEY = original;
});

describe("round trip", () => {
  it("encrypts and decrypts", () => {
    const box = encryptSecret(SECRET, CONTEXT);
    expect(box).not.toContain(SECRET);
    expect(isEncrypted(box)).toBe(true);
    expect(decryptSecret(box, CONTEXT)).toBe(SECRET);
  });

  it("produces a different ciphertext every time", () => {
    // A fixed nonce would leak that two settings hold the same value.
    expect(encryptSecret(SECRET, CONTEXT)).not.toBe(encryptSecret(SECRET, CONTEXT));
  });

  it("accepts a hex key as well as base64", () => {
    const box = encryptSecret(SECRET, CONTEXT);
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("hex");
    expect(decryptSecret(box, CONTEXT)).toBe(SECRET);
  });
});

describe("refusals", () => {
  it("rejects a ciphertext moved to a different setting key", () => {
    const box = encryptSecret(SECRET, CONTEXT);
    expect(() => decryptSecret(box, "weight_unit")).toThrow(SecretBoxError);
  });

  it("rejects the wrong encryption key", () => {
    const box = encryptSecret(SECRET, CONTEXT);
    process.env.SETTINGS_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(box, CONTEXT)).toThrow(/does not match/i);
  });

  it("rejects a tampered ciphertext", () => {
    const box = encryptSecret(SECRET, CONTEXT);
    // Flip the final base64 char of the ciphertext segment.
    const parts = box.split(":");
    const ct = parts[4]!;
    parts[4] = (ct.at(-1) === "A" ? "B" : "A") + ct.slice(1);
    expect(() => decryptSecret(parts.join(":"), CONTEXT)).toThrow(SecretBoxError);
  });

  it("rejects a key of the wrong length instead of padding it", () => {
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret(SECRET, CONTEXT)).toThrow(/32 bytes/);
  });

  it("refuses to read an encrypted value once the key is removed", () => {
    const box = encryptSecret(SECRET, CONTEXT);
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(() => decryptSecret(box, CONTEXT)).toThrow(/not set/i);
  });
});

describe("without a configured key", () => {
  beforeEach(() => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  it("reports encryption as off and passes values through", () => {
    expect(encryptionEnabled()).toBe(false);
    expect(encryptSecret(SECRET, CONTEXT)).toBe(SECRET);
  });

  it("still reads legacy plaintext", () => {
    expect(decryptSecret(SECRET, CONTEXT)).toBe(SECRET);
    expect(isEncrypted(SECRET)).toBe(false);
  });
});

describe("secretEquals", () => {
  it("compares without leaking length-independent timing", () => {
    expect(secretEquals("abc", "abc")).toBe(true);
    expect(secretEquals("abc", "abd")).toBe(false);
    expect(secretEquals("abc", "abcd")).toBe(false);
  });
});
