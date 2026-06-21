import { Router } from "express";
import { queryAll, queryGet, queryRun, isPgActive, mapIncident, generateId } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { submitLimiter } from "../middleware/rateLimiter.js";
import { createIncidentSchema, updateIncidentSchema, bulkStatusSchema, bulkDeleteSchema } from "../schemas/index.js";
import { analyzeIncidentWithAI } from "../services/ai.js";
import { notifyNewIncident, notifyIncidentUpdate, notifyStatusChange } from "../services/notifications.js";
import { upsertIncidentToSupabase, insertAuditToSupabase, isSupabaseEnabled } from "../db/supabase-client.js";
import { sendCriticalIncidentAlert } from "../services/email.js";
import { calculatePriority } from "../services/priorityEngine.js";
import { getWarRoomWS } from "../websocket/warroom.js";
import { db } from "../db/index.js";
import { scanEvidenceBuffer } from "../services/evidenceScanner.js";
import { saveBase64File } from "./evidence.js";
import crypto from "crypto";


const router = Router();

// ─── GET /api/incidents/meta/stats ───────────────────────────────────────────
// MUST be before /:id to avoid being matched as a param
router.get("/meta/stats", async (req, res) => {
  try {
    const all = (await queryAll("SELECT * FROM incidents ORDER BY incident_date DESC")).map(mapIncident);
    const total         = all.length;
    const reported      = all.filter(i => i.status === "Reported").length;
    const investigating = all.filter(i => i.status === "Investigating").length;
    const contained     = all.filter(i => i.status === "Contained").length;
    const resolved      = all.filter(i => i.status === "Resolved").length;

    const catMap: Record<string, number> = { Fraud: 0, Phishing: 0, Malware: 0, "Unauthorized Access": 0, "System Breach": 0, "Network Intrusion": 0, Unknown: 0 };
    all.forEach(i => { if (catMap[i.category] !== undefined) catMap[i.category]++; else catMap[i.category] = 1; });
    const categoryStats = Object.entries(catMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

    const sevMap: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    all.forEach(i => { sevMap[i.severity] = (sevMap[i.severity] || 0) + 1; });
    const severityStats = Object.entries(sevMap).map(([name, value]) => ({ name, value }));

    const orgMap: Record<string, number> = {};
    all.forEach(i => { orgMap[i.reporterOrg] = (orgMap[i.reporterOrg] || 0) + 1; });
    const orgStats = Object.entries(orgMap).map(([name, value]) => ({ name, value }));

    const trendData = [
      { month: "Jan", fraud: 12, intrusion: 2, phishing: 9, malware: 5 },
      { month: "Feb", fraud: 17, intrusion: 5, phishing: 11, malware: 8 },
      { month: "Mar", fraud: 22, intrusion: 8, phishing: 15, malware: 12 },
      { month: "Apr", fraud: 30, intrusion: 11, phishing: 20, malware: 18 },
      { month: "May", fraud: 45, intrusion: 14, phishing: 28, malware: 25 },
      { month: "Jun", fraud: all.filter(i => i.category === "Fraud").length + 5, intrusion: all.filter(i => i.category === "Network Intrusion").length + 3, phishing: all.filter(i => i.category === "Phishing").length + 6, malware: all.filter(i => i.category === "Malware").length + 4 },
    ];

    const criticalCount = all.filter(i => i.severity === "Critical").length;
    const activeAlerts  = all.filter(i => !["Resolved","Contained"].includes(i.status)).length;

    // Social media signal count (gracefully 0 if table not yet migrated)
    let socialSignals = 0;
    try {
      const row = await queryGet("SELECT COUNT(*) as c FROM social_signals") as any;
      socialSignals = row?.c || row?.count || 0;
    } catch {}

    return res.json({ totalIncidents: total, reportedCount: reported, investigatingCount: investigating, containedCount: contained, resolvedCount: resolved, criticalCount, activeAlerts, socialSignals, categoryStats, severityStats, orgStats, trendData });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});



// ─── POST /api/incidents/bulk-status ─────────────────────────────────────────
// MUST be before /:id/status
router.post("/bulk-status", validate(bulkStatusSchema), async (req, res) => {
  try {
    const { ids, status, authorRole, authorName } = req.body;
    let updatedCount = 0;
    const now = new Date().toISOString();
    for (const id of ids) {
      const row = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]) as any;
      if (!row) continue;
      const inc = mapIncident(row);
      const updates = [...inc.updates, { id: generateId("upd"), date: now, timestamp: now, author: authorName || (req.user?.name) || "Sentinel Responder", message: `Bulk status modification: transitioned to [${status}]`, statusBefore: inc.status, statusAfter: status }];
      
      await queryRun(`
        UPDATE incidents SET status=$1, assigned_investigator=$2, updates=$3, updated_at=$4 WHERE id=$5
      `, [status, inc.assignedInvestigator, JSON.stringify(updates), now, id]);

      await queryRun(`
        INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [generateId("aud"), now, authorName || (req.user?.name) || "Sentinel Analyst", authorRole || (req.user?.role) || "analyst", "Bulk Incident Status Updated", `Bulk updated ${id} to ${status}`, "incident", id]);
      updatedCount++;
    }
    return res.json({ success: true, updatedCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/incidents/bulk-delete ─────────────────────────────────────────
// Admin only — MUST be before /:id routes
router.post("/bulk-delete", requireRole("admin"), validate(bulkDeleteSchema), async (req, res) => {
  try {
    const { ids, authorRole, authorName } = req.body;
    let deletedCount = 0;
    const now = new Date().toISOString();
    for (const id of ids) {
      const row = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]) as any;
      if (!row) continue;
      await queryRun("DELETE FROM incidents WHERE id = $1", [id]);
      
      await queryRun(`
        INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [generateId("aud"), now, authorName || (req.user?.name) || "Sentinel Analyst", authorRole || (req.user?.role) || "admin", "Incident Deleted", `Deleted incident ${id}`, "incident", id]);
      deletedCount++;
    }
    return res.json({ success: true, deletedCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/incidents ───────────────────────────────────────────────────────
// Paginated, searchable incident list
router.get("/", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const search = ((req.query.q as string) || "").toLowerCase().trim();

    const all = (await queryAll("SELECT * FROM incidents ORDER BY incident_date DESC")).map(mapIncident);

    const filtered = search
      ? all.filter(i =>
          i.title.toLowerCase().includes(search) ||
          i.description.toLowerCase().includes(search) ||
          i.id.toLowerCase().includes(search) ||
          i.reporterOrg.toLowerCase().includes(search) ||
          i.category.toLowerCase().includes(search)
        )
      : all;

    const total   = filtered.length;
    const start   = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    // If no pagination params, return full list for backward compat
    if (!req.query.page && !req.query.limit) {
      return res.json(filtered);
    }

    return res.json({ data: paginated, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/incidents/:id ───────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const row = await queryGet("SELECT * FROM incidents WHERE id = $1", [req.params.id]) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });
    return res.json(mapIncident(row));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});



// ─── POST /api/incidents ─────────────────────────────────────────────────────
router.post("/", submitLimiter, validate(createIncidentSchema), async (req, res) => {
  try {
    const escapeHtml = (str: string) => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    const { title, description, reporterName, reporterContact, reporterOrg, evidenceUrl,
            sector = "", affectedUsers = 0, estimatedLoss = 0, files = [] } = req.body;

    const cleanTitle = escapeHtml(title.trim().substring(0, 300));
    const cleanDescription = escapeHtml(description.trim().substring(0, 5000));
    const cleanReporterName = escapeHtml((reporterName || "").trim().substring(0, 100));
    const cleanReporterContact = escapeHtml((reporterContact || "").trim().substring(0, 100));
    const cleanReporterOrg = escapeHtml((reporterOrg || "Public Reporting Portal").trim().substring(0, 100));

    const aiResult = await analyzeIncidentWithAI(cleanTitle, cleanDescription);

    // ── Priority scoring ────────────────────────────────────────────────────────────────
    const priorityResult = calculatePriority({
      aiConfidence:   aiResult.confidence ?? 0,
      affectedUsers:  Number(affectedUsers) || 0,
      estimatedLoss:  Number(estimatedLoss) || 0,
      sector:         sector,
      severity:       aiResult.severity,
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
            await queryRun(`
              INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            `, [
              generateId("aud"),
              now,
              cleanReporterName,
              "public",
              "EVIDENCE_MALWARE_BLOCKED",
              `Malicious file blocked during submission: "${file.fileName}" — ${scanResult.threat}. ${scanResult.details || ""}`,
              "incident_evidence",
              id,
            ]);
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
        timestamp: now,
        author: "System (Portal Form)",
        message: "Report Submitted: Submitted via portal intake.",
        statusBefore: "None",
        statusAfter: "Reported"
      },
      {
        id: generateId("upd"),
        date: now,
        timestamp: now,
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
        timestamp: now,
        author: "System",
        message: `Evidence Added: "${p.file.fileName}"`,
        statusBefore: "Reported",
        statusAfter: "Reported"
      });
    }

    const row = {
      id,
      title:                  cleanTitle,
      description:            cleanDescription,
      category: aiResult.category,
      severity: aiResult.severity,
      status: "Reported",
      reporter_name: cleanReporterName,
      reporter_contact: cleanReporterContact,
      reporter_org: cleanReporterOrg,
      incident_date: now,
      evidence_url: processedFiles.length > 0 ? processedFiles[0].diskPath : (evidenceUrl || null),
      assigned_investigator: null,
      mitigation_advice: aiResult.mitigationAdvice,
      compromised_indicators: JSON.stringify(aiResult.compromisedIndicators),
      analysis_summary: aiResult.analysisSummary,
      updates: JSON.stringify(updates),
      created_at: now,
      updated_at: now,
    };

    await queryRun(`
      INSERT INTO incidents (id,title,description,category,severity,status,reporter_name,reporter_contact,reporter_org,incident_date,evidence_url,assigned_investigator,mitigation_advice,compromised_indicators,analysis_summary,updates,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [
      row.id, row.title, row.description, row.category, row.severity, row.status,
      row.reporter_name, row.reporter_contact, row.reporter_org, row.incident_date,
      row.evidence_url, row.assigned_investigator, row.mitigation_advice,
      row.compromised_indicators, row.analysis_summary, row.updates, row.created_at, row.updated_at
    ]);

    // Save evidence entries
    for (const p of processedFiles) {
      const fileId = `EVD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const custodyEntry = {
        action: "UPLOADED",
        actor: cleanReporterName,
        actorRole: "user",
        actorId: "user",
        timestamp: now,
        note: `File uploaded during report submission.`,
        ipAddress: req.ip || "unknown"
      };

      db.prepare(`
        INSERT INTO incident_evidence (id, incident_id, file_name, file_url, file_type, file_size, sha256_hash, chain_of_custody, tags, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(fileId, id, p.file.fileName, p.diskPath, p.file.fileType || "screenshot", p.size, p.sha256, JSON.stringify([custodyEntry]), JSON.stringify([]), now);

      try {
        await queryRun(`
          INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [
          generateId("aud"),
          now,
          cleanReporterName,
          "user",
          "EVIDENCE_UPLOAD",
          `Uploaded evidence file "${p.file.fileName}" during submission for incident ${id}`,
          "incident_evidence",
          fileId,
        ]);
      } catch {}
    }

    // ── Persist priority + context fields ──────────────────────────────────────────
    try {
      await queryRun(`
        UPDATE incidents
        SET priority_score=$1, priority_level=$2,
            priority_factors=$3, ai_confidence=$4,
            affected_users=$5, estimated_loss=$6,
            sector=$7, campaign_id=$8, updated_at=$9
        WHERE id=$10
      `, [
        priorityResult.score,
        priorityResult.level,
        JSON.stringify(priorityResult.factors),
        aiResult.confidence ?? 0,
        Number(affectedUsers) || 0,
        Number(estimatedLoss) || 0,
        sector || "",
        null,
        now,
        id
      ]);
    } catch {}


    // ── Supabase dual-write (non-blocking) ──────────────────────────────────────
    const supabasePayload = {
      id, title: cleanTitle, description: cleanDescription,
      category:          (aiResult.category || "other").toLowerCase().replace(/\s+/g, "_"),
      severity:          aiResult.severity.toLowerCase(),
      status:            "reported",
      reporter_name:     cleanReporterName,
      reporter_org:      cleanReporterOrg,
      reporter_contact:  cleanReporterContact,
      analysis_summary:  aiResult.analysisSummary || "",
      mitigation_advice: aiResult.mitigationAdvice || "",
      ioc_phones:        aiResult.compromisedIndicators?.phoneNumbers?.filter((p: string) => p && p !== "N/A") || [],
      ioc_ips:           [],
      ioc_domains:       [],
      ai_confidence:     (aiResult.confidence || 0) / 100,
      is_deleted:        false,
      created_at:        now,
      updated_at:        now,
    };
    upsertIncidentToSupabase(supabasePayload).catch(() => {}); // fire-and-forget
    insertAuditToSupabase({ id: generateId("aud"), user_name: cleanReporterName, user_role: "External Organization", action: "Incident Reported", details: `Incident ${id} submitted`, entity_type: "incident", entity_id: id, timestamp: now }).catch(() => {});

    await queryRun(`
      INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      generateId("aud"), now, cleanReporterName, "External Organization", "Incident Reported",
      `Incident ${id} submitted. AI categorized as ${aiResult.category} (${aiResult.severity}).`,
      "incident", id
    ]);

    // Auto-flag compromised phone numbers in simulated logs
    const phones: string[] = aiResult.compromisedIndicators?.phoneNumbers || [];
    for (const num of phones) {
      if (num && num !== "N/A") {
        await queryRun(`
          INSERT INTO simulated_logs (id,timestamp,source,event,severity,details,indicator)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
          generateId("log"), now, Math.random() > 0.5 ? "TNM Mpamba" : "Airtel Money",
          "Cross-check Flag Triggered", "malicious",
          `System automatically flagged suspicious telemetry on reported number in Incident ${id}`, num
        ]);
      }
    }

    // ── Phone cross-incident correlation (serial attacker detection) ────────────
    for (const num of phones) {
      if (!num || num === "N/A") continue;
      try {
        const baseNum = num.replace(/\s*\[.*\]$/, "").trim(); // strip carrier tag if present
        
        const active = await isPgActive();
        const correlationSql = active
          ? `SELECT COUNT(*) as cnt FROM incidents
             WHERE (compromised_indicators::text LIKE $1 OR description LIKE $2 OR title LIKE $3)
             AND created_at > NOW() - INTERVAL '24 hours'`
          : `SELECT COUNT(*) as cnt FROM incidents
             WHERE (compromised_indicators LIKE $1 OR description LIKE $2 OR title LIKE $3)
             AND created_at > datetime('now', '-24 hours')`;

        const countRow = await queryGet(correlationSql, [`%${baseNum}%`, `%${baseNum}%`, `%${baseNum}%`]) as any;
        const count = countRow?.cnt || countRow?.count || 0;

        if (count >= 3) {
          // Same phone in 3+ incidents within 24h = serial attacker pattern
          console.warn(`[Correlation] Serial attacker detected: ${baseNum} in ${count} incidents (24h)`);
          // Escalate current incident to Critical and re-notify
          await queryRun("UPDATE incidents SET severity = 'Critical', updated_at = $1 WHERE id = $2", [now, id]);
          try {
            notifyNewIncident(
              id,
              `⚠️ SERIAL ATTACKER: ${cleanTitle} (${baseNum} seen in ${count} incidents)`,
              "Critical"
            );
          } catch {}
          await queryRun(`
            INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [
            generateId("aud"), now, "SENTINEL AUTO-CORRELATOR", "system", "Serial Attacker Auto-Escalation",
            `Phone ${baseNum} detected in ${count} incidents within 24h. Incident ${id} auto-escalated to Critical.`,
            "incident", id
          ]);
          break; // One auto-escalation is enough
        }
      } catch (e) {
        // Non-critical — don't block incident creation
      }
    }

    // Fire notification to analysts/SOC
    try { notifyNewIncident(id, cleanTitle, aiResult.severity); } catch {}

    // ── WebSocket broadcast (real-time push to SOC analysts) ──────────────────
    try {
      const ws = getWarRoomWS();
      if (ws) {
        ws.broadcastNewIncident({
          id,
          title:          cleanTitle,
          severity:       aiResult.severity,
          category:       aiResult.category,
          priorityScore:  priorityResult.score,
          priorityLevel:  priorityResult.level,
          priorityFactors:priorityResult.factors,
        });
      }
    } catch (err) {
      console.error("[WS] Failed to broadcast new incident:", err);
    }

    // ── Email alert for Critical incidents ──────────────────────────────────────
    if (aiResult.severity === "Critical" || aiResult.severity === "High") {
      sendCriticalIncidentAlert({
        id, title: cleanTitle,
        severity:     aiResult.severity,
        category:     aiResult.category,
        reporterName: cleanReporterName,
        reporterOrg:  cleanReporterOrg,
        description:  cleanDescription,
        mitigation:   aiResult.mitigationAdvice || "",
      }).catch(() => {}); // non-blocking
    }

    const createdIncident = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]);
    return res.status(201).json(mapIncident(createdIncident));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});


// ─── POST /api/incidents/:id/status ──────────────────────────────────────────
router.post("/:id/status", validate(updateIncidentSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, investigator, updateMessage, authorRole, authorName } = req.body;

    const row = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });

    const incident = mapIncident(row);
    const prevStatus = incident.status;
    const newStatus  = status || incident.status;
    const newInvestigator = investigator !== undefined ? investigator : incident.assignedInvestigator;

    const updates = [...incident.updates];
    if (updateMessage) {
      const nowTime = new Date().toISOString();
      updates.push({
        id: generateId("upd"),
        date: nowTime,
        timestamp: nowTime,
        author: authorName || req.user?.name || "Sentinel Responder",
        message: updateMessage,
        statusBefore: prevStatus,
        statusAfter: newStatus,
      });
    }

    await queryRun(`
      UPDATE incidents SET status=$1, assigned_investigator=$2, updates=$3, updated_at=$4 WHERE id=$5
    `, [newStatus, newInvestigator, JSON.stringify(updates), new Date().toISOString(), id]);

    await queryRun(`
      INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      generateId("aud"), new Date().toISOString(), authorName || req.user?.name || "Sentinel Analyst",
      authorRole || req.user?.role || "analyst", "Incident Status Altered", `Updated ${id}: ${prevStatus} → ${newStatus}`,
      "incident", id
    ]);

    // ── Notification: fire only when status actually changed ──────────────────────────
    if (prevStatus !== newStatus) {
      try { notifyStatusChange(id, incident.title, prevStatus, newStatus, authorName || req.user?.name || "Analyst"); } catch {}
    }

    const updatedIncident = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]);
    return res.json(mapIncident(updatedIncident));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});


// ─── PATCH /api/incidents/:id ─────────────────────────────────────────────────
// Full field update: status, severity, assigned_investigator, mitigation_advice,
// analysis_summary, optional update note. Accessible to analyst+ roles.
router.patch("/:id", requireRole("admin", "super_admin", "gov_admin", "soc_manager", "analyst", "investigator"), async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });

    const incident = mapIncident(row);
    const now = new Date().toISOString();

    const {
      status,
      severity,
      assigned_investigator,
      mitigation_advice,
      analysis_summary,
      note,
    } = req.body;

    // Build the updated record
    const newStatus      = status      ?? incident.status;
    const newSeverity    = severity    ?? incident.severity;
    const newInvestigator = assigned_investigator !== undefined ? assigned_investigator : incident.assignedInvestigator;
    const newMitigation   = mitigation_advice !== undefined ? mitigation_advice : incident.mitigationAdvice;
    const newAnalysis     = analysis_summary  !== undefined ? analysis_summary  : incident.analysisSummary;

    // Append optional update note to timeline
    const updates = [...(incident.updates ?? [])];
    if (note && note.trim()) {
      updates.push({
        id:       generateId("upd"),
        date:     now,
        timestamp: now,
        author:   req.user?.name || "Sentinel Analyst",
        message:  note.trim(),
        statusBefore: incident.status,
        statusAfter:  newStatus,
      });
    }

    await queryRun(`
      UPDATE incidents
      SET status = $1, assigned_investigator = $2, updates = $3, severity = $4, mitigation_advice = $5, analysis_summary = $6, updated_at = $7
      WHERE id = $8
    `, [
      newStatus, newInvestigator, JSON.stringify(updates), newSeverity, newMitigation, newAnalysis, now, id
    ]);

    // Audit trail
    await queryRun(`
      INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      generateId("aud"), now, req.user?.name || "Sentinel Analyst", req.user?.role || "analyst",
      "Incident Updated", `Edited incident ${id}: status=${newStatus}, severity=${newSeverity}`,
      "incident", id
    ]);

    const updatedIncident = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]);
    return res.json(mapIncident(updatedIncident));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});


// ─── DELETE /api/incidents/:id ────────────────────────────────────────────────
// Single-incident delete. Restricted to admin / gov_admin / soc_manager.
router.delete("/:id", requireRole("admin", "super_admin", "gov_admin", "soc_manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryGet("SELECT * FROM incidents WHERE id = $1", [id]) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });

    const now = new Date().toISOString();
    await queryRun("DELETE FROM incidents WHERE id = $1", [id]);

    await queryRun(`
      INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      generateId("aud"), now, req.user?.name || "Sentinel Admin", req.user?.role || "admin",
      "Incident Deleted", `Permanently deleted incident ${id}`, "incident", id
    ]);

    return res.json({ success: true, id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});


export default router;
