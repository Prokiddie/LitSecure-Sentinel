/**
 * User Profile & MFA Security Validation Unit Tests
 *
 * Tests: Profile update schemas, password complexity boundaries,
 * and Multi-Factor Authentication TOTP schema compliance.
 */
import { describe, it, expect } from "vitest";
import { 
  updateProfileSchema, 
  changePasswordSchema, 
  confirmMfaSchema, 
  disableMfaSchema 
} from "../schemas/index.js";

// Helper password strength checker (from routes/auth.ts)
function isStrongPassword(p: string) {
  return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
}

describe("Password Complexity Heuristics", () => {
  it("approves strong passwords meeting criteria", () => {
    expect(isStrongPassword("P@ssword2026")).toBe(true);
    expect(isStrongPassword("LitSecure1")).toBe(true);
    expect(isStrongPassword("Admin@Sentinel2026!")).toBe(true);
  });

  it("rejects weak passwords missing uppercase characters", () => {
    expect(isStrongPassword("password2026")).toBe(false);
    expect(isStrongPassword("litsecure1")).toBe(false);
  });

  it("rejects weak passwords missing lowercase characters", () => {
    expect(isStrongPassword("PASSWORD2026")).toBe(false);
  });

  it("rejects weak passwords missing digits", () => {
    expect(isStrongPassword("PasswordSecurity")).toBe(false);
  });

  it("rejects passwords under 8 characters", () => {
    expect(isStrongPassword("Pas123")).toBe(false);
  });
});

describe("Profile Schema Validations (Zod)", () => {
  describe("updateProfileSchema", () => {
    it("accepts valid profile updates", () => {
      const result = updateProfileSchema.safeParse({
        fullName: "Chimwemwe Phiri",
        phone: "+265 999 123 456"
      });
      expect(result.success).toBe(true);
    });

    it("accepts profile updates with empty phone", () => {
      const result = updateProfileSchema.safeParse({
        fullName: "Chimwemwe Phiri",
        phone: ""
      });
      expect(result.success).toBe(true);
    });

    it("rejects profile updates with empty or too short full names", () => {
      const result = updateProfileSchema.safeParse({
        fullName: "A",
        phone: "+265 999 123 456"
      });
      expect(result.success).toBe(false);
    });

    it("rejects profile updates with invalid phone lengths", () => {
      const result = updateProfileSchema.safeParse({
        fullName: "Chimwemwe Phiri",
        phone: "123456789012345678901" // 21 chars (max 20)
      });
      expect(result.success).toBe(false);
    });
  });

  describe("changePasswordSchema", () => {
    it("accepts compliant passwords", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "OldPassword1!",
        newPassword: "NewSecurePassword2026"
      });
      expect(result.success).toBe(true);
    });

    it("rejects short new passwords", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "OldPassword1!",
        newPassword: "Pas1!"
      });
      expect(result.success).toBe(false);
    });

    it("rejects new passwords missing complexity requirements", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "OldPassword1!",
        newPassword: "newpasswordnoperdigits"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("confirmMfaSchema", () => {
    it("accepts 6-digit numeric codes", () => {
      const result = confirmMfaSchema.safeParse({ token: "123456" });
      expect(result.success).toBe(true);
    });

    it("rejects codes with letters or special characters", () => {
      const result1 = confirmMfaSchema.safeParse({ token: "123a56" });
      const result2 = confirmMfaSchema.safeParse({ token: "123-56" });
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });

    it("rejects codes not exactly 6 digits", () => {
      const result1 = confirmMfaSchema.safeParse({ token: "12345" });
      const result2 = confirmMfaSchema.safeParse({ token: "1234567" });
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });
  });

  describe("disableMfaSchema", () => {
    it("accepts valid password and 6-digit token", () => {
      const result = disableMfaSchema.safeParse({
        password: "MySecurePassword1",
        token: "987654"
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty passwords", () => {
      const result = disableMfaSchema.safeParse({
        password: "",
        token: "987654"
      });
      expect(result.success).toBe(false);
    });
  });
});
