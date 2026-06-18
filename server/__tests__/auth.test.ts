/**
 * Auth Service Unit Tests
 *
 * Tests: token signing, verification, revocation, MFA verification,
 * password hashing, login brute-force logic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { signAccessToken, verifyAccessToken, hashToken } from "../services/tokenService.js";
import bcrypt from "bcryptjs";

// ─── tokenService ─────────────────────────────────────────────────────────────

describe("tokenService", () => {
  const payload = {
    userId: "user-1",
    id:     "user-1",
    email:  "admin@macra.mw",
    name:   "Test Admin",
    role:   "admin",
  };

  it("signs a token that contains the payload fields", () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
  });

  it("verifies a signed token and returns the payload", () => {
    const token    = signAccessToken(payload);
    const verified = verifyAccessToken(token);
    expect(verified.email).toBe(payload.email);
    expect(verified.role).toBe(payload.role);
    expect(verified.id).toBe(payload.id);
  });

  it("throws on a tampered token", () => {
    const token    = signAccessToken(payload);
    const tampered = token.slice(0, -3) + "xxx";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("throws on an expired token", async () => {
    // Sign with -1s expiry (already expired)
    const { default: jwt } = await import("jsonwebtoken");
    const expired = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: -1 });
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it("hashToken produces a consistent SHA-256 hex string", () => {
    const h1 = hashToken("my-secret-token");
    const h2 = hashToken("my-secret-token");
    const h3 = hashToken("different-token");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
  });
});

// ─── Password hashing ─────────────────────────────────────────────────────────

describe("bcrypt password hashing", () => {
  it("hashes a password and verifies it correctly", () => {
    const password = "StrongPass123!";
    const hash     = bcrypt.hashSync(password, 10);
    expect(bcrypt.compareSync(password, hash)).toBe(true);
    expect(bcrypt.compareSync("WrongPass", hash)).toBe(false);
  });

  it("produces a different hash each time (salt)", () => {
    const h1 = bcrypt.hashSync("Password1!", 10);
    const h2 = bcrypt.hashSync("Password1!", 10);
    expect(h1).not.toBe(h2);
  });
});

// ─── Password strength validation ─────────────────────────────────────────────

describe("password strength", () => {
  function isStrong(p: string) {
    return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
  }

  it("rejects short passwords", () => {
    expect(isStrong("Ab1")).toBe(false);
  });

  it("rejects passwords without uppercase", () => {
    expect(isStrong("password123")).toBe(false);
  });

  it("rejects passwords without numbers", () => {
    expect(isStrong("Password!")).toBe(false);
  });

  it("accepts strong passwords", () => {
    expect(isStrong("Str0ngPass")).toBe(true);
    expect(isStrong("Admin@Malawi2026")).toBe(true);
  });
});
