/**
 * LitSecure Sentinel — Public Citizen Reporting Endpoint (Phase 4)
 * No authentication required. Rate-limited to prevent abuse.
 * Accepts incident reports from the public, runs AI analysis,
 * and persists to the incidents table.
 *
 * Prefix: /api/public
 */
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db, queries, generateId } from "../db/index.js";
import { analyzeIncidentWithAI } from "../services/ai.js";
import { calculatePriority } from "../services/priorityEngine.js";
import { sendCriticalIncidentAlert } from "../services/email.js";
import { getWarRoomWS } from "../websocket/warroom.js";
import { notifyNewIncident, notifyPublicReport } from "../services/notifications.js";
import {
  isSupabaseEnabled,
  upsertIncidentToSupabase,
  insertAuditToSupabase,
} from "../db/supabase-client.js";

const router = Router();

// ─── Rate limiter: 10 reports per IP per hour ─────────────────────────────────
const publicReportLimiter = rateLimit({
  windowMs:  60 * 60 * 1000, // 1 hour
  max:       10,
  keyGenerator: (req: Request) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || "unknown",
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error:   "RATE_LIMIT",
      message: "You have submitted too many reports. Please wait before submitting again.",
    });
  },
});

// ─── POST /api/public/report ──────────────────────────────────────────────────
// Fully unauthenticated citizen incident submission
router.post("/report", publicReportLimiter, async (req: Request, res: Response) => {
  const {
    title,
    description,
    reporterName,
    reporterContact,
    reporterOrg,
    sector      = "",
    affectedUsers = 0,
    estimatedLoss = 0,
    source        = "Public Portal",  // track where report came from
  } = req.body;

  // ── Basic validation ────────────────────────────────────────────────────────
  if (!title       || typeof title       !== "string" || title.trim().length < 5)
    return res.status(400).json({ error: "INVALID_TITLE",   message: "Please provide a descriptive title (at least 5 characters)." });
  if (!description || typeof description !== "string" || description.trim().length < 20)
    return res.status(400).json({ error: "INVALID_DESCRIPTION", message: "Please provide a detailed description (at least 20 characters)." });
  if (!reporterName || typeof reporterName !== "string" || reporterName.trim().length < 2)
    return res.status(400).json({ error: "INVALID_NAME", message: "Please provide your name." });
  if (!reporterContact || typeof reporterContact !== "string")
    return res.status(400).json({ error: "INVALID_CONTACT", message: "Please provide a contact number or email." });

  // ── Sanitise inputs ─────────────────────────────────────────────────────────
  const clean = {
    title:          title.trim().substring(0, 300),
    description:    description.trim().substring(0, 5000),
    reporterName:   reporterName.trim().substring(0, 100),
    reporterContact:reporterContact.trim().substring(0, 100),
    reporterOrg:    (reporterOrg || "Public Citizen").trim().substring(0, 100),
    sector:         (sector || "").trim().substring(0, 50),
    affectedUsers:  Math.max(0, parseInt(String(affectedUsers)) || 0),
    estimatedLoss:  Math.max(0, parseFloat(String(estimatedLoss)) || 0),
  };

  try {
    // ── AI Classification ─────────────────────────────────────────────────────
    const aiResult = await analyzeIncidentWithAI(clean.title, clean.description);

    // ── Priority Scoring ──────────────────────────────────────────────────────
    const priorityResult = calculatePriority({
      aiConfidence:  aiResult.confidence ?? 0,
      affectedUsers: clean.affectedUsers,
      estimatedLoss: clean.estimatedLoss,
      sector:        clean.sector,
      severity:      aiResult.severity,
    });

    const now = new Date().toISOString();
    const id  = `LIT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    // ── SQLite insert ─────────────────────────────────────────────────────────
    const row = {
      id,
      title:                  clean.title,
      description:            clean.description,
      category:               aiResult.category,
      severity:               aiResult.severity,
      status:                 "Reported",
      reporter_name:          clean.reporterName,
      reporter_contact:       clean.reporterContact,
      reporter_org:           clean.reporterOrg,
      incident_date:          now,
      evidence_url:           null,
      assigned_investigator:  null,
      mitigation_advice:      aiResult.mitigationAdvice,
      compromised_indicators: JSON.stringify(aiResult.compromisedIndicators),
      analysis_summary:       aiResult.analysisSummary,
      updates:                "[]",
      created_at:             now,
      updated_at:             now,
    };
    queries.insertIncident.run(row);

    // ── Priority fields update ────────────────────────────────────────────────
    try {
      queries.updateIncidentPriority?.run?.({
        id,
        priority_score:   priorityResult.score,
        priority_level:   priorityResult.level,
        priority_factors: JSON.stringify(priorityResult.factors),
        ai_confidence:    aiResult.confidence ?? 0,
        affected_users:   clean.affectedUsers,
        estimated_loss:   clean.estimatedLoss,
        sector:           clean.sector,
        campaign_id:      null,
        updated_at:       now,
      });
    } catch {}

    // ── Audit log ─────────────────────────────────────────────────────────────
    try {
      queries.insertAuditLog?.run?.({
        id:          generateId("aud"),
        timestamp:   now,
        user_name:   clean.reporterName,
        user_role:   "public",
        action:      "Public Incident Report Submitted",
        details:     `${source}: ${clean.title} [${id}] — ${aiResult.severity}`,
        entity_type: "incident",
        entity_id:   id,
      });
    } catch {}

    // ── Supabase dual-write (non-blocking) ────────────────────────────────────
    if (isSupabaseEnabled()) {
      upsertIncidentToSupabase({
        id, title: clean.title, description: clean.description,
        category:          (aiResult.category || "other").toLowerCase().replace(/\s+/g, "_"),
        severity:          aiResult.severity.toLowerCase(),
        status:            "reported",
        reporter_name:     clean.reporterName,
        reporter_org:      clean.reporterOrg,
        reporter_contact:  clean.reporterContact,
        analysis_summary:  aiResult.analysisSummary || "",
        mitigation_advice: aiResult.mitigationAdvice || "",
        compromised_indicators: aiResult.compromisedIndicators || {},
        updates: [],
        priority_score:    priorityResult.score,
        priority_level:    priorityResult.level,
        priority_factors:  priorityResult.factors,
        affected_users:    clean.affectedUsers,
        estimated_loss:    clean.estimatedLoss,
        sector:            clean.sector,
        ai_confidence:     (aiResult.confidence || 0) / 100,
        incident_date:     now,
        created_at:        now,
        updated_at:        now,
      }).catch(() => {});
      insertAuditToSupabase({
        user_name:   clean.reporterName,
        user_role:   "public",
        action:      "Public Report",
        entity_type: "incident",
        entity_id:   id,
        timestamp:   now,
      }).catch(() => {});
    }

    // ── Critical alert email (High/Critical only) ─────────────────────────────
    if (["Critical", "High"].includes(aiResult.severity)) {
      sendCriticalIncidentAlert({
        id,
        title:        clean.title,
        severity:     aiResult.severity,
        category:     aiResult.category,
        reporterName: clean.reporterName,
        reporterOrg:  clean.reporterOrg,
        description:  clean.description,
        mitigation:   aiResult.mitigationAdvice,
      }).catch(() => {});
    }

    // ── WebSocket broadcast (real-time push to SOC analysts) ──────────────────
    const ws = getWarRoomWS();
    if (ws) {
      ws.broadcastNewIncident({
        id, title: clean.title,
        severity:       aiResult.severity,
        category:       aiResult.category,
        priorityScore:  priorityResult.score,
        priorityLevel:  priorityResult.level,
        priorityFactors: priorityResult.factors,
      });
    }

    // ── Notifications ─────────────────────────────────────────────────────────
    try {
      notifyPublicReport(id, clean.title, clean.reporterOrg);
      notifyNewIncident(id, clean.title, aiResult.severity);
    } catch {}

    // ── Response to citizen ───────────────────────────────────────────────────
    return res.status(201).json({
      id,
      title:                  clean.title,
      severity:               aiResult.severity,
      category:               aiResult.category,
      status:                 "Reported",
      analysisSummary:        aiResult.analysisSummary,
      mitigationAdvice:       aiResult.mitigationAdvice,
      compromisedIndicators:  aiResult.compromisedIndicators,
      incidentDate:           now,
      priorityScore:          priorityResult.score,
      priorityLevel:          priorityResult.level,
      source,
      message: "Your report has been received and our team has been alerted. Reference your incident ID to track progress.",
    });

  } catch (err) {
    console.error("[PublicReport] Error:", err);
    return res.status(500).json({
      error: "PROCESSING_ERROR",
      message: "Unable to process your report at this time. Please try again or call MACERT: 112.",
    });
  }
});

// ─── GET /api/public/track/:id — citizen can look up their own report ──────────
router.get("/track/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  // Only return safe public fields — no internal investigator notes
  try {
    const row = (db.prepare(
      "SELECT id, title, category, severity, status, incident_date, mitigation_advice, analysis_summary FROM incidents WHERE id = ?"
    ).get(id)) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "No incident found with that ID." });
    return res.json({
      id:              row.id,
      title:           row.title,
      category:        row.category,
      severity:        row.severity,
      status:          row.status,
      incidentDate:    row.incident_date,
      mitigationAdvice: row.mitigation_advice,
      analysisSummary: row.analysis_summary,
    });
  } catch {
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── GET /api/public/awareness — public awareness tips feed ─────────────────
router.get("/awareness", (_req: Request, res: Response) => {
  return res.json({
    tips: [
      { id: 1, category: "Mobile Money", title: "Never share your OTP", body: "MACRA, Airtel, TNM, or your bank will NEVER call you asking for your PIN or OTP. Hang up immediately.", severity: "critical" },
      { id: 2, category: "Phishing", title: "Verify URLs before clicking", body: "Fraudsters create fake sites that look real. Always check the URL. Malawi government sites end in .gov.mw.", severity: "high" },
      { id: 3, category: "SIM Swap", title: "Act fast on network loss", body: "If your SIM stops working unexpectedly, call your network provider immediately — you may be a victim of SIM swap fraud.", severity: "high" },
      { id: 4, category: "Passwords", title: "Use strong unique passwords", body: "Use a different password for every account. A password manager can help you manage them securely.", severity: "medium" },
      { id: 5, category: "Social Engineering", title: "Verify caller identity", body: "If someone calls claiming to be from MRA, Police, or a bank, hang up and call their official number to verify.", severity: "high" },
    ],
    emergency_contacts: [
      { name: "MACERT Cybercrime Hotline", number: "+265 (0) 111 789 101", available: "24/7" },
      { name: "Malawi Police Cybercrime Unit", number: "+265 (0) 111 789 222", available: "Office Hours" },
      { name: "MACRA Consumer Line", number: "177", available: "24/7, Free" },
    ],
    ussd_code: "*860#",
  });
});

export default router;
