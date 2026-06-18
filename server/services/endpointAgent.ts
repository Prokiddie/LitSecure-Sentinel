/**
 * LitSecure Sentinel — Endpoint Agent Service (Phase 1)
 * Kaspersky-inspired agent management: registration, heartbeat,
 * suspicious activity ingestion, policy enforcement, and command dispatch.
 */
import { db, generateId } from "../db/index.js";
import { notifyEdrAlert, notifyEdrQuarantine } from "./notifications.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRegistration {
  agentId:      string;
  organization: string;
  sector:       string;
  hostname:     string;
  ipAddress:    string;
  os:           string;
  version:      string;
}

export interface SuspiciousActivity {
  agentId:    string;
  type:       "FILE_HASH" | "PROCESS" | "NETWORK" | "BEHAVIORAL";
  data:       Record<string, any>;
  confidence: number;
}

export interface PolicyAction {
  command: "QUARANTINE_FILE" | "KILL_PROCESS" | "BLOCK_DOMAIN" | "ISOLATE" | "ALERT";
  target:  string;
  reason:  string;
}

// ─── Scoring Helpers ──────────────────────────────────────────────────────────

const SUSPICIOUS_PROCESSES = new Set([
  "cmd.exe", "powershell.exe", "wscript.exe", "cscript.exe",
  "mshta.exe", "rundll32.exe", "regsvr32.exe", "certutil.exe",
  "psexec.exe", "mimikatz.exe", "msbuild.exe",
]);

const MALICIOUS_EXTENSIONS = new Set([
  ".lock", ".encrypt", ".crypt", ".ransom", ".encrypted",
  ".wcry", ".wncry", ".wncrypt",
]);

function calcRiskScore(activity: SuspiciousActivity): number {
  let score = 0;
  const d = activity.data;

  switch (activity.type) {
    case "FILE_HASH": {
      // Check if in local blocklist
      const row = db.prepare(
        "SELECT confidence FROM blocklist WHERE value = ? AND type = 'HASH'"
      ).get(d.hash) as any;
      if (row) score += row.confidence;
      // Check file extension
      if (d.fileExtension && MALICIOUS_EXTENSIONS.has(d.fileExtension.toLowerCase())) score += 30;
      break;
    }
    case "PROCESS": {
      if (d.processName && SUSPICIOUS_PROCESSES.has(d.processName.toLowerCase())) score += 40;
      if (d.parentProcess === "unknown" || !d.parentProcess) score += 15;
      break;
    }
    case "NETWORK": {
      const ipRow = db.prepare(
        "SELECT abuse_score FROM threat_intel WHERE value = ? AND type = 'IP'"
      ).get(d.destinationIP) as any;
      if (ipRow) score += Math.min(ipRow.abuse_score ?? 0, 40);
      const domRow = db.prepare(
        "SELECT confidence FROM blocklist WHERE value = ? AND type = 'DOMAIN'"
      ).get(d.domain) as any;
      if (domRow) score += domRow.confidence;
      break;
    }
    case "BEHAVIORAL": {
      if (d.encryptionSpeed && d.encryptionSpeed > 100) score += 30;  // ransomware
      if (d.fileCountModified && d.fileCountModified > 50) score += 20;
      if (d.beaconingFrequency && d.beaconingFrequency > 60) score += 20;
      if (d.privilegeEscalation) score += 25;
      break;
    }
  }

  if (d.isMalware) score += 30;
  if (d.isSuspicious) score += 15;
  return Math.min(score, 100);
}

// ─── Agent Management ─────────────────────────────────────────────────────────

export function registerAgent(reg: AgentRegistration): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO endpoint_agents
      (agent_id, organization, sector, hostname, ip_address, os, version, status, last_seen, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(reg.agentId, reg.organization, reg.sector, reg.hostname, reg.ipAddress, reg.os, reg.version, now, now);
}

export function heartbeat(agentId: string, metadata?: any): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(
    "UPDATE endpoint_agents SET last_seen = ?, status = 'ACTIVE' WHERE agent_id = ?"
  ).run(now, agentId);
  return (result.changes ?? 0) > 0;
}

export function getAgent(agentId: string): any {
  return db.prepare("SELECT * FROM endpoint_agents WHERE agent_id = ?").get(agentId);
}

export function getAllAgents(): any[] {
  return db.prepare("SELECT * FROM endpoint_agents ORDER BY last_seen DESC").all() as any[];
}

export function quarantineAgent(agentId: string): void {
  db.prepare("UPDATE endpoint_agents SET status = 'QUARANTINED' WHERE agent_id = ?").run(agentId);
}

// ─── Suspicious Activity Processing ──────────────────────────────────────────

export function reportSuspiciousActivity(activity: SuspiciousActivity): {
  id: string; riskScore: number; actions: PolicyAction[];
} {
  const riskScore = calcRiskScore(activity);
  const id = generateId("sa");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO suspicious_activities (id, agent_id, type, data, risk_score, confidence, status, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
  `).run(id, activity.agentId, activity.type, JSON.stringify(activity.data), riskScore, activity.confidence, now);

  const actions = evaluatePolicies(activity, riskScore);

  // Auto-quarantine on very high risk
  if (riskScore >= 85) {
    const agent = getAgent(activity.agentId);
    if (agent) quarantineAgent(activity.agentId);
  }

  // Fire notification for high-risk activities
  if (riskScore >= 70) {
    try {
      const agent = getAgent(activity.agentId);
      notifyEdrAlert(
        agent?.hostname || activity.agentId,
        activity.type,
        riskScore,
        agent?.organization || "Unknown"
      );
    } catch {}
  }

  return { id, riskScore, actions };
}

// ─── Policy Engine ────────────────────────────────────────────────────────────

function evaluatePolicies(activity: SuspiciousActivity, riskScore: number): PolicyAction[] {
  const actions: PolicyAction[] = [];
  const d = activity.data;

  // Ransomware / mass encryption
  if (activity.type === "BEHAVIORAL" && d.fileCountModified > 50 && d.encryptionSpeed > 50) {
    issueCommand(activity.agentId, "KILL_PROCESS", { pid: d.pid, processName: d.processName });
    actions.push({ command: "KILL_PROCESS", target: d.processName || "unknown", reason: "Ransomware behavior" });
  }

  // Known malicious file
  if (activity.type === "FILE_HASH" && riskScore >= 60) {
    issueCommand(activity.agentId, "QUARANTINE_FILE", { fileHash: d.hash, filePath: d.filePath });
    actions.push({ command: "QUARANTINE_FILE", target: d.hash, reason: "Known malicious hash" });
    logQuarantine(activity.agentId, d.hash, d.filePath || "");
  }

  // Phishing domain
  if (activity.type === "NETWORK" && d.domain) {
    const blocked = db.prepare(
      "SELECT 1 FROM blocklist WHERE value = ? AND type = 'DOMAIN'"
    ).get(d.domain);
    if (blocked) {
      issueCommand(activity.agentId, "BLOCK_DOMAIN", { domain: d.domain });
      actions.push({ command: "BLOCK_DOMAIN", target: d.domain, reason: "Blocked domain" });
    }
  }

  // High risk alert
  if (riskScore >= 70) {
    actions.push({ command: "ALERT", target: activity.agentId, reason: `Risk score ${riskScore}/100` });
  }

  return actions;
}

// ─── Command Dispatch ─────────────────────────────────────────────────────────

export function issueCommand(agentId: string, type: string, params: Record<string, any>): string {
  const id  = generateId("cmd");
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_commands (id, agent_id, command, status, issued_at)
    VALUES (?, ?, ?, 'PENDING', ?)
  `).run(id, agentId, JSON.stringify({ type, ...params }), now);
  return id;
}

export function getPendingCommands(agentId: string): any[] {
  return db.prepare(
    "SELECT * FROM agent_commands WHERE agent_id = ? AND status = 'PENDING' ORDER BY issued_at ASC"
  ).all(agentId) as any[];
}

export function markCommandExecuted(commandId: string): void {
  db.prepare(
    "UPDATE agent_commands SET status = 'EXECUTED', executed_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), commandId);
}

// ─── Quarantine Log ───────────────────────────────────────────────────────────

function logQuarantine(agentId: string, fileHash: string, filePath: string): void {
  const agent = getAgent(agentId);
  db.prepare(`
    INSERT OR IGNORE INTO quarantine_log (id, agent_id, file_hash, file_path, organization, status, quarantined_at)
    VALUES (?, ?, ?, ?, ?, 'QUARANTINED', ?)
  `).run(generateId("qar"), agentId, fileHash, filePath, agent?.organization || "Unknown", new Date().toISOString());

  // Notify SOC
  try {
    notifyEdrQuarantine(agent?.hostname || agentId, fileHash, agent?.organization || "Unknown");
  } catch {}
}

export function getQuarantineLog(limit = 50): any[] {
  return db.prepare(
    "SELECT * FROM quarantine_log ORDER BY quarantined_at DESC LIMIT ?"
  ).all(limit) as any[];
}

// ─── Blocklist ────────────────────────────────────────────────────────────────

export function addToBlocklist(
  type: string, value: string, category: string, source = "manual", confidence = 80
): void {
  db.prepare(`
    INSERT OR REPLACE INTO blocklist (id, type, value, category, source, confidence, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(generateId("bl"), type, value, category, source, confidence, new Date().toISOString());
}

export function getBlocklist(): any[] {
  return db.prepare("SELECT * FROM blocklist ORDER BY added_at DESC").all() as any[];
}

// ─── Activity Monitoring ──────────────────────────────────────────────────────

export function markInactiveAgents(): void {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min
  db.prepare(
    "UPDATE endpoint_agents SET status = 'INACTIVE' WHERE last_seen < ? AND status = 'ACTIVE'"
  ).run(cutoff);
}

export function getAgentStats(): Record<string, number> {
  const all = getAllAgents();
  return {
    total:      all.length,
    active:     all.filter(a => a.status === "ACTIVE").length,
    inactive:   all.filter(a => a.status === "INACTIVE").length,
    quarantined:all.filter(a => a.status === "QUARANTINED").length,
  };
}

export function getSuspiciousActivities(limit = 100): any[] {
  return db.prepare(
    "SELECT sa.*, ea.organization, ea.sector FROM suspicious_activities sa LEFT JOIN endpoint_agents ea ON sa.agent_id = ea.agent_id ORDER BY sa.detected_at DESC LIMIT ?"
  ).all(limit) as any[];
}
