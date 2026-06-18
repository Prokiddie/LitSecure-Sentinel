/**
 * LitSecure Sentinel — Notification API Routes
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { verifyAccessToken, hashToken } from "../services/tokenService.js";
import { db } from "../db/index.js";
import {
  getNotificationsForRole,
  markRead,
  markAllRead,
  countUnread,
  createNotification,
  registerSseClient,
} from "../services/notifications.js";

const router = Router();

// SSE connections use ?token= because EventSource can't set Authorization headers
// Uses the same full verification + revocation check as requireAuth
function requireSseAuth(req: any, res: any, next: any) {
  const rawToken = req.query.token as string;
  if (!rawToken) return res.status(401).json({ error: "AUTH_REQUIRED" });
  try {
    const payload = verifyAccessToken(rawToken);
    // Revocation check — same as the main requireAuth middleware
    const tokenHash = hashToken(rawToken);
    const revoked = db.prepare(
      "SELECT id FROM revoked_tokens WHERE token_hash = ? AND expires_at > ?"
    ).get(tokenHash, new Date().toISOString());
    if (revoked) return res.status(401).json({ error: "TOKEN_REVOKED" });
    req.user = payload;
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError")
      return res.status(401).json({ error: "TOKEN_EXPIRED" });
    return res.status(401).json({ error: "TOKEN_INVALID" });
  }
}

// GET /api/notifications — fetch notifications for caller's role
router.get("/", requireAuth, (req, res) => {
  try {
    const role = req.user!.role;
    const notifications = getNotificationsForRole(role, 50);
    const unreadCount   = notifications.filter(n => n.is_read === 0).length;
    res.json({ notifications, unreadCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/stream — SSE real-time push stream
router.get("/stream", requireSseAuth, (req: any, res: any) => {
  const role = req.user!.role;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send a heartbeat comment every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  // Register client — returns cleanup function
  const unregister = registerSseClient(role, res);

  // Send current unread count immediately on connect
  const initial = getNotificationsForRole(role, 10).filter(n => n.is_read === 0);
  if (initial.length > 0) {
    try { res.write(`data: ${JSON.stringify({ __type: "initial", items: initial })}\n\n`); } catch {}
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    unregister();
  });
});


// GET /api/notifications/count — lightweight unread count for polling
router.get("/count", requireAuth, (req, res) => {
  try {
    const role = req.user!.role;
    const count = countUnread(role);
    res.json({ unreadCount: count });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/:id/read — mark one as read
router.post("/:id/read", requireAuth, (req, res) => {
  try {
    markRead(req.params.id, req.user!.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/read-all — mark all as read
router.post("/read-all", requireAuth, (req, res) => {
  try {
    markAllRead(req.user!.role);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/broadcast — admin only: send a custom notification
router.post("/broadcast", requireAuth, (req, res) => {
  try {
    const { title, message, priority, targetRoles } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required." });
    }
    const id = createNotification({
      type: "system_alert",
      priority: priority ?? "medium",
      title,
      message,
      targetRoles: targetRoles ?? undefined,
    });
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
