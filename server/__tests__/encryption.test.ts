import { describe, it, expect } from "vitest";
import { encryptField, decryptField } from "../services/encryptionService.js";

describe("PII Envelope Encryption Service", () => {
  it("should encrypt and decrypt a plaintext field correctly", () => {
    const plaintext = "John Doe";
    const encrypted = encryptField(plaintext);

    expect(encrypted).not.toBeNull();
    expect(encrypted).toBeTypeOf("string");
    expect(encrypted!.startsWith("__ENC__:")).toBe(true);

    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should pass through unencrypted values unchanged", () => {
    const plaintext = "Not encrypted value";
    const decrypted = decryptField(plaintext);
    expect(decrypted).toBe(plaintext);
  });

  it("should handle null and undefined values gracefully", () => {
    expect(encryptField(null)).toBeNull();
    expect(encryptField(undefined)).toBeNull();
    expect(decryptField(null)).toBeNull();
    expect(decryptField(undefined)).toBeNull();
  });

  it("should handle empty string correctly", () => {
    expect(encryptField("")).toBe("");
    expect(decryptField("")).toBe("");
  });

  it("should return a decryption error string when payload is corrupted or invalid", () => {
    const corruptedPayload = "__ENC__:{}";
    const result = decryptField(corruptedPayload);
    expect(result).toBe("[DECRYPTION_ERROR]");
  });
});
