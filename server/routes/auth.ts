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
import { db, queries, generateId } from "../db/index.js";
import { getUserFromSupabase, isSupabaseEnabled } from "../db/supabase-client.js";
import { signAccessToken, verifyAccessToken, hashToken } from "../services/tokenService.js";
import { verifyMfaToken, isMfaEnabled } from "../services/mfa.js";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { loginSchema } from "../schemas/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStrongPassword(p: string) {
  return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
}

function revokeToken(rawToken: string, userId?: string): void {
  try {
    const payload  = verifyAccessToken(rawToken);
    const hash     = hashToken(rawToken);
    const exp      = payload && (payload as any).exp
      ? new Date((payload as any).exp * 1000).toISOString()
      : new Date(Date.now() + 8 * 3600_000).toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO revoked_tokens (id, token_hash, user_id, revoked_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId("rev"), hash, userId || null, new Date().toISOString(), exp);
  } catch { /* token already invalid — nothing to revoke */ }
}

function checkBruteForce(email: string): { locked: boolean; minutesLeft?: number } {
  const user = db.prepare("SELECT locked_until, failed_logins FROM users WHERE email = ?").get(email) as any;
  if (!user?.locked_until) return { locked: false };
  const lockEnd = new Date(user.locked_until).getTime();
  if (Date.now() < lockEnd) {
    return { locked: true, minutesLeft: Math.ceil((lockEnd - Date.now()) / 60000) };
  }
  // Lock expired — reset
  db.prepare("UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE email = ?").run(email);
  return { locked: false };
}

function recordLoginAttempt(email: string, ip: string, success: boolean): void {
  db.prepare(
    "INSERT INTO login_attempts (id, email, ip, success, attempted_at) VALUES (?, ?, ?, ?, ?)"
  ).run(generateId("la"), email, ip, success ? 1 : 0, new Date().toISOString());

  if (!success) {
    const user = db.prepare("SELECT id, failed_logins FROM users WHERE email = ?").get(email) as any;
    if (!user) return;
    const newCount = (user.failed_logins || 0) + 1;
    const lockUntil = newCount >= 5
      ? new Date(Date.now() + 15 * 60_000).toISOString()
      : null;
    db.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .run(newCount, lockUntil, user.id);
  } else {
    // Reset on success
    db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = ? WHERE email = ?")
      .run(new Date().toISOString(), email);
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password, mfa_token } = req.body;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

  // 1️⃣ Brute-force check
  const lockStatus = checkBruteForce(email);
  if (lockStatus.locked) {
    return res.status(429).json({
      error: "ACCOUNT_LOCKED",
      message: `Account temporarily locked due to too many failed attempts. Try again in ${lockStatus.minutesLeft} minute(s).`,
    });
  }

  // 2️⃣ Try SQLite first (local, fast, offline-capable)
  let user: any = queries.getUserByEmail.get(email);

  // 3️⃣ Fallback to Supabase
  if (!user && isSupabaseEnabled()) {
    try {
      user = await getUserFromSupabase(email);
      if (user) {
        try {
          queries.insertUser.run({
            id:              user.id,
            full_name:       user.full_name,
            email:           user.email,
            phone:           user.phone || null,
            password_hash:   user.password_hash,
            role:            user.role,
            organization_id: null,
            is_active:       1,
            created_at:      new Date().toISOString(),
            updated_at:      new Date().toISOString(),
          });
        } catch { /* already cached */ }
      }
    } catch (err) {
      console.warn("[Auth] Supabase lookup failed:", err);
    }
  }

  if (!user) {
    recordLoginAttempt(email, ip, false);
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
  }

  // 4️⃣ Password check
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    recordLoginAttempt(email, ip, false);
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
    const mfaValid = verifyMfaToken(user.id, String(mfa_token));
    if (!mfaValid) {
      recordLoginAttempt(email, ip, false);
      return res.status(401).json({ error: "MFA_INVALID", message: "Invalid MFA code. Please try again." });
    }
  }

  // 6️⃣ Issue token
  recordLoginAttempt(email, ip, true);
  const token = signAccessToken({
    userId: user.id,
    id:     user.id,
    email:  user.email,
    name:   user.full_name,
    role:   user.role,
  });

  return res.json({
    token,
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
router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7);
    revokeToken(rawToken, req.user?.id);
  }
  return res.json({ success: true, message: "Logged out successfully. Token has been revoked." });
});

// ─── POST /api/auth/register (Public citizen self-registration) ───────────────
router.post("/register", authLimiter, (req, res) => {
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

  const existing = queries.getUserByEmail.get(email) as any;
  if (existing) {
    return res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with this email already exists." });
  }

  const now  = new Date().toISOString();
  const id   = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 12); // 12 rounds for new accounts

  try {
    queries.insertUser.run({
      id,
      full_name:       name.trim(),
      email:           email.toLowerCase().trim(),
      phone:           phone?.trim() || "",
      password_hash:   hash,
      role:            "citizen",
      organization_id: "PUBLIC",
      is_active:       1,
      created_at:      now,
      updated_at:      now,
    });
  } catch (err: any) {
    console.error("[register] DB error:", err.message);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Registration failed. Please try again." });
  }

  const token = signAccessToken({ userId: id, id, email: email.toLowerCase().trim(), name: name.trim(), role: "citizen" });

  return res.status(201).json({
    success: true,
    message: "Account created successfully. Welcome to LitSecure Sentinel.",
    token,
    user: { id, email: email.toLowerCase().trim(), name: name.trim(), role: "citizen", phone: phone || "" },
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, full_name, email, role, phone, mfa_enabled, last_login FROM users WHERE id = ?")
    .get(req.user!.id) as any;
  return res.json({ user: { ...req.user, mfa_enabled: !!user?.mfa_enabled, last_login: user?.last_login } });
});

export default router;
