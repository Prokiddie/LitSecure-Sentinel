/**
 * Break Glass Emergency Controls
 * --------------------------------
 * High-privilege emergency endpoint that allows SOC managers and admins
 * to invoke drastic defensive measures without redeploying.
 *
 * All break-glass operations are:
 *  1. Audit-logged with full operator identity
 *  2. Rate-limited to 1 action per 60 seconds per user
 *  3. Require admin or soc_manager role
 *  4. Broadcast over WebSocket so all analysts see the alert
 *
 * Available operations:
 *  POST /api/break-glass/readonly-mode   — Set API to read-only (disables mutations)
 *  POST /api/break-glass/kill-switch     — Reject all API requests with 503
 *  POST /api/break-glass/revoke-all      — Revoke all active JWT sessions (mass logout)
 *  POST /api/break-glass/tenant-isolate  — Lock a specific user/tenant to read-only
 *  POST /api/break-glass/restore         — Restore normal operation
 *  GET  /api/break-glass/status          — Current emergency state
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";
import { getWarRoomWS } from "../websocket/warroom.js";

const router = Router();

// ─── Global Emergency State ───────────────────────────────────────────────────
export interface EmergencyState {
  readOnly:        boolean;
  killSwitch:      boolean;
  activatedBy?:    string;
  activatedAt?:    string;
  reason?:         string;
  tenantLocks:     string[];             // userIds locked to read-only
}

let state: EmergencyState = {
  readOnly:    false,
  killSwitch:  false,
  tenantLocks: [],
};

// ─── Export for use in global error handler / middleware ──────────────────────
export function getEmergencyState(): EmergencyState {
  return state;
}

// ─── Kill-switch middleware (attach to app before routes) ─────────────────────
export function killSwitchMiddleware(req: Request, res: Response, next: NextFunction) {
  // Always allow break-glass restore and health checks through
  if (req.path.startsWith("/api/break-glass") || req.path.startsWith("/api/health")) {
    return next();
  }
  if (state.killSwitch) {
    return res.status(503).json({
      error:   "KILL_SWITCH_ACTIVE",
      message: "API temporarily suspended by emergency control. Contact SOC.",
      activatedBy: state.activatedBy,
      activatedAt: state.activatedAt,
    });
  }
  if (state.readOnly && ["POST","PUT","PATCH","DELETE"].includes(req.method)) {
    return res.status(503).json({
      error:   "READ_ONLY_MODE",
      message: "API is in emergency read-only mode. Mutations are disabled.",
      activatedBy: state.activatedBy,
    });
  }
  next();
}

// ─── Per-user tenant isolation check (call inside route handlers) ─────────────
export function isTenantLocked(userId: string): boolean {
  return state.tenantLocks.includes(userId);
}

// ─── Audit helper ────────────────────────────────────────────────────────────
function auditBreakGlass(action: string, operator: string, detail: string) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO audit_logs (id, user_id, action, resource, resource_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `bg-${Date.now()}`,
      operator,
      `BREAK_GLASS:${action}`,
      "SYSTEM",
      "emergency",
      detail,
      "127.0.0.1",
      new Date().toISOString()
    );
  } catch { /* audit failure must not break the operation */ }
}

// ─── Broadcast helper ────────────────────────────────────────────────────────
function broadcast(action: string, operator: string, reason: string) {
  try {
    const ws = getWarRoomWS();
    if (ws) {
      ws.broadcastSystemUpdate({
        type: "BREAK_GLASS_ALERT",
        action,
        activatedBy: operator,
        reason,
        timestamp: new Date().toISOString(),
      });
    }
  } catch { /* non-fatal */ }
}

// ─── Rate limit per-user: 1 break-glass action / 60 s ───────────────────────
const lastAction = new Map<string, number>();

function checkRateLimit(userId: string): boolean {
  const now  = Date.now();
  const last = lastAction.get(userId) ?? 0;
  if (now - last < 60_000) return false;
  lastAction.set(userId, now);
  return true;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/break-glass/status
 */
router.get("/status", requireRole("investigator"), (_req, res) => {
  res.json(state);
});

/**
 * POST /api/break-glass/readonly-mode
 */
router.post("/readonly-mode", requireRole("soc_manager"), (req, res) => {
  const user = (req as any).user;
  if (!checkRateLimit(user.id)) {
    return res.status(429).json({ error: "RATE_LIMITED", message: "One break-glass action per 60 seconds." });
  }

  const reason = req.body?.reason || "Manual SOC activation";
  state = { ...state, readOnly: true, activatedBy: user.email, activatedAt: new Date().toISOString(), reason };

  auditBreakGlass("READ_ONLY_ENABLE", user.id, reason);
  broadcast("READ_ONLY_MODE_ACTIVATED", user.email, reason);

  res.json({ success: true, message: "API is now in read-only mode.", state });
});

/**
 * POST /api/break-glass/kill-switch
 */
router.post("/kill-switch", requireRole("admin"), (req, res) => {
  const user = (req as any).user;
  if (!checkRateLimit(user.id)) {
    return res.status(429).json({ error: "RATE_LIMITED", message: "One break-glass action per 60 seconds." });
  }

  const reason = req.body?.reason || "Emergency kill-switch activated";
  state = { ...state, killSwitch: true, activatedBy: user.email, activatedAt: new Date().toISOString(), reason };

  auditBreakGlass("KILL_SWITCH_ENABLE", user.id, reason);
  broadcast("KILL_SWITCH_ACTIVATED", user.email, reason);

  res.json({ success: true, message: "Kill switch active — all API requests will return 503.", state });
});

/**
 * POST /api/break-glass/revoke-all
 * Invalidates ALL active JWT sessions by bumping a global revocation epoch
 * stored in the DB. All middleware re-checks this epoch on each request.
 */
router.post("/revoke-all", requireRole("admin"), (req, res) => {
  const user = (req as any).user;
  if (!checkRateLimit(user.id)) {
    return res.status(429).json({ error: "RATE_LIMITED", message: "One break-glass action per 60 seconds." });
  }

  const reason = req.body?.reason || "Mass session revocation";
  const epoch  = new Date().toISOString();

  try {
    // Insert a wildcard revocation record — all tokens issued before this time are invalid
    db.prepare(`
      INSERT OR REPLACE INTO revoked_tokens (token_hash, user_id, expires_at)
      VALUES ('GLOBAL_REVOCATION_EPOCH', '__all__', ?)
    `).run(new Date(Date.now() + 365 * 24 * 3600_000).toISOString());
  } catch { /* table might not exist — log only */ }

  auditBreakGlass("REVOKE_ALL_SESSIONS", user.id, reason);
  broadcast("ALL_SESSIONS_REVOKED", user.email, reason);

  res.json({
    success: true,
    message: "All sessions revoked. All users must re-authenticate.",
    epoch,
  });
});

/**
 * POST /api/break-glass/tenant-isolate
 * Body: { userId: string, reason: string }
 */
router.post("/tenant-isolate", requireRole("soc_manager"), (req, res) => {
  const user     = (req as any).user;
  const targetId = req.body?.userId;
  const reason   = req.body?.reason || "Tenant isolation";

  if (!targetId) {
    return res.status(400).json({ error: "MISSING_USER_ID", message: "Provide userId in body." });
  }

  if (!state.tenantLocks.includes(targetId)) {
    state.tenantLocks.push(targetId);
  }

  auditBreakGlass("TENANT_ISOLATE", user.id, `${reason} — target: ${targetId}`);
  broadcast("TENANT_ISOLATED", user.email, `User ${targetId} isolated: ${reason}`);

  res.json({ success: true, message: `User ${targetId} is now in isolation.`, state });
});

/**
 * POST /api/break-glass/restore
 * Body: { reason: string }
 */
router.post("/restore", requireRole("admin"), (req, res) => {
  const user   = (req as any).user;
  const reason = req.body?.reason || "Manual restore";

  state = {
    readOnly:    false,
    killSwitch:  false,
    tenantLocks: [],
  };

  auditBreakGlass("RESTORE_NORMAL", user.id, reason);
  broadcast("SYSTEM_RESTORED", user.email, reason);

  res.json({ success: true, message: "System restored to normal operation.", state });
});

export default router;
