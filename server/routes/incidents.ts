import { Router } from "express";
import { db, queries, mapIncident, generateId } from "../db/index.js";
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


const router = Router();

// ─── GET /api/incidents/meta/stats ───────────────────────────────────────────
// MUST be before /:id to avoid being matched as a param
router.get("/meta/stats", (req, res) => {
  const all = (queries.getAllIncidents.all() as any[]).map(mapIncident);
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
    const row = db.prepare("SELECT COUNT(*) as c FROM social_signals").get() as any;
    socialSignals = row?.c || 0;
  } catch {}

  return res.json({ totalIncidents: total, reportedCount: reported, investigatingCount: investigating, containedCount: contained, resolvedCount: resolved, criticalCount, activeAlerts, socialSignals, categoryStats, severityStats, orgStats, trendData });
});



// ─── POST /api/incidents/bulk-status ─────────────────────────────────────────
// MUST be before /:id/status
router.post("/bulk-status", validate(bulkStatusSchema), (req, res) => {
  const { ids, status, authorRole, authorName } = req.body;
  let updatedCount = 0;
  const now = new Date().toISOString();
  for (const id of ids) {
    const row = queries.getIncidentById.get(id) as any;
    if (!row) continue;
    const inc = mapIncident(row);
    const updates = [...inc.updates, { id: generateId("upd"), date: now, author: authorName || (req.user?.name) || "Sentinel Responder", message: `Bulk status modification: transitioned to [${status}]`, statusBefore: inc.status, statusAfter: status }];
    queries.updateIncident.run({ id, status, assigned_investigator: inc.assignedInvestigator, updates: JSON.stringify(updates), updated_at: now });
    queries.insertAuditLog.run({ id: generateId("aud"), timestamp: now, user_name: authorName || (req.user?.name) || "Sentinel Analyst", user_role: authorRole || (req.user?.role) || "analyst", action: "Bulk Incident Status Updated", details: `Bulk updated ${id} to ${status}`, entity_type: "incident", entity_id: id });
    updatedCount++;
  }
  return res.json({ success: true, updatedCount });
});

// ─── POST /api/incidents/bulk-delete ─────────────────────────────────────────
// Admin only — MUST be before /:id routes
router.post("/bulk-delete", requireRole("admin"), validate(bulkDeleteSchema), (req, res) => {
  const { ids, authorRole, authorName } = req.body;
  let deletedCount = 0;
  const now = new Date().toISOString();
  for (const id of ids) {
    const row = queries.getIncidentById.get(id) as any;
    if (!row) continue;
    queries.deleteIncident.run(id);
    queries.insertAuditLog.run({ id: generateId("aud"), timestamp: now, user_name: authorName || (req.user?.name) || "Sentinel Analyst", user_role: authorRole || (req.user?.role) || "admin", action: "Incident Deleted", details: `Deleted incident ${id}`, entity_type: "incident", entity_id: id });
    deletedCount++;
  }
  return res.json({ success: true, deletedCount });
});

// ─── GET /api/incidents ───────────────────────────────────────────────────────
// Paginated, searchable incident list
router.get("/", (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const search = ((req.query.q as string) || "").toLowerCase().trim();

  const all = (queries.getAllIncidents.all() as any[]).map(mapIncident);

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
});

// ─── GET /api/incidents/:id ───────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const row = queries.getIncidentById.get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });
  return res.json(mapIncident(row));
});



// ─── POST /api/incidents ─────────────────────────────────────────────────────
router.post("/", submitLimiter, validate(createIncidentSchema), async (req, res) => {
  const escapeHtml = (str: string) => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  const { title, description, reporterName, reporterContact, reporterOrg, evidenceUrl,
          sector = "", affectedUsers = 0, estimatedLoss = 0 } = req.body;

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
    evidence_url: evidenceUrl || null,
    assigned_investigator: null,
    mitigation_advice: aiResult.mitigationAdvice,
    compromised_indicators: JSON.stringify(aiResult.compromisedIndicators),
    analysis_summary: aiResult.analysisSummary,
    updates: "[]",
    created_at: now,
    updated_at: now,
  };

  queries.insertIncident.run(row);

  // ── Persist priority + context fields ──────────────────────────────────────────
  try {
    queries.updateIncidentPriority.run({
      id,
      priority_score:   priorityResult.score,
      priority_level:   priorityResult.level,
      priority_factors: JSON.stringify(priorityResult.factors),
      ai_confidence:    aiResult.confidence ?? 0,
      affected_users:   Number(affectedUsers) || 0,
      estimated_loss:   Number(estimatedLoss) || 0,
      sector:           sector || "",
      campaign_id:      null,
      updated_at:       now,
    });
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

  queries.insertAuditLog.run({
    id: generateId("aud"),
    timestamp: now,
    user_name: cleanReporterName,
    user_role: "External Organization",
    action: "Incident Reported",
    details: `Incident ${id} submitted. AI categorized as ${aiResult.category} (${aiResult.severity}).`,
    entity_type: "incident",
    entity_id: id,
  });

  // Auto-flag compromised phone numbers in simulated logs
  const phones: string[] = aiResult.compromisedIndicators?.phoneNumbers || [];
  for (const num of phones) {
    if (num && num !== "N/A") {
      db.prepare("INSERT INTO simulated_logs (id,timestamp,source,event,severity,details,indicator) VALUES (?,?,?,?,?,?,?)")
        .run(generateId("log"), now, Math.random() > 0.5 ? "TNM Mpamba" : "Airtel Money", "Cross-check Flag Triggered", "malicious", `System automatically flagged suspicious telemetry on reported number in Incident ${id}`, num);
    }
  }

  // ── Phone cross-incident correlation (serial attacker detection) ────────────
  for (const num of phones) {
    if (!num || num === "N/A") continue;
    try {
      const baseNum = num.replace(/\s*\[.*\]$/, "").trim(); // strip carrier tag if present
      const count = (db.prepare(
        `SELECT COUNT(*) as cnt FROM incidents
         WHERE (compromised_indicators LIKE ? OR description LIKE ? OR title LIKE ?)
         AND created_at > datetime('now', '-24 hours')`
      ).get(`%${baseNum}%`, `%${baseNum}%`, `%${baseNum}%`) as any)?.cnt || 0;

      if (count >= 3) {
        // Same phone in 3+ incidents within 24h = serial attacker pattern
        console.warn(`[Correlation] Serial attacker detected: ${baseNum} in ${count} incidents (24h)`);
        // Escalate current incident to Critical and re-notify
        db.prepare("UPDATE incidents SET severity = 'Critical', updated_at = ? WHERE id = ?")
          .run(now, id);
        try {
          notifyNewIncident(
            id,
            `⚠️ SERIAL ATTACKER: ${cleanTitle} (${baseNum} seen in ${count} incidents)`,
            "Critical"
          );
        } catch {}
        queries.insertAuditLog.run({
          id: generateId("aud"),
          timestamp: now,
          user_name: "SENTINEL AUTO-CORRELATOR",
          user_role: "system",
          action: "Serial Attacker Auto-Escalation",
          details: `Phone ${baseNum} detected in ${count} incidents within 24h. Incident ${id} auto-escalated to Critical.`,
          entity_type: "incident",
          entity_id: id,
        });
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

  return res.status(201).json(mapIncident(queries.getIncidentById.get(id) as any));
});


// ─── POST /api/incidents/:id/status ──────────────────────────────────────────
router.post("/:id/status", validate(updateIncidentSchema), (req, res) => {
  const { id } = req.params;
  const { status, investigator, updateMessage, authorRole, authorName } = req.body;

  const row = queries.getIncidentById.get(id) as any;
  if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });

  const incident = mapIncident(row);
  const prevStatus = incident.status;
  const newStatus  = status || incident.status;
  const newInvestigator = investigator !== undefined ? investigator : incident.assignedInvestigator;

  const updates = [...incident.updates];
  if (updateMessage) {
    updates.push({
      id: generateId("upd"),
      date: new Date().toISOString(),
      author: authorName || req.user?.name || "Sentinel Responder",
      message: updateMessage,
      statusBefore: prevStatus,
      statusAfter: newStatus,
    });
  }

  queries.updateIncident.run({
    id,
    status: newStatus,
    assigned_investigator: newInvestigator,
    updates: JSON.stringify(updates),
    updated_at: new Date().toISOString(),
  });

  queries.insertAuditLog.run({
    id: generateId("aud"),
    timestamp: new Date().toISOString(),
    user_name: authorName || req.user?.name || "Sentinel Analyst",
    user_role: authorRole || req.user?.role || "analyst",
    action: "Incident Status Altered",
    details: `Updated ${id}: ${prevStatus} → ${newStatus}`,
    entity_type: "incident",
    entity_id: id,
  });

  // ── Notification: fire only when status actually changed ──────────────────────────
  if (prevStatus !== newStatus) {
    try { notifyStatusChange(id, incident.title, prevStatus, newStatus, authorName || req.user?.name || "Analyst"); } catch {}
  }

  return res.json(mapIncident(queries.getIncidentById.get(id) as any));
});


// ─── PATCH /api/incidents/:id ─────────────────────────────────────────────────
// Full field update: status, severity, assigned_investigator, mitigation_advice,
// analysis_summary, optional update note. Accessible to analyst+ roles.
router.patch("/:id", requireRole("admin", "super_admin", "gov_admin", "soc_manager", "analyst", "investigator"), (req, res) => {
  const { id } = req.params;
  const row = queries.getIncidentById.get(id) as any;
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
      author:   req.user?.name || "Sentinel Analyst",
      message:  note.trim(),
      statusBefore: incident.status,
      statusAfter:  newStatus,
    });
  }

  // Persist core status/investigator/updates (existing prepared stmt)
  queries.updateIncident.run({
    id,
    status:               newStatus,
    assigned_investigator: newInvestigator,
    updates:              JSON.stringify(updates),
    updated_at:           now,
  });

  // Persist extended fields via direct SQL (not covered by the basic prepared stmt)
  db.prepare(`
    UPDATE incidents
    SET severity = ?, mitigation_advice = ?, analysis_summary = ?, updated_at = ?
    WHERE id = ?
  `).run(newSeverity, newMitigation, newAnalysis, now, id);

  // Audit trail
  queries.insertAuditLog.run({
    id:          generateId("aud"),
    timestamp:   now,
    user_name:   req.user?.name || "Sentinel Analyst",
    user_role:   req.user?.role || "analyst",
    action:      "Incident Updated",
    details:     `Edited incident ${id}: status=${newStatus}, severity=${newSeverity}`,
    entity_type: "incident",
    entity_id:   id,
  });

  return res.json(mapIncident(queries.getIncidentById.get(id) as any));
});


// ─── DELETE /api/incidents/:id ────────────────────────────────────────────────
// Single-incident delete. Restricted to admin / gov_admin / soc_manager.
router.delete("/:id", requireRole("admin", "super_admin", "gov_admin", "soc_manager"), (req, res) => {
  const { id } = req.params;
  const row = queries.getIncidentById.get(id) as any;
  if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Incident not found." });

  const now = new Date().toISOString();
  queries.deleteIncident.run(id);

  queries.insertAuditLog.run({
    id:          generateId("aud"),
    timestamp:   now,
    user_name:   req.user?.name || "Sentinel Admin",
    user_role:   req.user?.role || "admin",
    action:      "Incident Deleted",
    details:     `Permanently deleted incident ${id}`,
    entity_type: "incident",
    entity_id:   id,
  });

  return res.json({ success: true, id });
});


export default router;

