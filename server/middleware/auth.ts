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

/**
 * Middleware: require one of the specified roles.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "AUTH_REQUIRED", message: "Authentication required." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: `This action requires one of these roles: ${roles.join(", ")}. Your role: ${req.user.role}.`
      });
    }
    next();
  };
}
