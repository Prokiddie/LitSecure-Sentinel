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

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
