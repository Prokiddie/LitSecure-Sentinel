import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { verifyAccessToken, hashToken, TokenPayload } from "../services/tokenService.js";

// Augment Express Request with user property
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Middleware: verify JWT Bearer token.
 * Also checks the revoked_tokens blocklist — tokens are invalid after logout
 * even if they haven't expired yet.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "Authentication required. Please log in." });
  }

  const rawToken = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(rawToken);

    // ── JWT Revocation Check ─────────────────────────────────────────────────
    // Check if this token was explicitly revoked (e.g. via logout)
    const tokenHash = hashToken(rawToken);
    const revoked   = db.prepare(
      "SELECT id FROM revoked_tokens WHERE token_hash = ? AND expires_at > ?"
    ).get(tokenHash, new Date().toISOString());

    if (revoked) {
      return res.status(401).json({
        error:   "TOKEN_REVOKED",
        message: "Your session has been terminated. Please log in again.",
      });
    }

    req.user = payload;
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "TOKEN_EXPIRED", message: "Session expired. Please log in again." });
    }
    return res.status(401).json({ error: "TOKEN_INVALID", message: "Invalid authentication token." });
  }
}

export const ROLE_LEVELS: Record<string, number> = {
  citizen: 10,
  org_user: 20,
  org_admin: 30,
  auditor: 35,
  analyst: 40,
  investigator: 50,
  gov_admin: 60,
  soc_manager: 70,
  admin: 80,
  super_admin: 90,
};

/**
 * Helper to check if a user role meets or exceeds a required role level.
 */
export function checkRolePermission(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_LEVELS[userRole] ?? 0;
  const requiredLevel = ROLE_LEVELS[requiredRole] ?? 999;
  return userLevel >= requiredLevel;
}

/**
 * Middleware: require one of the specified roles or a higher role in the hierarchy.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "AUTH_REQUIRED", message: "Authentication required." });
    }
    
    const isAllowed = roles.some(role => checkRolePermission(req.user!.role, role));

    if (!isAllowed && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: `This action requires one of these roles: ${roles.join(", ")} (or higher). Your role: ${req.user.role}.`
      });
    }
    next();
  };
}
