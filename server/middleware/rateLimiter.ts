import rateLimit from "express-rate-limit";

const isDev = process.env.NODE_ENV !== "production";

/**
 * General API rate limiter — 120 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "RATE_LIMIT", message: "Too many requests. Please slow down and try again shortly." },
});

/**
 * Auth endpoint rate limiter — strict: 10 attempts per 15 minutes per IP.
 * Protects against brute-force login attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "RATE_LIMIT", message: "Too many login attempts. Please wait 15 minutes and try again." },
  skipSuccessfulRequests: true,
});

/**
 * Incident submission limiter — 20 per hour per IP.
 * Prevents automated incident spam flooding.
 */
export const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "RATE_LIMIT", message: "Incident submission limit reached. Please contact an administrator." },
});
