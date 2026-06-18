/**
 * LitSecure Sentinel — Structured JSON Logger
 *
 * Outputs machine-parseable JSON in production (ELK/Loki ready)
 * and colourised human-readable lines in development.
 *
 * Usage:
 *   import logger from '../middleware/logger.js';
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('DB connection failed', { err: error.message });
 *
 * Request logger middleware:
 *   app.use(requestLogger);
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";
const SERVICE = "litsecure-sentinel";
const VERSION = process.env.npm_package_version || "1.4.0";

// ─── Log Levels ──────────────────────────────────────────────────────────────
const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

const COLOURS: Record<Level, string> = {
  error: "\x1b[31m",   // red
  warn:  "\x1b[33m",   // yellow
  info:  "\x1b[36m",   // cyan
  http:  "\x1b[35m",   // magenta
  debug: "\x1b[2m",    // dim
};
const RESET = "\x1b[0m";

// ─── Core log function ────────────────────────────────────────────────────────
function log(level: Level, message: string, meta: Record<string, unknown> = {}): void {
  const currentLevel: Level = (process.env.LOG_LEVEL as Level) || (isProd ? "info" : "debug");
  if (LEVELS[level] > LEVELS[currentLevel]) return;

  const entry = {
    timestamp:  new Date().toISOString(),
    level,
    service:    SERVICE,
    version:    VERSION,
    message,
    ...meta,
  };

  if (isProd) {
    // Machine-parseable JSON — pipe to ELK / Loki / Datadog
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    // Human-readable colourised output for development
    const color = COLOURS[level];
    const ts    = entry.timestamp.substring(11, 23); // HH:mm:ss.mmm
    const metaStr = Object.keys(meta).length
      ? "  " + JSON.stringify(meta)
      : "";
    console.log(`${color}[${ts}] [${level.toUpperCase().padEnd(5)}] ${message}${RESET}${metaStr}`);
  }
}

// ─── Public logger object ─────────────────────────────────────────────────────
const logger = {
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log("info",  msg, meta),
  http:  (msg: string, meta?: Record<string, unknown>) => log("http",  msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
};

export default logger;

// ─── HTTP Request Logger Middleware ──────────────────────────────────────────
/**
 * Attaches a unique request ID to each request and logs:
 *  - On receipt: method, path, IP
 *  - On finish:  status code, latency in ms
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Attach request ID for log correlation
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  const start = Date.now();
  const { method, path: reqPath, ip } = req;

  logger.http(`→ ${method} ${reqPath}`, { requestId, ip: ip || "unknown" });

  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const level: Level = status >= 500 ? "error" : status >= 400 ? "warn" : "http";
    logger[level](`← ${method} ${reqPath} ${status} (${ms}ms)`, {
      requestId,
      status,
      ms,
      ip: ip || "unknown",
    });
  });

  next();
}

// ─── Startup log ─────────────────────────────────────────────────────────────
export function logStartup(port: number, extras: Record<string, unknown> = {}): void {
  logger.info("LitSecure Sentinel started", {
    port,
    env:       process.env.NODE_ENV || "development",
    version:   VERSION,
    pid:       process.pid,
    ...extras,
  });
}
