/**
 * LitSecure Sentinel — MFA Routes
 *
 * POST /api/auth/mfa/setup    → generate secret + QR code
 * POST /api/auth/mfa/confirm  → verify first OTP and activate MFA
 * POST /api/auth/mfa/disable  → verify OTP + disable MFA
 * GET  /api/auth/mfa/status   → check if MFA is enabled for current user
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { setupMfa, confirmMfa, disableMfa, isMfaEnabled } from "../services/mfa.js";

const router = Router();
router.use(requireAuth);

// ─── GET /api/auth/mfa/status ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  const enabled = isMfaEnabled(req.user!.id);
  return res.json({ mfa_enabled: enabled });
});

// ─── POST /api/auth/mfa/setup ─────────────────────────────────────────────────
// Generates a new TOTP secret and returns a QR code data URL.
// The user must scan it with their authenticator app, then call /confirm.
router.post("/setup", async (req, res) => {
  try {
    if (isMfaEnabled(req.user!.id)) {
      return res.status(409).json({
        error:   "MFA_ALREADY_ENABLED",
        message: "MFA is already enabled on this account. Disable it first to re-enroll.",
      });
    }

    const { secret, qrDataUrl, manualKey } = await setupMfa(req.user!.id, req.user!.email);

    return res.json({
      secret,
      qrDataUrl,
      manualKey,
      message: "Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.), then call /confirm with a valid 6-digit code.",
    });
  } catch (err: any) {
    console.error("[MFA setup]", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to set up MFA." });
  }
});

// ─── POST /api/auth/mfa/confirm ───────────────────────────────────────────────
// Verifies the first OTP from the authenticator app and activates MFA.
router.post("/confirm", (req, res) => {
  const { token } = req.body;
  if (!token || !/^\d{6}$/.test(String(token))) {
    return res.status(400).json({
      error:   "INVALID_TOKEN_FORMAT",
      message: "MFA token must be exactly 6 digits.",
    });
  }

  const success = confirmMfa(req.user!.id, String(token));
  if (!success) {
    return res.status(401).json({
      error:   "MFA_CONFIRM_FAILED",
      message: "Invalid or expired MFA code. Make sure your device clock is correct and try again.",
    });
  }

  return res.json({
    success: true,
    message: "MFA has been enabled on your account. You will now be required to enter a 6-digit code on every login.",
  });
});

// ─── POST /api/auth/mfa/disable ───────────────────────────────────────────────
// Requires a valid OTP to prevent unauthorized disabling.
router.post("/disable", (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({
      error:   "TOKEN_REQUIRED",
      message: "A valid MFA token is required to disable MFA.",
    });
  }

  if (!isMfaEnabled(req.user!.id)) {
    return res.status(409).json({
      error:   "MFA_NOT_ENABLED",
      message: "MFA is not currently enabled on this account.",
    });
  }

  const success = disableMfa(req.user!.id, String(token));
  if (!success) {
    return res.status(401).json({
      error:   "MFA_INVALID",
      message: "Invalid MFA code. Provide a current 6-digit code from your authenticator app.",
    });
  }

  return res.json({
    success: true,
    message: "MFA has been disabled. Your account now uses password-only authentication.",
  });
});

export default router;
