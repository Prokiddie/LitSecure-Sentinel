/**
 * LitSecure Sentinel — Audit Logger Middleware
 * Automatically captures every mutating API call into the audit_logs table
 * Immutable: logs cannot be deleted via API
 */
import { Request, Response, NextFunction } from "express";
import db from "../db/index.js";
import crypto from "crypto";

// Ensure ip_address and user_agent columns exist (migration)
try {
  db.exec(`ALTER TABLE audit_logs ADD COLUMN ip_address TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`);
} catch {}

const METHODS_TO_AUDIT = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Routes to skip (too noisy)
const SKIP_PATHS = [
  "/api/notifications/read",
  "/api/notifications/read-all",
  "/api/auth/refresh",
  "/api/health",
];

/**
 * Express middleware: intercepts responses and logs mutations to audit_logs.
 * Placed AFTER requireAuth so req.user is populated.
 */
export function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (!METHODS_TO_AUDIT.has(req.method)) return next();

  const skip = SKIP_PATHS.some(p => req.path.startsWith(p));
  if (skip) return next();

  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    // Only log when the response was successful (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const user = (req as any).user;
        if (user) {
          const action = deriveAction(req.method, req.path);
          const details = deriveDetails(req.method, req.path, req.body, body);
          const id = `AUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

          db.prepare(`
            INSERT OR IGNORE INTO audit_logs
              (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            new Date().toISOString(),
            user.name || user.email || "Unknown",
            user.role || "unknown",
            action,
            details,
            deriveEntityType(req.path),
            deriveEntityId(req.path, body),
            req.ip || req.socket?.remoteAddress || "unknown",
            (req.headers["user-agent"] || "unknown").substring(0, 200)
          );
        }
      } catch {
        // Never let audit failure break the response
      }
    }
    return originalJson(body);
  };

  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveAction(method: string, path: string): string {
  if (method === "DELETE") return "DELETE";
  if (method === "POST" && path.includes("/login"))  return "LOGIN";
  if (method === "POST" && path.includes("/logout")) return "LOGOUT";
  if (method === "POST" && path.includes("/status")) return "INCIDENT_STATUS_UPDATE";
  if (method === "POST" && path.includes("/bulk-status")) return "BULK_STATUS_UPDATE";
  if (method === "POST" && path.includes("/bulk-delete")) return "BULK_DELETE";
  if (method === "POST" && path.includes("/upload")) return "FILE_UPLOAD";
  if (method === "POST" && path.includes("/custody")) return "CUSTODY_ENTRY";
  if (method === "POST" && path.includes("/verify")) return "INTEGRITY_CHECK";
  if (method === "POST" && path.includes("/lockdown")) return "LOCKDOWN_TOGGLE";
  if (method === "POST" && path.includes("/broadcast")) return "NOTIFICATION_BROADCAST";
  if (method === "POST" && path.includes("/correlate")) return "CORRELATION_SCAN";
  if (method === "POST" && path.includes("/recalculate")) return "RISK_RECALCULATE";
  if (method === "POST") return "CREATE";
  if (method === "PUT" || method === "PATCH") return "UPDATE";
  return method;
}

function deriveDetails(method: string, path: string, body: any, responseBody: any): string {
  const pathParts = path.split("/").filter(Boolean);
  try {
    if (path.includes("/incidents") && path.includes("/status")) {
      return `Status → ${body?.status} | Investigator: ${body?.investigator || "None"} | Note: ${body?.updateMessage?.substring(0, 120) || ""}`;
    }
    if (path.includes("/incidents") && method === "POST" && !path.includes("/bulk") && !path.includes("/status")) {
      return `New incident: "${body?.title || responseBody?.title}" | Severity: ${body?.severity || responseBody?.severity}`;
    }
    if (path.includes("/evidence") && path.includes("/upload")) {
      return `File: ${body?.fileName} | Type: ${body?.fileType} | Size: ${body?.fileData ? Math.round(body.fileData.length * 0.75 / 1024) : 0} KB`;
    }
    if (path.includes("/lockdown")) {
      return `Lockdown ${body?.enabled ? "ACTIVATED" : "DEACTIVATED"}`;
    }
    if (path.includes("/broadcast")) {
      return `Broadcast: "${body?.title}" → ${JSON.stringify(body?.targetRoles || [])}`;
    }
    if (method === "DELETE") {
      return `Deleted resource at ${path}`;
    }
    return `${method} ${pathParts.slice(0, 4).join("/")}`;
  } catch {
    return `${method} ${path}`;
  }
}

function deriveEntityType(path: string): string {
  if (path.includes("/incidents"))    return "incident";
  if (path.includes("/evidence"))     return "incident_evidence";
  if (path.includes("/users"))        return "user";
  if (path.includes("/campaigns"))    return "campaign";
  if (path.includes("/notifications"))return "notification";
  if (path.includes("/rules"))        return "security_rule";
  if (path.includes("/threat-intel")) return "threat_intel";
  return "system";
}

function deriveEntityId(path: string, responseBody: any): string | null {
  // Try to extract ID from path like /api/incidents/LIT-2026-0001/status
  const match = path.match(/\/(LIT|EVD|AUD|CMP|NOTIF|USR)-[A-Z0-9-]+/);
  if (match) return match[0].substring(1);
  // Fall back to response body ID
  if (responseBody?.id) return responseBody.id;
  return null;
}
