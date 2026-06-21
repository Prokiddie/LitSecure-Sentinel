/**
 * LitSecure Sentinel — Notification API Routes
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { generateStreamToken } from "../services/tokenService.js";
import {
  getNotificationsForRole,
  markRead,
  markAllRead,
  countUnread,
  createNotification,
} from "../services/notifications.js";

const router = Router();

// POST /api/notifications/handshake — Create short-lived, single-use stream token for WS auth
router.post("/handshake", requireAuth, (req, res) => {
  try {
    const userPayload = {
      userId: req.user!.id || req.user!.userId,
      id: req.user!.id || req.user!.userId,
      email: req.user!.email,
      name: req.user!.name,
      role: req.user!.role,
    };
    const streamToken = generateStreamToken(userPayload);
    res.json({ streamToken });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications — fetch notifications for caller's role
router.get("/", requireAuth, async (req, res) => {
  try {
    const role = req.user!.role;
    const notifications = await getNotificationsForRole(role, 50);
    const unreadCount   = notifications.filter(n => n.is_read === 0).length;
    res.json({ notifications, unreadCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/stream — Deprecated SSE real-time push stream
router.get("/stream", (req, res) => {
  res.status(410).json({
    error: "SSE_DEPRECATED",
    message: "SSE stream has been deprecated. Please connect via WebSocket /ws/notifications using a streamToken from /api/notifications/handshake."
  });
});

// GET /api/notifications/count — lightweight unread count for polling
router.get("/count", requireAuth, async (req, res) => {
  try {
    const role = req.user!.role;
    const count = await countUnread(role);
    res.json({ unreadCount: count });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/:id/read — mark one as read
router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    await markRead(req.params.id, req.user!.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/read-all — mark all as read
router.post("/read-all", requireAuth, async (req, res) => {
  try {
    await markAllRead(req.user!.role);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/broadcast — admin only: send a custom notification
router.post("/broadcast", requireAuth, async (req, res) => {
  try {
    const { title, message, priority, targetRoles } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required." });
    }
    const id = await createNotification({
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
