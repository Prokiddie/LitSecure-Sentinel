/**
 * LitSecure Sentinel — Auth Routes v2
 *
 * Changes from v1:
 *  - Logout now REVOKES the JWT (stored SHA-256 hash in revoked_tokens table)
 *  - Login now enforces MFA when mfa_enabled=1 on the account
 *  - Brute-force lockout: 5 failed attempts → 15 min lockout
 *  - last_login timestamp updated on successful login
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { queryGet, queryRun, dbTransaction, generateId } from "../db/index.js";
import { getUserFromSupabase, isSupabaseEnabled } from "../db/supabase-client.js";
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from "../services/tokenService.js";
import { verifyMfaToken, setupMfa, confirmMfa, disableMfa } from "../services/mfa.js";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { loginSchema, updateProfileSchema, changePasswordSchema, confirmMfaSchema, disableMfaSchema } from "../schemas/index.js";
import { requireAuth } from "../middleware/auth.js";


const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStrongPassword(p: string) {
  return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
}

async function revokeToken(rawToken: string, userId?: string): Promise<void> {
  try {
    const payload  = verifyAccessToken(rawToken);
    const hash     = hashToken(rawToken);
    const exp      = payload && (payload as any).exp
      ? new Date((payload as any).exp * 1000).toISOString()
      : new Date(Date.now() + 8 * 3600_000).toISOString();

    await queryRun(`
      INSERT INTO revoked_tokens (id, token_hash, user_id, revoked_at, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (token_hash) DO NOTHING
    `, [generateId("rev"), hash, userId || null, new Date().toISOString(), exp]);
  } catch { /* token already invalid — nothing to revoke */ }
}

async function checkBruteForce(email: string): Promise<{ locked: boolean; minutesLeft?: number }> {
  const user = await queryGet("SELECT locked_until, failed_logins FROM users WHERE email = $1", [email]) as any;
  if (!user?.locked_until) return { locked: false };
  const lockEnd = new Date(user.locked_until).getTime();
  if (Date.now() < lockEnd) {
    return { locked: true, minutesLeft: Math.ceil((lockEnd - Date.now()) / 60000) };
  }
  // Lock expired — reset
  await queryRun("UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE email = $1", [email]);
  return { locked: false };
}

async function recordLoginAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await queryRun(
    "INSERT INTO login_attempts (id, email, ip, success, attempted_at) VALUES ($1, $2, $3, $4, $5)",
    [generateId("la"), email, ip, success ? 1 : 0, new Date().toISOString()]
  );

  if (!success) {
    const user = await queryGet("SELECT id, failed_logins FROM users WHERE email = $1", [email]) as any;
    if (!user) return;
    const newCount = (user.failed_logins || 0) + 1;
    const lockUntil = newCount >= 5
      ? new Date(Date.now() + 15 * 60_000).toISOString()
      : null;
    await queryRun("UPDATE users SET failed_logins = $1, locked_until = $2 WHERE id = $3", [newCount, lockUntil, user.id]);
  } else {
    // Reset on success
    await queryRun("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = $1 WHERE email = $2", [
      new Date().toISOString(), email
    ]);
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password, mfa_token } = req.body;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

  // 1️⃣ Brute-force check
  const lockStatus = await checkBruteForce(email);
  if (lockStatus.locked) {
    return res.status(429).json({
      error: "ACCOUNT_LOCKED",
      message: `Account temporarily locked due to too many failed attempts. Try again in ${lockStatus.minutesLeft} minute(s).`,
    });
  }

  // 2️⃣ Try Database lookup
  let user: any = await queryGet("SELECT * FROM users WHERE email = $1 AND is_active = 1", [email]);

  // 3️⃣ Fallback to Supabase
  if (!user && isSupabaseEnabled()) {
    try {
      user = await getUserFromSupabase(email);
      if (user) {
        try {
          await queryRun(`
            INSERT INTO users (id,full_name,email,phone,password_hash,role,organization_id,is_active,created_at,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [
            user.id,
            user.full_name,
            user.email,
            user.phone || null,
            user.password_hash,
            user.role,
            null,
            1,
            new Date().toISOString(),
            new Date().toISOString(),
          ]);
        } catch { /* already cached */ }
      }
    } catch (err) {
      console.warn("[Auth] Supabase lookup failed:", err);
    }
  }

  if (!user) {
    await recordLoginAttempt(email, ip, false);
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
  }

  // 4️⃣ Password check
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    await recordLoginAttempt(email, ip, false);
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
  }

  // 5️⃣ MFA check — if enabled, require token in this request
  if (user.mfa_enabled) {
    if (!mfa_token) {
      // Signal the frontend to show the MFA step
      return res.status(200).json({
        mfa_required: true,
        message: "MFA token required. Please enter the 6-digit code from your authenticator app.",
      });
    }
    const mfaValid = await verifyMfaToken(user.id, String(mfa_token));
    if (!mfaValid) {
      await recordLoginAttempt(email, ip, false);
      return res.status(401).json({ error: "MFA_INVALID", message: "Invalid MFA code. Please try again." });
    }
  }

  // 6️⃣ Issue token
  await recordLoginAttempt(email, ip, true);
  const token = signAccessToken({
    userId: user.id,
    id:     user.id,
    email:  user.email,
    name:   user.full_name,
    role:   user.role,
  });
  const refreshToken = signRefreshToken({ userId: user.id });
  const refreshHash  = hashToken(refreshToken);

  // Store refresh token in database
  await queryRun(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    generateId("rt"),
    user.id,
    refreshHash,
    new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    new Date().toISOString()
  ]);

  return res.json({
    token,
    refreshToken,
    mfa_enabled: !!user.mfa_enabled,
    user: {
      id:          user.id,
      email:       user.email,
      name:        user.full_name,
      role:        user.role,
      phone:       user.phone,
      mfa_enabled: !!user.mfa_enabled,
    },
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Now REVOKES the token — it will be rejected even before JWT expiry.
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7);
    await revokeToken(rawToken, req.user?.id);
  }
  return res.json({ success: true, message: "Logged out successfully. Token has been revoked." });
});

// ─── POST /api/auth/register (Public citizen self-registration) ───────────────
router.post("/register", authLimiter, async (req, res) => {
  if ((global as any).lockdownEnabled) {
    return res.status(403).json({
      error: "LOCKDOWN_ACTIVE",
      message: "New user registration is temporarily suspended during National Alert Mode.",
    });
  }

  const { name, email, password, phone } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Name, email and password are required." });
  }
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: "INVALID_EMAIL", message: "Please enter a valid email address." });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: "WEAK_PASSWORD",
      message: "Password must be at least 8 characters and contain uppercase, lowercase and a number.",
    });
  }

  const existing = await queryGet("SELECT * FROM users WHERE email = $1 AND is_active = 1", [email]) as any;
  if (existing) {
    return res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with this email already exists." });
  }

  const now  = new Date().toISOString();
  const id   = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 12); // 12 rounds for new accounts

  try {
    await queryRun(`
      INSERT INTO users (id,full_name,email,phone,password_hash,role,organization_id,is_active,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      id,
      name.trim(),
      email.toLowerCase().trim(),
      phone?.trim() || "",
      hash,
      "citizen",
      "PUBLIC",
      1,
      now,
      now
    ]);
  } catch (err: any) {
    console.error("[register] DB error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Registration failed. Please try again." });
  }

  const token = signAccessToken({ userId: id, id, email: email.toLowerCase().trim(), name: name.trim(), role: "citizen" });
  const refreshToken = signRefreshToken({ userId: id });
  const refreshHash  = hashToken(refreshToken);

  // Store refresh token in database
  await queryRun(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    generateId("rt"),
    id,
    refreshHash,
    new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    new Date().toISOString()
  ]);

  return res.status(201).json({
    success: true,
    message: "Account created successfully. Welcome to LitSecure Sentinel.",
    token,
    refreshToken,
    user: { id, email: email.toLowerCase().trim(), name: name.trim(), role: "citizen", phone: phone || "" },
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED", message: "Refresh token is required." });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const userId = payload.userId;
    const tokenHash = hashToken(refreshToken);

    // Look up token in DB
    const existing = await queryGet("SELECT * FROM refresh_tokens WHERE token_hash = $1", [tokenHash]) as any;

    if (!existing) {
      // Re-use detection: valid signature but token not in database = reuse attempt!
      // Invalidate all sessions for this user for security
      await queryRun("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
      return res.status(401).json({
        error: "TOKEN_REUSED",
        message: "Security alert: Refresh token has already been used. All sessions revoked."
      });
    }

    // Check expiration
    if (new Date(existing.expires_at).getTime() < Date.now()) {
      await queryRun("DELETE FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);
      return res.status(401).json({ error: "REFRESH_TOKEN_EXPIRED", message: "Refresh token expired. Please log in again." });
    }

    // Fetch user
    const user = await queryGet("SELECT * FROM users WHERE id = $1 AND is_active = 1", [userId]) as any;
    if (!user) {
      return res.status(401).json({ error: "USER_NOT_FOUND", message: "User not found or inactive." });
    }

    // Rotate refresh token
    const newAccessToken = signAccessToken({
      userId: user.id,
      id:     user.id,
      email:  user.email,
      name:   user.full_name,
      role:   user.role,
    });
    const newRefreshToken = signRefreshToken({ userId: user.id });
    const newRefreshHash  = hashToken(newRefreshToken);

    // Transactional rotation: delete old, insert new
    await dbTransaction(async (q) => {
      await q("DELETE FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);
      await q(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        generateId("rt"),
        user.id,
        newRefreshHash,
        new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        new Date().toISOString()
      ]);
    });

    return res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err: any) {
    return res.status(401).json({ error: "INVALID_REFRESH_TOKEN", message: "Invalid refresh token." });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// ─── PUT /api/auth/profile ───────────────────────────────────────────────────
router.put("/profile", requireAuth, validate(updateProfileSchema), async (req, res) => {
  const { fullName, phone } = req.body;
  try {
    await queryRun("UPDATE users SET full_name = $1, phone = $2, updated_at = $3 WHERE id = $4", [
      fullName, phone || "", new Date().toISOString(), req.user!.id
    ]);

    const updated = await queryGet("SELECT id, full_name, email, role, phone, mfa_enabled FROM users WHERE id = $1", [
      req.user!.id
    ]) as any;

    if (!updated) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User profile not found." });
    }

    return res.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.full_name,
        role: updated.role,
        phone: updated.phone,
        mfa_enabled: !!updated.mfa_enabled,
      }
    });
  } catch (err: any) {
    console.error("[Profile Update] DB error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update profile." });
  }
});

// ─── POST /api/auth/profile/password ──────────────────────────────────────────
router.post("/profile/password", requireAuth, validate(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await queryGet("SELECT password_hash FROM users WHERE id = $1", [req.user!.id]) as any;
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." });
    }

    const valid = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Current password does not match." });
    }

    const hash = bcrypt.hashSync(newPassword, 12);
    await queryRun("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3", [
      hash, new Date().toISOString(), req.user!.id
    ]);

    return res.json({ success: true, message: "Password updated successfully." });
  } catch (err: any) {
    console.error("[Password Update] error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update password." });
  }
});

// ─── POST /api/auth/profile/mfa/setup ─────────────────────────────────────────
router.post("/profile/mfa/setup", requireAuth, async (req, res) => {
  try {
    const user = await queryGet("SELECT email, mfa_enabled FROM users WHERE id = $1", [req.user!.id]) as any;
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." });
    }

    if (user.mfa_enabled) {
      return res.status(400).json({ error: "MFA_ALREADY_ENABLED", message: "MFA is already enabled on this account." });
    }

    const mfaData = await setupMfa(req.user!.id, user.email);
    return res.json({
      success: true,
      qrDataUrl: mfaData.qrDataUrl,
      manualKey: mfaData.manualKey,
    });
  } catch (err: any) {
    console.error("[MFA Setup] error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to generate MFA credentials." });
  }
});

// ─── POST /api/auth/profile/mfa/confirm ───────────────────────────────────────
router.post("/profile/mfa/confirm", requireAuth, validate(confirmMfaSchema), async (req, res) => {
  const { token } = req.body;
  try {
    const confirmed = await confirmMfa(req.user!.id, token);
    if (!confirmed) {
      return res.status(400).json({ error: "INVALID_MFA_TOKEN", message: "Invalid verification code. Setup not confirmed." });
    }
    return res.json({ success: true, message: "Multi-Factor Authentication enabled successfully." });
  } catch (err: any) {
    console.error("[MFA Confirm] error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to confirm MFA setup." });
  }
});

// ─── POST /api/auth/profile/mfa/disable ───────────────────────────────────────
router.post("/profile/mfa/disable", requireAuth, validate(disableMfaSchema), async (req, res) => {
  const { password, token } = req.body;
  try {
    const user = await queryGet("SELECT password_hash FROM users WHERE id = $1", [req.user!.id]) as any;
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." });
    }

    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect password." });
    }

    const disabled = await disableMfa(req.user!.id, token);
    if (!disabled) {
      return res.status(400).json({ error: "INVALID_MFA_TOKEN", message: "Invalid verification code." });
    }

    return res.json({ success: true, message: "Multi-Factor Authentication disabled successfully." });
  } catch (err: any) {
    console.error("[MFA Disable] error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to disable MFA." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await queryGet("SELECT id, full_name, email, role, phone, mfa_enabled, last_login FROM users WHERE id = $1", [
    req.user!.id
  ]) as any;
  return res.json({ user: { ...req.user, mfa_enabled: !!user?.mfa_enabled, last_login: user?.last_login } });
});

export default router;
