/**
 * LitSecure Sentinel — Notification Service v2
 * Real-time notification engine:
 *  • PostgreSQL/SQLite persistence
 *  • Authenticated WebSocket push stream
 *  • Browser Push API notification trigger
 *  • Factory functions for every event type in the system
 */
import { db, queryAll, queryGet, queryRun } from "../db/index.js";
import crypto from "crypto";
import { smsAlertAnalysts, smsLockdownAlert, isConfigured as atConfigured } from "./africasTalking.js";
import { getNotificationsWS } from "../websocket/notifications.js";

export type NotificationType =
  | "incident_new"
  | "incident_update"
  | "incident_critical"
  | "incident_status_change"
  | "campaign_detected"
  | "lockdown_activated"
  | "lockdown_deactivated"
  | "evidence_uploaded"
  | "risk_score_critical"
  | "edr_alert"
  | "edr_quarantine"
  | "social_threat"
  | "sim_swap_cluster"
  | "threat_intel_ioc"
  | "kb_pending_approval"
  | "public_report"
  | "system_alert"
  | "audit_warning";

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface Notification {
  id:          string;
  type:        NotificationType;
  priority:    NotificationPriority;
  title:       string;
  message:     string;
  link?:       string;       // e.g. "#command" to jump to tab
  entityId?:   string;       // camelCase alias
  entity_id?:  string;       // snake_case DB column
  targetRoles: string;       // camelCase alias — JSON array of roles
  target_roles:string;       // snake_case DB column
  isRead:      number;       // camelCase alias — 0 | 1
  is_read:     number;       // snake_case DB column
  createdAt:   string;       // camelCase alias
  created_at:  string;       // snake_case DB column
  readAt?:     string;
  read_at?:    string;
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Create a new notification. Called from other services.
 */
export async function createNotification(opts: {
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  entityId?: string;
  targetRoles?: string[];
}): Promise<string> {
  const id = `NOTIF-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const now = new Date().toISOString();
  const roles = opts.targetRoles ?? ["admin", "analyst", "soc_manager", "investigator", "auditor", "gov_admin"];
  const priority = opts.priority ?? "medium";

  await queryRun(`
    INSERT INTO notifications (id, type, priority, title, message, link, entity_id, target_roles, is_read, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
  `, [id, opts.type, priority, opts.title, opts.message, opts.link ?? null, opts.entityId ?? null, JSON.stringify(roles), now]);

  // ── WebSocket push — instant delivery to all connected browsers ────────────────────
  const payload = { id, type: opts.type, priority, title: opts.title, message: opts.message, link: opts.link, entity_id: opts.entityId, is_read: 0, created_at: now };
  try {
    const wsServer = getNotificationsWS();
    if (wsServer) {
      wsServer.broadcastToRole(roles, payload);
    }
  } catch (err) {
    console.error("[WS Notifications] Broadcast failed:", err);
  }

  return id;
}

/**
 * Retrieve notifications for a given role, newest first.
 */
export async function getNotificationsForRole(role: string, limit = 50): Promise<Notification[]> {
  const all = await queryAll("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 500") as Notification[];
  return all
    .filter(n => {
      try { return JSON.parse(n.target_roles as unknown as string).includes(role); } catch { return true; }
    })
    .slice(0, limit);
}

/**
 * Mark one notification as read.
 */
export async function markRead(notifId: string, userId: string) {
  await queryRun("UPDATE notifications SET is_read = 1, read_at = $1 WHERE id = $2", [
    new Date().toISOString(), notifId
  ]);
}

/**
 * Mark all notifications as read for a role.
 */
export async function markAllRead(role: string) {
  const all = await queryAll("SELECT * FROM notifications WHERE is_read = 0") as Notification[];
  const relevant = all.filter(n => {
    try { return JSON.parse(n.target_roles as unknown as string).includes(role); } catch { return true; }
  });
  const now = new Date().toISOString();
  for (const n of relevant) {
    await queryRun("UPDATE notifications SET is_read = 1, read_at = $1 WHERE id = $2", [now, n.id]);
  }
}

/**
 * Count unread notifications for a role.
 */
export async function countUnread(role: string): Promise<number> {
  const relevant = await getNotificationsForRole(role, 200);
  return relevant.filter(n => !n.isRead && n.is_read === 0).length;
}

// ─── Well-known notification factories ────────────────────────────────────────

export async function notifyNewIncident(incidentId: string, title: string, severity: string) {
  const isCritical = severity === "Critical";
  await createNotification({
    type: isCritical ? "incident_critical" : "incident_new",
    priority: isCritical ? "critical" : "high",
    title: isCritical ? `⚠️ CRITICAL INCIDENT: ${title}` : `New Incident Reported`,
    message: `${title} (${severity}) has been logged and requires classification. ID: ${incidentId}`,
    link: "#command",
    entityId: incidentId,
    targetRoles: isCritical
      ? ["admin", "analyst", "soc_manager", "investigator", "gov_admin"]
      : ["admin", "analyst", "soc_manager"],
  });

  // SMS: only for critical incidents — get analyst phones from DB
  if (isCritical && atConfigured()) {
    try {
      const rows = await queryAll(
        `SELECT phone FROM users WHERE role IN ('analyst','soc_manager','gov_admin','admin') AND is_active = 1 AND phone IS NOT NULL`
      ) as { phone: string }[];
      const phones = rows.map(r => r.phone).filter(Boolean);
      if (phones.length > 0) {
        smsAlertAnalysts(phones, incidentId, title, severity).catch(console.error);
      }
    } catch (e) { console.error("[AT] SMS analyst alert failed:", e); }
  }
}

export async function notifyIncidentUpdate(incidentId: string, title: string, newStatus: string, actor: string) {
  await createNotification({
    type: "incident_update",
    priority: "medium",
    title: `Incident Updated → ${newStatus}`,
    message: `"${title}" moved to [${newStatus}] by ${actor}. ID: ${incidentId}`,
    link: "#command",
    entityId: incidentId,
  });
}

export async function notifyCampaignDetected(campaignId: string, campaignTitle: string, riskScore: number) {
  await createNotification({
    type: "campaign_detected",
    priority: riskScore >= 80 ? "critical" : "high",
    title: `🔗 Campaign Detected: ${campaignTitle}`,
    message: `Cross-sector correlation identified a coordinated attack campaign with risk score ${riskScore}/100. Immediate review required.`,
    link: "#campaigns",
    entityId: campaignId,
    targetRoles: ["admin", "analyst", "soc_manager", "gov_admin"],
  });
}

export async function notifyLockdown(activated: boolean, actor: string) {
  await createNotification({
    type: activated ? "lockdown_activated" : "lockdown_deactivated",
    priority: "critical",
    title: activated ? "🔴 NATIONAL ALERT MODE ACTIVATED" : "✅ National Alert Mode Deactivated",
    message: activated
      ? `Emergency lockdown initiated by ${actor}. New account creation suspended. Enhanced monitoring enabled.`
      : `National Alert Mode has been lifted by ${actor}. Normal operations resumed.`,
    link: "#settings",
    targetRoles: ["admin", "analyst", "soc_manager", "investigator", "auditor", "gov_admin"],
  });

  // SMS: broadcast to ALL responders on lockdown
  if (atConfigured()) {
    try {
      const rows = await queryAll(
        `SELECT phone FROM users WHERE role != 'citizen' AND is_active = 1 AND phone IS NOT NULL`
      ) as { phone: string }[];
      const phones = rows.map(r => r.phone).filter(Boolean);
      if (phones.length > 0) {
        smsLockdownAlert(phones, activated, actor).catch(console.error);
      }
    } catch (e) { console.error("[AT] SMS lockdown alert failed:", e); }
  }
}

export async function notifyEvidenceUploaded(incidentId: string, fileName: string, uploader: string) {
  await createNotification({
    type: "evidence_uploaded",
    priority: "medium",
    title: `Evidence Uploaded`,
    message: `"${fileName}" uploaded to incident ${incidentId} by ${uploader}. SHA-256 hash verified.`,
    link: "#evidence",
    entityId: incidentId,
  });
}

export async function notifyRiskScoreCritical(orgName: string, score: number) {
  await createNotification({
    type: "risk_score_critical",
    priority: "high",
    title: `Risk Score Alert: ${orgName}`,
    message: `${orgName} has reached a risk score of ${score}/100 (CRITICAL). MACRA review recommended within 48 hours.`,
    link: "#scoring",
    targetRoles: ["admin", "gov_admin", "auditor"],
  });
}

// ─── New Factory Functions ───────────────────────────────────────────────────

/** Public citizen report submitted (no auth) — alert SOC immediately */
export async function notifyPublicReport(reportRef: string, subject: string, reporterOrg: string) {
  await createNotification({
    type: "public_report",
    priority: "high",
    title: `📨 Public Incident Report Received`,
    message: `"${subject}" submitted by ${reporterOrg} via the public portal. Ref: ${reportRef}. Requires triage.`,
    link: "#command",
    entityId: reportRef,
    targetRoles: ["admin", "analyst", "soc_manager", "investigator"],
  });
}

/** Incident status changed (e.g. Investigating → Contained) */
export async function notifyStatusChange(incidentId: string, title: string, oldStatus: string, newStatus: string, actor: string) {
  const isCriticalStatus = ["Escalated", "Contained", "Resolved"].includes(newStatus);
  await createNotification({
    type: "incident_status_change",
    priority: isCriticalStatus ? "high" : "medium",
    title: `Status: ${oldStatus} → ${newStatus}`,
    message: `"${title}" updated from [${oldStatus}] to [${newStatus}] by ${actor}. ID: ${incidentId}`,
    link: "#command",
    entityId: incidentId,
    targetRoles: ["admin", "analyst", "soc_manager", "investigator", "gov_admin"],
  });
}

/** EDR suspicious activity detected on an endpoint */
export async function notifyEdrAlert(hostname: string, alertType: string, riskScore: number, organization: string) {
  const isCritical = riskScore >= 80;
  await createNotification({
    type: "edr_alert",
    priority: isCritical ? "critical" : "high",
    title: isCritical ? `🖥️ CRITICAL EDR ALERT: ${hostname}` : `EDR Alert: ${hostname}`,
    message: `${alertType} detected on ${hostname} (${organization}). Risk score: ${riskScore}/100. ${isCritical ? "Immediate isolation recommended." : "Review in EDR Endpoint Protection."}`,
    link: "#edr",
    targetRoles: ["admin", "analyst", "soc_manager", "investigator"],
  });
}

/** File quarantined by EDR agent */
export async function notifyEdrQuarantine(hostname: string, fileHash: string, organization: string) {
  await createNotification({
    type: "edr_quarantine",
    priority: "high",
    title: `🧫 File Quarantined: ${hostname}`,
    message: `Malicious file quarantined on ${hostname} (${organization}). Hash: ${fileHash.slice(0, 16)}… Review in EDR panel.`,
    link: "#edr",
    targetRoles: ["admin", "analyst", "soc_manager"],
  });
}

/** Social media threat signal detected */
export async function notifySocialThreat(platform: string, signalType: string, severity: string, author: string) {
  const isHigh = ["Critical", "High"].includes(severity);
  await createNotification({
    type: "social_threat",
    priority: isHigh ? "high" : "medium",
    title: `📣 Social Threat: ${platform.toUpperCase()} ${signalType}`,
    message: `${severity} severity ${signalType} detected on ${platform} by @${author}. Review in Social Media Monitor.`,
    link: "#social",
    targetRoles: ["admin", "analyst", "soc_manager", "gov_admin"],
  });
}

/** SIM swap cluster — 3+ active alerts at same time */
export async function notifySimSwapCluster(count: number, operator: string) {
  await createNotification({
    type: "sim_swap_cluster",
    priority: "critical",
    title: `📱 SIM SWAP CLUSTER: ${count} Active Alerts`,
    message: `${count} simultaneous SIM swap alerts detected on ${operator}. Likely coordinated mobile money attack. Contact telecom operator immediately.`,
    link: "#gsm",
    targetRoles: ["admin", "analyst", "soc_manager", "investigator", "gov_admin"],
  });

  // SMS critical responders
  if (atConfigured()) {
    try {
      const rows = await queryAll(
        `SELECT phone FROM users WHERE role IN ('analyst','soc_manager','gov_admin','admin') AND is_active = 1 AND phone IS NOT NULL`
      ) as { phone: string }[];
      const phones = rows.map((r: any) => r.phone).filter(Boolean);
      if (phones.length > 0) {
        smsAlertAnalysts(phones, "SIM-CLUSTER", `${count} SIM swap alerts on ${operator}`, "Critical").catch(console.error);
      }
    } catch (e) { console.error("[AT] SMS SIM swap cluster alert failed:", e); }
  }
}

/** New high-severity IOC ingested into threat intel */
export async function notifyNewIoc(type: string, value: string, severity: string, source: string) {
  if (!["Critical", "High"].includes(severity)) return; // only alert on serious IOCs
  await createNotification({
    type: "threat_intel_ioc",
    priority: severity === "Critical" ? "critical" : "high",
    title: `🚫 New ${severity} IOC: ${type.toUpperCase()}`,
    message: `${value} classified as ${severity} via ${source}. Added to threat intel database. Check for matches in active incidents.`,
    link: "#threat-intel",
    targetRoles: ["admin", "analyst", "soc_manager", "investigator"],
  });
}

/** Analyst added a KB entry — needs admin approval */
export async function notifyKbPendingApproval(entryTitle: string, author: string) {
  await createNotification({
    type: "kb_pending_approval",
    priority: "low",
    title: `🧠 AI KB Entry Awaiting Approval`,
    message: `"${entryTitle}" added by ${author} is pending review. Approve it in AI Learning Center to make it active.`,
    link: "#ailearn",
    targetRoles: ["admin", "super_admin", "gov_admin", "soc_manager"],
  });
}
