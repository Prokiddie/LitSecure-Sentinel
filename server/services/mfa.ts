/**
 * LitSecure Sentinel — MFA Service (TOTP)
 *
 * Implements RFC 6238 Time-based One-Time Passwords using otplib.
 * Provides QR code generation for authenticator apps (Google Authenticator,
 * Authy, Microsoft Authenticator, 1Password).
 *
 * Flow:
 *  1. POST /api/auth/mfa/setup   → returns secret + QR data URL → store in mfa_pending
 *  2. POST /api/auth/mfa/confirm → verify first OTP → move to users.mfa_secret + mfa_enabled=1
 *  3. POST /api/auth/login       → if mfa_enabled, require mfa_token in body
 *  4. POST /api/auth/mfa/disable → verify OTP + password → disable MFA
 */
import { createRequire } from "module";
import qrcode from "qrcode";
import { db, generateId } from "../db/index.js";

// otplib v13: use TOTP class directly (authenticator singleton was removed)
const require = createRequire(import.meta.url);
const { TOTP } = require("otplib");

// Shared TOTP instance — 30s window, 6 digits, ±1 step clock tolerance
const totp = new TOTP({ digits: 6, step: 30, window: 1 });

const APP_NAME = process.env.APP_NAME || "LitSecure Sentinel";


// ─── Setup: generate a new TOTP secret for a user ────────────────────────────

export async function setupMfa(userId: string, userEmail: string): Promise<{
  secret: string;
  qrDataUrl: string;
  manualKey: string;
}> {
  const secret = totp.generateSecret(20); // 160-bit base32 secret

  // Store pending (not yet confirmed) setup
  db.prepare(`
    INSERT OR REPLACE INTO mfa_pending (user_id, secret, created_at)
    VALUES (?, ?, ?)
  `).run(userId, secret, new Date().toISOString());

  // Generate otpauth:// URI for QR code
  const otpauthUri = totp.toURI(secret, userEmail, APP_NAME);
  const qrDataUrl  = await qrcode.toDataURL(otpauthUri, { errorCorrectionLevel: "H", margin: 2, width: 256 });

  // Format manual key in 4-char groups for readability
  const manualKey = secret.match(/.{1,4}/g)?.join(" ") || secret;

  return { secret, qrDataUrl, manualKey };
}

// ─── Confirm: verify first OTP and activate MFA ──────────────────────────────

export function confirmMfa(userId: string, token: string): boolean {
  const row = db.prepare("SELECT secret FROM mfa_pending WHERE user_id = ?").get(userId) as any;
  if (!row) return false; // no pending setup

  const valid = totp.verify({ token, secret: row.secret });
  if (!valid) return false;

  // Activate MFA on user account
  db.prepare("UPDATE users SET mfa_enabled = 1, mfa_secret = ?, updated_at = ? WHERE id = ?")
    .run(row.secret, new Date().toISOString(), userId);

  // Remove pending setup
  db.prepare("DELETE FROM mfa_pending WHERE user_id = ?").run(userId);
  return true;
}

// ─── Verify: check OTP during login ──────────────────────────────────────────

export function verifyMfaToken(userId: string, token: string): boolean {
  const user = db.prepare("SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?").get(userId) as any;
  if (!user || !user.mfa_enabled || !user.mfa_secret) return true; // MFA not enabled → pass through
  return totp.verify({ token, secret: user.mfa_secret });
}

// ─── Check whether a user has MFA enabled ────────────────────────────────────

export function isMfaEnabled(userId: string): boolean {
  const user = db.prepare("SELECT mfa_enabled FROM users WHERE id = ?").get(userId) as any;
  return !!user?.mfa_enabled;
}

// ─── Disable MFA (requires valid OTP to prevent accidental disabling) ─────────

export function disableMfa(userId: string, token: string): boolean {
  const valid = verifyMfaToken(userId, token);
  if (!valid) return false;
  db.prepare("UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), userId);
  db.prepare("DELETE FROM mfa_pending WHERE user_id = ?").run(userId);
  return true;
}

// ─── Generate backup codes (one-time use stored as hashes) ───────────────────

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join("").toUpperCase();
    codes.push(`${code.slice(0,4)}-${code.slice(4)}`);
  }
  return codes;
}
