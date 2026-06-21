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
import { scanEvidenceBuffer } from "../services/evidenceScanner.js";
import { saveBase64File } from "./evidence.js";
import crypto from "crypto";

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
    files         = [],
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

  const escapeHtml = (str: string) => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ── Sanitise inputs ─────────────────────────────────────────────────────────
  const clean = {
    title:          escapeHtml(title.trim().substring(0, 300)),
    description:    escapeHtml(description.trim().substring(0, 5000)),
    reporterName:   escapeHtml(reporterName.trim().substring(0, 100)),
    reporterContact:escapeHtml(reporterContact.trim().substring(0, 100)),
    reporterOrg:    escapeHtml((reporterOrg || "Public Citizen").trim().substring(0, 100)),
    sector:         escapeHtml((sector || "").trim().substring(0, 50)),
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

    // ── Scan and save any uploaded files ──────────────────────────────────────
    const processedFiles: { file: any; diskPath: string; size: number; sha256: string }[] = [];
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        if (!file.fileName || !file.fileData) continue;
        const base64 = file.fileData.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");

        const scanResult = await scanEvidenceBuffer(buffer, file.fileName);
        if (!scanResult.safe) {
          try {
            queries.insertAuditLog?.run?.({
              id:          generateId("aud"),
              timestamp:   now,
              user_name:   clean.reporterName,
              user_role:   "public",
              action:      "EVIDENCE_MALWARE_BLOCKED",
              details:     `Malicious file blocked during submission: "${file.fileName}" — ${scanResult.threat}. ${scanResult.details || ""}`,
              entity_type: "incident_evidence",
              entity_id:   id,
            });
          } catch {}
          return res.status(422).json({
            error:   "MALWARE_DETECTED",
            message: `File "${file.fileName}" rejected by automated security filters: ${scanResult.threat}`,
            details: scanResult.details,
            sha256:  scanResult.sha256,
          });
        }

        const saved = saveBase64File(file.fileData, file.fileName);
        processedFiles.push({ file, ...saved });
      }
    }

    const updates = [
      {
        id: generateId("upd"),
        date: now,
        author: "System (Citizen Portal)",
        message: "Report Submitted: Submitted via Web Portal by citizen.",
        statusBefore: "None",
        statusAfter: "Reported"
      },
      {
        id: generateId("upd"),
        date: now,
        author: "System (AI Engine)",
        message: `AI Classified: Automated classification - Category: ${aiResult.category}, Severity: ${aiResult.severity}, Confidence: ${aiResult.confidence || 0}%`,
        statusBefore: "Reported",
        statusAfter: "Reported"
      }
    ];

    for (const p of processedFiles) {
      updates.push({
        id: generateId("upd"),
        date: now,
        author: "System",
        message: `Evidence Added: "${p.file.fileName}"`,
        statusBefore: "Reported",
        statusAfter: "Reported"
      });
    }

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
      evidence_url:           processedFiles.length > 0 ? processedFiles[0].diskPath : null,
      assigned_investigator:  null,
      mitigation_advice:      aiResult.mitigationAdvice,
      compromised_indicators: JSON.stringify(aiResult.compromisedIndicators),
      analysis_summary:       aiResult.analysisSummary,
      updates:                JSON.stringify(updates),
      created_at:             now,
      updated_at:             now,
    };
    queries.insertIncident.run(row);

    // Save evidence entries
    for (const p of processedFiles) {
      const fileId = `EVD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const custodyEntry = {
        action: "UPLOADED",
        actor: "Citizen (Public Portal)",
        actorRole: "public",
        actorId: "public",
        timestamp: now,
        note: `File uploaded during report submission and SHA-256 hash computed.`,
        ipAddress: req.ip || "unknown"
      };

      db.prepare(`
        INSERT INTO incident_evidence (id, incident_id, file_name, file_url, file_type, file_size, sha256_hash, chain_of_custody, tags, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(fileId, id, p.file.fileName, p.diskPath, p.file.fileType || "screenshot", p.size, p.sha256, JSON.stringify([custodyEntry]), JSON.stringify([]), now);

      try {
        queries.insertAuditLog?.run?.({
          id:          generateId("aud"),
          timestamp:   now,
          user_name:   clean.reporterName,
          user_role:   "public",
          action:      "EVIDENCE_UPLOAD",
          details:     `Uploaded evidence file "${p.file.fileName}" during submission for incident ${id}`,
          entity_type: "incident_evidence",
          entity_id:   fileId,
        });
      } catch {}
    }

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
  try {
    const row = (db.prepare(
      "SELECT id, title, category, severity, status, incident_date, mitigation_advice, analysis_summary, updates FROM incidents WHERE id = ?"
    ).get(id)) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "No incident found with that ID." });

    const evidenceRows = db.prepare(
      "SELECT id, file_name, file_type, file_size, uploaded_at FROM incident_evidence WHERE incident_id = ? ORDER BY uploaded_at DESC"
    ).all(id) as any[];

    return res.json({
      id:              row.id,
      title:           row.title,
      category:        row.category,
      severity:        row.severity,
      status:          row.status,
      incidentDate:    row.incident_date,
      mitigationAdvice: row.mitigation_advice,
      analysisSummary: row.analysis_summary,
      updates:         JSON.parse(row.updates || "[]"),
      evidence:        evidenceRows,
    });
  } catch {
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── GET /api/public/track/:id/updates — get updates ─────────────────────────
router.get("/track/:id/updates", (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const row = db.prepare("SELECT updates FROM incidents WHERE id = ?").get(id) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });
    return res.json(JSON.parse(row.updates || "[]"));
  } catch {
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── POST /api/public/track/:id/message — citizen posts message ──────────────
router.post("/track/:id/message", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message, authorName } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "INVALID_MESSAGE", message: "Message is required." });
    }
    const row = db.prepare("SELECT updates, status FROM incidents WHERE id = ?").get(id) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });

    const updates = JSON.parse(row.updates || "[]");
    const now = new Date().toISOString();
    const newUpdate = {
      id: generateId("upd"),
      date: now,
      author: authorName || "Citizen (Reporter)",
      message: message.trim(),
      statusBefore: row.status,
      statusAfter: row.status
    };
    updates.push(newUpdate);

    db.prepare("UPDATE incidents SET updates = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(updates), now, id
    );

    try {
      queries.insertAuditLog?.run?.({
        id:          generateId("aud"),
        timestamp:   now,
        user_name:   authorName || "Citizen",
        user_role:   "public",
        action:      "Incident Message Added",
        details:     `Citizen posted a message to incident ${id}`,
        entity_type: "incident",
        entity_id:   id,
      });
    } catch {}

    const ws = getWarRoomWS();
    if (ws) {
      ws.broadcastIncidentUpdate(id, { updates });
    }

    return res.json({ success: true, updates });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/public/track/:id/upload — citizen uploads file ────────────────
router.post("/track/:id/upload", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileData, description } = req.body;
    if (!fileName || !fileType || !fileData) {
      return res.status(400).json({ message: "fileName, fileType, and fileData are required." });
    }
    const incident = db.prepare("SELECT id, title, updates, status FROM incidents WHERE id = ?").get(id) as any;
    if (!incident) return res.status(404).json({ message: "Incident not found." });

    const base64 = fileData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const scanResult = await scanEvidenceBuffer(buffer, fileName);
    if (!scanResult.safe) {
      try {
        queries.insertAuditLog?.run?.({
          id:          generateId("aud"),
          timestamp:   new Date().toISOString(),
          user_name:   "Citizen",
          user_role:   "public",
          action:      "EVIDENCE_MALWARE_BLOCKED",
          details:     `Malicious file blocked: "${fileName}" — ${scanResult.threat}. ${scanResult.details || ""}`,
          entity_type: "incident_evidence",
          entity_id:   id,
        });
      } catch {}
      return res.status(422).json({
        error:   "MALWARE_DETECTED",
        message: `File "${fileName}" rejected by automated security filters: ${scanResult.threat}`,
        details: scanResult.details,
        sha256:  scanResult.sha256,
      });
    }

    const { diskPath, size, sha256 } = saveBase64File(fileData, fileName);
    const fileId = `EVD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const now = new Date().toISOString();

    const custodyEntry = {
      action: "UPLOADED",
      actor: "Citizen (Public Portal)",
      actorRole: "public",
      actorId: "public",
      timestamp: now,
      note: description || `File uploaded post-submission.`,
      ipAddress: req.ip || "unknown"
    };

    db.prepare(`
      INSERT INTO incident_evidence (id, incident_id, file_name, file_url, file_type, file_size, sha256_hash, chain_of_custody, tags, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, id, fileName, diskPath, fileType, size, sha256, JSON.stringify([custodyEntry]), JSON.stringify([]), now);

    const updates = JSON.parse(incident.updates || "[]");
    updates.push({
      id: generateId("upd"),
      date: now,
      author: "System",
      message: `Evidence Added: "${fileName}"`,
      statusBefore: incident.status,
      statusAfter: incident.status
    });

    db.prepare("UPDATE incidents SET updates = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(updates), now, id
    );

    try {
      queries.insertAuditLog?.run?.({
        id:          generateId("aud"),
        timestamp:   now,
        user_name:   "Citizen",
        user_role:   "public",
        action:      "EVIDENCE_UPLOAD",
        details:     `Uploaded evidence file "${fileName}" for incident ${id}`,
        entity_type: "incident_evidence",
        entity_id:   fileId,
      });
    } catch {}

    const ws = getWarRoomWS();
    if (ws) {
      ws.broadcastIncidentUpdate(id, { updates });
    }

    return res.json({
      success: true,
      id: fileId,
      fileName,
      fileType,
      fileSize: size,
      sha256Hash: sha256,
      uploadedAt: now,
      chainOfCustody: [custodyEntry]
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
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
