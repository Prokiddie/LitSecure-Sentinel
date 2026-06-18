/**
 * LitSecure Sentinel — Social Media Monitoring API Routes
 *
 * Endpoints for signals, keywords, platform config, stats, and response actions.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db, generateId } from "../db/index.js";
import {
  runSocialScan,
  getSocialStats,
  seedSocialPlatforms,
  seedSocialKeywords,
  triageSignalWithGemini,
} from "../services/socialMedia.js";
import { sendSMS } from "../services/africasTalking.js";
import { notifySocialThreat, notifyNewIncident } from "../services/notifications.js";

const router = Router();
router.use(requireAuth);

// ─── Seed on first import ─────────────────────────────────────────────────────
try { seedSocialPlatforms(); seedSocialKeywords(); } catch {}

// ─── GET /api/social/stats ────────────────────────────────────────────────────
router.get("/stats", (req, res) => {
  try {
    return res.json(getSocialStats());
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/social/signals ─────────────────────────────────────────────────
router.get("/signals", (req, res) => {
  const { platform, type, severity, status, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let query = "SELECT * FROM social_signals WHERE 1=1";
  const params: any[] = [];

  if (platform && platform !== "all") { query += " AND platform = ?"; params.push(platform); }
  if (type     && type     !== "all") { query += " AND signal_type = ?"; params.push(type); }
  if (severity && severity !== "all") { query += " AND ai_severity = ?"; params.push(severity); }
  if (status   && status   !== "all") { query += " AND status = ?"; params.push(status); }

  query += " ORDER BY detected_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  try {
    const rows = db.prepare(query).all(...params) as any[];
    const parsed = rows.map(r => ({
      ...r,
      keywords_hit: JSON.parse(r.keywords_hit || "[]"),
    }));
    const total = (db.prepare("SELECT COUNT(*) as c FROM social_signals").get() as any).c;
    return res.json({ signals: parsed, total });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/social/signals/:id ─────────────────────────────────────────────
router.get("/signals/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM social_signals WHERE id = ?").get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ...row, keywords_hit: JSON.parse(row.keywords_hit || "[]") });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/social/signals/:id ───────────────────────────────────────────
router.patch("/signals/:id", (req, res) => {
  const { id } = req.params;
  const { status, notes, reviewed_by } = req.body;

  const validStatuses = ["New", "Reviewing", "Escalated", "Resolved", "FalsePositive"];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "INVALID_STATUS" });
  }

  try {
    const existing = db.prepare("SELECT * FROM social_signals WHERE id = ?").get(id) as any;
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE social_signals
      SET status = ?, notes = ?, reviewed_by = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status      || existing.status,
      notes       !== undefined ? notes      : existing.notes,
      reviewed_by || existing.reviewed_by || req.user!.name,
      now, id
    );

    // Audit
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, 'social_signal', ?)
    `).run(
      generateId("aud"), now, req.user!.name, req.user!.role,
      "Social Signal Updated",
      `Signal ${id} status → ${status || existing.status}`, id
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/social/signals/:id/retriage ────────────────────────────────────
router.post("/signals/:id/retriage", async (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM social_signals WHERE id = ?").get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });

    const signal = { ...row, keywords_hit: JSON.parse(row.keywords_hit || "[]") };
    const triage = await triageSignalWithGemini(signal);

    const now = new Date().toISOString();
    db.prepare("UPDATE social_signals SET ai_severity = ?, ai_summary = ?, ai_action = ?, updated_at = ? WHERE id = ?")
      .run(triage.severity, triage.summary, triage.action, now, row.id);

    return res.json({ severity: triage.severity, summary: triage.summary, action: triage.action });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/social/signals/:id/escalate ────────────────────────────────────
router.post("/signals/:id/escalate", (req, res) => {
  const { id } = req.params;

  try {
    const signal = db.prepare("SELECT * FROM social_signals WHERE id = ?").get(id) as any;
    if (!signal) return res.status(404).json({ error: "NOT_FOUND" });
    if (signal.incident_id) return res.status(409).json({ error: "ALREADY_ESCALATED", incident_id: signal.incident_id });

    const now        = new Date().toISOString();
    const incidentId = generateId("inc");

    // Map signal type → incident category
    const categoryMap: Record<string, string> = {
      account_theft:  "Account Compromise",
      cyberbullying:  "Cyber Harassment",
      impersonation:  "Impersonation",
      harassment:     "Cyber Harassment",
      hate_speech:    "Hate Crime Online",
      scam:           "Financial Fraud",
    };

    const category = categoryMap[signal.signal_type] || "Cybercrime";
    const title    = `[${signal.platform.toUpperCase()}] ${signal.signal_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} — ${signal.author_handle}`;

    db.prepare(`
      INSERT INTO incidents
        (id, title, description, category, severity, status, reporter_name, reporter_contact,
         reporter_org, incident_date, evidence_url, mitigation_advice, analysis_summary,
         compromised_indicators, updates, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Reported', ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
    `).run(
      incidentId,
      title,
      `SOCIAL MEDIA SIGNAL AUTO-ESCALATED BY MACERT SENTINEL\n\nPlatform: ${signal.platform}\nAuthor: ${signal.author_handle} (${signal.author_url})\nPost URL: ${signal.post_url}\nVictim Mentions: ${signal.victim_handle || "Unknown"}\n\nContent:\n${signal.content_preview}\n\nAI Analysis:\n${signal.ai_summary}\n\nRecommended Action:\n${signal.ai_action}`,
      category,
      signal.ai_severity,
      "MACERT Sentinel (Auto-Escalated)",
      "sentinel@macra.mw",
      "MACRA / MACERT",
      now.slice(0, 10),
      signal.post_url || "",
      signal.ai_action || "",
      signal.ai_summary || "",
      JSON.stringify({ phoneNumbers: [], ips: [], domains: [], devices: [], socialAccounts: [signal.author_handle] }),
      now, now
    );

    // Link signal to incident
    db.prepare("UPDATE social_signals SET incident_id = ?, status = 'Escalated', updated_at = ? WHERE id = ?")
      .run(incidentId, now, id);

    // ── Notifications ───────────────────────────────────────────────────────────
    try {
      notifySocialThreat(signal.platform, signal.signal_type, signal.ai_severity, signal.author_handle);
      notifyNewIncident(incidentId, title, signal.ai_severity);
    } catch {}

    // Audit
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, 'incident', ?)
    `).run(
      generateId("aud"), now, req.user!.name, req.user!.role,
      "Social Signal Escalated",
      `Signal ${id} → Incident ${incidentId} (${category} | ${signal.ai_severity})`, incidentId
    );

    return res.status(201).json({ incident_id: incidentId, title });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/social/signals/:id/sms-victim ──────────────────────────────────
router.post("/signals/:id/sms-victim", async (req, res) => {
  const { phone, customMessage } = req.body;
  if (!phone) return res.status(400).json({ error: "PHONE_REQUIRED" });

  try {
    const signal = db.prepare("SELECT * FROM social_signals WHERE id = ?").get(req.params.id) as any;
    if (!signal) return res.status(404).json({ error: "NOT_FOUND" });

    const message = customMessage || `MACERT MALAWI ALERT: We have received a report of a ${signal.signal_type.replace(/_/g, " ")} affecting you on ${signal.platform}. Please call MACERT: 0800 400 400 (free) or visit macert.mw for assistance. Ref: ${signal.id.slice(-8).toUpperCase()}`;

    let result: any = { success: true, mode: "console" };

    try {
      // Attempt Africa's Talking SMS
      const atResult = await sendSMS(phone, message);
      result = { success: true, mode: "sms", ...atResult };
    } catch (smsErr) {
      // Log to console in dev
      console.log(`\n📱 VICTIM SUPPORT SMS (dev mode):\n   To: ${phone}\n   Message: ${message}\n`);
    }

    // Audit
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, 'social_signal', ?)
    `).run(
      generateId("aud"), now, req.user!.name, req.user!.role,
      "SMS Sent to Victim",
      `Victim support SMS sent to ${phone} for signal ${req.params.id}`, req.params.id
    );

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/social/scan ────────────────────────────────────────────────────
router.post("/scan", requireRole("admin", "analyst", "investigator", "soc_manager"), async (req, res) => {
  try {
    const result = await runSocialScan(true);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/social/keywords ─────────────────────────────────────────────────
router.get("/keywords", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM social_keywords ORDER BY severity DESC, keyword ASC").all();
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/social/keywords ────────────────────────────────────────────────
router.post("/keywords", requireRole("admin", "analyst", "soc_manager"), (req, res) => {
  const { keyword, category = "general", severity = "Medium", platforms } = req.body;
  if (!keyword) return res.status(400).json({ error: "KEYWORD_REQUIRED" });

  try {
    const id  = generateId("skw");
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO social_keywords (id, keyword, category, severity, platforms, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, keyword.toLowerCase().trim(), category, severity, JSON.stringify(platforms || ["twitter","facebook","tiktok","instagram","youtube"]), now);

    return res.status(201).json({ id, keyword, category, severity });
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) return res.status(409).json({ error: "DUPLICATE_KEYWORD" });
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/social/keywords/:id ─────────────────────────────────────────
router.delete("/keywords/:id", requireRole("admin", "analyst", "soc_manager"), (req, res) => {
  try {
    db.prepare("DELETE FROM social_keywords WHERE id = ?").run(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/social/platforms ────────────────────────────────────────────────
router.get("/platforms", (req, res) => {
  try {
    // Check which API keys are actually set
    const keyMap: Record<string, boolean> = {
      twitter:   !!process.env.TWITTER_BEARER_TOKEN,
      facebook:  !!process.env.FACEBOOK_ACCESS_TOKEN,
      tiktok:    !!process.env.TIKTOK_CLIENT_KEY,
      instagram: !!process.env.FACEBOOK_ACCESS_TOKEN, // same token as FB
      youtube:   !!process.env.YOUTUBE_API_KEY,
    };

    const rows = db.prepare("SELECT * FROM social_platform_config ORDER BY platform").all() as any[];
    const enriched = rows.map(r => ({ ...r, api_key_set: keyMap[r.platform] ? 1 : 0 }));

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
