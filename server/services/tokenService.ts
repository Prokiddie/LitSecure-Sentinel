import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-CHANGE-IN-PRODUCTION-IMMEDIATELY";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "8h";

export interface TokenPayload {
  userId: string;
  id:     string;  // alias for userId — used by routes that reference req.user.id
  email:  string;
  name:   string;
  role:   string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function signRefreshToken(payload: { userId: string }): string {
  const refreshSecret = process.env.REFRESH_SECRET || "dev-refresh-secret-CHANGE-IN-PRODUCTION-IMMEDIATELY";
  return jwt.sign(payload, refreshSecret, { expiresIn: "7d" } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): { userId: string } {
  const refreshSecret = process.env.REFRESH_SECRET || "dev-refresh-secret-CHANGE-IN-PRODUCTION-IMMEDIATELY";
  return jwt.verify(token, refreshSecret) as { userId: string };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Single-use stream tokens for WebSocket Handshake ───────────────────────
const streamTokens = new Map<string, { userId: string; id: string; role: string; email: string; name: string; expiresAt: number }>();

export function generateStreamToken(payload: TokenPayload): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 30000; // 30 seconds
  streamTokens.set(token, { ...payload, expiresAt });
  return token;
}

export function verifyStreamToken(token: string): { userId: string; id: string; role: string; email: string; name: string } | null {
  const data = streamTokens.get(token);
  if (!data) return null;
  streamTokens.delete(token); // single-use!
  if (Date.now() > data.expiresAt) return null; // expired
  return data;
}
