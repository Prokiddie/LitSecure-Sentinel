/**
 * LitSecure Sentinel — AI Full System Context Builder (v2)
 *
 * Gives the AI agent COMPLETE situational awareness of the entire platform:
 *
 *  STATIC KNOWLEDGE  — System architecture, modules, capabilities, API surface
 *  LIVE OPERATIONAL  — All 15+ database tables read at query time (RAG)
 *  PREDICTIVE ENGINE — Temporal pattern analysis for threat forecasting
 *
 * This makes the AI aware of:
 *   • Every incident ever reported (with IOCs, status, sector)
 *   • All endpoint agents, their health, suspicious activities, quarantine
 *   • Active social media threats and monitored keywords
 *   • Security rules deployed (YARA, Sigma, Snort)
 *   • Critical national assets and their risk scores
 *   • Threat intel IOCs, watchlist, blocklist
 *   • Telecom alerts (SIM swap, fraud)
 *   • System stats, trend velocity, and anomaly signals
 *   • Predicted future threats based on observed patterns
 */

import { db } from "../db/index.js";

// ─── System Architecture Knowledge (Static — describes the entire codebase) ──
// This gives the AI knowledge of what the system CAN do, not just what it has.

export const SYSTEM_ARCHITECTURE = `
════════════════════════════════════════════════════════════════
LITSECURE SENTINEL — SYSTEM ARCHITECTURE & CAPABILITIES
Malawi National Cyber Incident Management Platform v1.4
Operated by: MACERT (Malawi Computer Emergency Response Team) under MACRA
════════════════════════════════════════════════════════════════

TECHNOLOGY STACK:
  Backend:  Node.js + Express (TypeScript), SQLite (better-sqlite3), JWT auth
  Frontend: React + Vite + TypeScript, Tailwind CSS
  AI Layer: Google Gemini 2.0/2.5, Ollama (local), 4-stage hybrid pipeline
  Realtime: WebSocket (War Room), Server-Sent Events (notifications)
  External: AbuseIPDB, AlienVault OTX, MalwareBazaar threat feeds

MODULES & CAPABILITIES:
  1. INCIDENT PORTAL — Public + authenticated incident submission, AI triage,
     IOC extraction, MITRE ATT&CK mapping, email alerts for Critical/High
  2. THREAT TERMINAL — Analyst console: filter, assign, update, bulk-ops
  3. CYBER TERMINAL — Live command-line style interface for power users
  4. SITUATION ROOM — EOC War Room, national threat level, district map,
     sector health dashboard, live threat feed, MACERT coordination chat
  5. NATIONAL RISK MAP — SVG Malawi map with district-level risk overlays,
     OpenStreetMap embeds, GPS coordinates, district telemetry
  6. CAMPAIGN CORRELATION — Groups related incidents into attack campaigns,
     identifies coordinated threat actors across multiple organizations
  7. SECTOR RISK SCORING — Real-time risk scores for 6 sectors:
     Government, Banking, Telecom, Utilities, Healthcare, Education
  8. EDR ENDPOINT PROTECTION — Registered endpoint agents (Windows/Linux/Mac),
     suspicious activity detection, file hash quarantine, agent commands
  9. RULES ORCHESTRATOR — Deploy YARA, Sigma, Snort detection rules to nodes
  10. CCTV SURVEILLANCE — IP camera monitoring, AI detection flags, recording
  11. INFRASTRUCTURE LOGS — Simulated SIEM logs, anomaly detection
  12. THREAT INTELLIGENCE — IOC database (IP, domain, hash, phone, email),
      AbuseIPDB enrichment, VirusTotal integration, geolocation
  13. NATIONAL ANALYTICS — Charts: category trends, severity distribution,
      org breakdown, monthly incident velocity
  14. PATTERN INTELLIGENCE — AI-powered threat pattern analysis via Gemini,
      cross-incident correlation, attack campaign profiling
  15. REPORTS & RECOMMENDATIONS — Auto-generated PDF-style threat reports
  16. EVIDENCE VAULT — Digital forensic evidence with chain-of-custody,
      SHA256 hashing, file type classification
  17. INTEGRATIONS — External API config (Airtel, TNM, MACRA, Reserve Bank)
  18. AWARENESS HUB — Cyber awareness content library for public education
  19. DATABASE CONSOLE — Raw SQL query interface (admin only)
  20. USER MANAGEMENT — Role-based access control (9 roles)
  21. SOCIAL MEDIA MONITOR — Keyword scanning on Twitter/Facebook/TikTok/
      Instagram/YouTube, AI severity classification, takedown escalation
  22. CYBER INTEL HUB — Deep-dive intelligence: threat actor profiling,
      IOC enrichment, attack surface mapping
  23. NETWORK INTELLIGENCE — Network topology, port scans, traffic analysis
  24. GLOBAL CYBER MAP — Real-time global attack visualization
  25. POLICY ENGINE — Automated policy deployment to endpoints/firewalls
  26. TAKEDOWN TRACKER — Domain/content takedown requests and status tracking
  27. REPUTATION CHECKER — IP/domain/phone reputation scoring
  28. AWARENESS TRAINING — Structured cybersecurity training modules with quizzes
  29. STIX/TAXII EXPORT — Threat intelligence sharing in standard formats
  30. INCIDENT MANAGER — Full CRUD: view, edit, assign, delete, audit trail

USER ROLES (9 levels, least → most privileged):
  citizen → org_user → org_admin → auditor → analyst →
  investigator → soc_manager → gov_admin → admin → super_admin

AI PIPELINE (4-stage hybrid):
  Stage 1: Offline Rule Engine  (instant, keyword/regex, no API)
  Stage 2: Pattern Engine       (heuristics, IOC extraction, MITRE hints)
  Stage 3: Gemini Enrichment    (cloud AI, only if baseline risk ≥ 35/100)
  Stage 4: Decision Fusion      (blends offline + Gemini into final output)
  Fallback: Ollama local LLM → Gemini cloud → Built-in KB (offline)

KEY API ROUTES:
  POST   /api/incidents           — Submit new incident (public + auth)
  GET    /api/incidents           — List all (paginated, searchable)
  PATCH  /api/incidents/:id       — Update fields (analyst+)
  DELETE /api/incidents/:id       — Delete (soc_manager+)
  POST   /api/incidents/:id/status — Change status + add note
  GET    /api/incidents/meta/stats — Aggregate statistics
  POST   /api/ai/chat             — SOC AI chat (streaming)
  POST   /api/ai/analyze          — Incident classification pipeline
  POST   /api/ai/scan-threats     — Pattern analysis across incidents
  GET    /api/threat-intel        — IOC database query
  GET    /api/watchlist           — Active watchlist
  GET    /api/blocklist           — Active blocklist
  GET    /api/telecom-alerts      — SIM swap / fraud alerts
  GET    /api/edr/agents          — Endpoint agents status
  GET    /api/edr/suspicious      — Suspicious activities
  GET    /api/social/signals      — Social media threat signals
  POST   /api/ai/enrich-ioc       — IOC enrichment
  GET    /api/risk-scores         — Sector risk scores
  GET    /api/security-rules      — Deployed detection rules
  GET    /api/critical-assets     — Protected national infrastructure
  WS     /ws/war-room             — WebSocket live incident stream

MALAWI-SPECIFIC CONTEXT:
  Mobile Money: Airtel Money (*211#), TNM Mpamba (*444#)
  Banks: Standard Bank MW, National Bank, FDH Bank, NBS Bank, RBM
  Telecoms: Airtel Malawi, TNM, Globe Internet, Skyband, MTL Broadband
  Gov Systems: MRA Tax Portal, MACRA, eGovernment portal, RBM RTGS
  Phone format: +265 or 0, followed by 88x, 99x, 111
  Regions: Northern (8 districts), Central (9 districts), Southern (11 districts)
  Top threats: SIM Swap, Mobile Money Fraud, Phishing (MRA/bank),
               Ransomware, BEC (Business Email Compromise), Social Engineering
════════════════════════════════════════════════════════════════
`;

// ─── Context Options ───────────────────────────────────────────────────────────

export interface ContextOptions {
  incidents?:      boolean;  // recent incidents (default: true)
  threatIntel?:    boolean;  // IOC database (default: true)
  telecomAlerts?:  boolean;  // SIM swap / fraud alerts (default: true)
  watchlist?:      boolean;  // watchlist entries (default: true)
  blocklist?:      boolean;  // blocklist entries (default: true)
  endpoints?:      boolean;  // EDR agents + suspicious activity (default: true)
  socialSignals?:  boolean;  // social media threats (default: true)
  securityRules?:  boolean;  // deployed detection rules (default: true)
  criticalAssets?: boolean;  // protected national assets (default: true)
  logs?:           boolean;  // simulated SIEM logs (default: false)
  predictions?:    boolean;  // AI-generated threat predictions (default: true)
  systemArch?:     boolean;  // full system architecture (default: true in PERSONA)
  maxIncidents?:   number;   // max incidents (default: 20)
  maxIocs?:        number;   // max IOCs per type (default: 12)
}

// ─── Readers ──────────────────────────────────────────────────────────────────

function safe(fn: () => string): string {
  try { return fn(); } catch { return ""; }
}

function q(sql: string, ...params: any[]): any {
  try { return db.prepare(sql).get(...params); } catch { return null; }
}

function qa(sql: string, ...params: any[]): any[] {
  try { return db.prepare(sql).all(...params) as any[]; } catch { return []; }
}

// ── Platform stats ─────────────────────────────────────────────────────────────

function getStatsSnapshot(): string {
  return safe(() => {
    const total     = (q("SELECT COUNT(*) as c FROM incidents") as any)?.c ?? 0;
    const open      = (q("SELECT COUNT(*) as c FROM incidents WHERE status NOT IN ('Resolved','Closed','Contained')") as any)?.c ?? 0;
    const critical  = (q("SELECT COUNT(*) as c FROM incidents WHERE severity = 'Critical' AND status NOT IN ('Resolved','Closed')") as any)?.c ?? 0;
    const high      = (q("SELECT COUNT(*) as c FROM incidents WHERE severity = 'High' AND status NOT IN ('Resolved','Closed')") as any)?.c ?? 0;
    const telecom   = (q("SELECT COUNT(*) as c FROM telecom_alerts WHERE status = 'Active')") as any)?.c ?? 0;
    const iocs      = (q("SELECT COUNT(*) as c FROM threat_intel") as any)?.c ?? 0;
    const watchlist = (q("SELECT COUNT(*) as c FROM watchlist") as any)?.c ?? 0;
    const blocklist = (q("SELECT COUNT(*) as c FROM blocklist") as any)?.c ?? 0;
    const agents    = (q("SELECT COUNT(*) as c FROM endpoint_agents WHERE status = 'ACTIVE'") as any)?.c ?? 0;
    const quarantine= (q("SELECT COUNT(*) as c FROM quarantine_log") as any)?.c ?? 0;
    const suspicious= (q("SELECT COUNT(*) as c FROM suspicious_activities WHERE status = 'OPEN'") as any)?.c ?? 0;
    const social    = (q("SELECT COUNT(*) as c FROM social_signals WHERE status IN ('New','Reviewing','Escalated')") as any)?.c ?? 0;
    const rules     = (q("SELECT COUNT(*) as c FROM security_rules WHERE status = 'Active'") as any)?.c ?? 0;
    const assets    = (q("SELECT COUNT(*) as c FROM critical_assets") as any)?.c ?? 0;

    const cats = qa(
      `SELECT category, COUNT(*) as n FROM incidents
       WHERE status NOT IN ('Resolved','Closed')
       GROUP BY category ORDER BY n DESC LIMIT 6`
    );
    const catStr = cats.map((c: any) => `${c.category}(${c.n})`).join(", ");

    // 7-day incident velocity
    const last7  = (q("SELECT COUNT(*) as c FROM incidents WHERE created_at >= datetime('now','-7 days')") as any)?.c ?? 0;
    const prev7  = (q("SELECT COUNT(*) as c FROM incidents WHERE created_at >= datetime('now','-14 days') AND created_at < datetime('now','-7 days')") as any)?.c ?? 0;
    const trend  = prev7 > 0 ? ((last7 - prev7) / prev7 * 100).toFixed(0) : "N/A";
    const trendStr = prev7 > 0 ? ` | 7-day velocity: ${last7} incidents (${Number(trend) > 0 ? "+" : ""}${trend}% vs prior week)` : "";

    return [
      `=== PLATFORM LIVE STATISTICS [${new Date().toISOString()}] ===`,
      `Incidents: ${total} total | ${open} open | ${critical} critical | ${high} high${trendStr}`,
      `Endpoints: ${agents} active agents | ${suspicious} open suspicious activities | ${quarantine} quarantined files`,
      `Threat Intel: ${iocs} IOCs | ${watchlist} watchlist | ${blocklist} blocklist entries`,
      `Active: ${telecom} telecom alerts | ${social} social signals | ${rules} security rules | ${assets} critical assets`,
      catStr ? `Top active threat categories: ${catStr}` : "",
    ].filter(Boolean).join("\n");
  });
}

// ── Incidents ─────────────────────────────────────────────────────────────────

function getRecentIncidents(limit = 20): string {
  return safe(() => {
    const rows = qa(
      `SELECT title, category, severity, status, reporter_org, sector,
              incident_date, analysis_summary, compromised_indicators,
              mitigation_advice, assigned_investigator, priority_level, estimated_loss
       FROM incidents ORDER BY incident_date DESC LIMIT ?`,
      limit
    );
    if (!rows.length) return "";

    const lines = rows.map((r: any) => {
      const ci = (() => { try { return JSON.parse(r.compromised_indicators || "{}"); } catch { return {}; } })();
      const iocParts: string[] = [];
      if (ci.phoneNumbers?.length) iocParts.push(`phones: ${ci.phoneNumbers.slice(0, 3).join(", ")}`);
      if (ci.ips?.length)          iocParts.push(`IPs: ${ci.ips.slice(0, 3).join(", ")}`);
      if (ci.domains?.length)      iocParts.push(`domains: ${ci.domains.slice(0, 3).join(", ")}`);
      const iocStr  = iocParts.length ? ` | IOCs: ${iocParts.join("; ")}` : "";
      const summary = r.analysis_summary ? ` | AI: ${String(r.analysis_summary).slice(0, 80)}` : "";
      const loss    = r.estimated_loss > 0 ? ` | loss: MWK${r.estimated_loss.toLocaleString()}` : "";
      const inv     = r.assigned_investigator ? ` | inv: ${r.assigned_investigator}` : "";
      return `• [${r.severity}/${r.priority_level || "LOW"}] ${r.category.toUpperCase()} | ${r.status} | ${r.reporter_org}${r.sector ? ` (${r.sector})` : ""} | "${r.title}"${iocStr}${summary}${loss}${inv}`;
    });

    return `=== INCIDENT DATABASE (${rows.length} most recent) ===\n${lines.join("\n")}`;
  });
}

// ── Threat Intel IOCs ────────────────────────────────────────────────────────

function getActiveThreatIntel(maxPerType = 12): string {
  return safe(() => {
    const rows = qa(
      `SELECT type, value, origin, severity, description, confidence,
              geo_country, geo_isp, abuse_score, source, first_seen, last_seen
       FROM threat_intel ORDER BY date DESC LIMIT ?`,
      maxPerType * 6
    );
    if (!rows.length) return "";

    const groups: Record<string, string[]> = {};
    for (const r of rows) {
      const t = (r.type?.toUpperCase() || "OTHER");
      if (!groups[t]) groups[t] = [];
      if (groups[t].length >= maxPerType) continue;
      const geo   = r.geo_country ? ` [${r.geo_country}${r.geo_isp ? `/${r.geo_isp}` : ""}]` : "";
      const abuse = r.abuse_score > 0 ? ` abuse:${r.abuse_score}%` : "";
      const conf  = r.confidence ? ` conf:${r.confidence}%` : "";
      const desc  = r.description ? ` — ${String(r.description).slice(0, 80)}` : "";
      groups[t].push(`  • [${r.severity}] ${r.value}${geo}${abuse}${conf} via ${r.source || r.origin}${desc}`);
    }

    const sections = Object.entries(groups)
      .map(([type, items]) => `  ${type}:\n${items.join("\n")}`)
      .join("\n");

    return `=== THREAT INTELLIGENCE IOC DATABASE ===\n${sections}`;
  });
}

// ── Telecom Alerts ────────────────────────────────────────────────────────────

function getRecentTelecomAlerts(limit = 10): string {
  return safe(() => {
    const rows = qa(
      `SELECT type, source, phone_number, details, status, timestamp
       FROM telecom_alerts WHERE status = 'Active'
       ORDER BY timestamp DESC LIMIT ?`,
      limit
    );
    if (!rows.length) return "";
    const lines = rows.map((r: any) =>
      `• [${r.source}] ${r.type} | ${r.phone_number} | ${String(r.details).slice(0, 120)}`
    );
    return `=== ACTIVE TELECOM ALERTS (SIM Swap / Mobile Money Fraud) ===\n${lines.join("\n")}`;
  });
}

// ── Watchlist ────────────────────────────────────────────────────────────────

function getWatchlist(): string {
  return safe(() => {
    const rows = qa("SELECT type, value, risk_level, reason FROM watchlist ORDER BY created_at DESC LIMIT 25");
    if (!rows.length) return "";
    const lines = rows.map((r: any) => `• [${r.risk_level}] ${r.type.toUpperCase()} ${r.value} — ${r.reason}`);
    return `=== ACTIVE WATCHLIST (${rows.length} entries) ===\n${lines.join("\n")}`;
  });
}

// ── Blocklist ────────────────────────────────────────────────────────────────

function getBlocklist(): string {
  return safe(() => {
    const rows = qa("SELECT type, value, category, source, confidence FROM blocklist ORDER BY added_at DESC LIMIT 20");
    if (!rows.length) return "";
    const lines = rows.map((r: any) => `• [${r.type}] ${r.value} | ${r.category} | conf:${r.confidence}% | ${r.source}`);
    return `=== ACTIVE BLOCKLIST (${rows.length} shown) ===\n${lines.join("\n")}`;
  });
}

// ── Endpoint Agents + Suspicious Activities ────────────────────────────────

function getEndpointStatus(): string {
  return safe(() => {
    const agents = qa(
      `SELECT agent_id, organization, sector, hostname, ip_address, os, status, last_seen
       FROM endpoint_agents ORDER BY last_seen DESC LIMIT 20`
    );
    const suspicious = qa(
      `SELECT a.hostname, sa.type, sa.risk_score, sa.confidence, sa.status, sa.detected_at,
              SUBSTR(sa.data, 1, 100) as data_preview
       FROM suspicious_activities sa
       LEFT JOIN endpoint_agents a ON sa.agent_id = a.agent_id
       WHERE sa.status = 'OPEN'
       ORDER BY sa.risk_score DESC LIMIT 15`
    );
    const quarantine = qa(
      `SELECT q.file_hash, q.file_path, q.organization, q.status, q.quarantined_at,
              a.hostname
       FROM quarantine_log q
       LEFT JOIN endpoint_agents a ON q.agent_id = a.agent_id
       ORDER BY q.quarantined_at DESC LIMIT 10`
    );

    const parts: string[] = [];

    if (agents.length) {
      const lines = agents.map((a: any) =>
        `  • [${a.status}] ${a.hostname} (${a.os}) | ${a.organization}/${a.sector} | IP:${a.ip_address} | last:${a.last_seen?.slice(0, 16)}`
      );
      const offline = agents.filter((a: any) => a.status === "INACTIVE" || a.status === "QUARANTINED").length;
      parts.push(`=== EDR ENDPOINT AGENTS (${agents.length} shown, ${offline} offline/quarantined) ===\n${lines.join("\n")}`);
    }

    if (suspicious.length) {
      const lines = suspicious.map((s: any) =>
        `  • [risk:${s.risk_score}] ${s.type} on ${s.hostname || "unknown"} | conf:${(s.confidence * 100).toFixed(0)}% | ${s.data_preview}`
      );
      parts.push(`=== OPEN SUSPICIOUS ACTIVITIES (${suspicious.length}) ===\n${lines.join("\n")}`);
    }

    if (quarantine.length) {
      const lines = quarantine.map((q: any) =>
        `  • ${q.file_hash} | ${q.file_path || "unknown path"} | ${q.organization} | ${q.hostname || "?"} | ${q.status}`
      );
      parts.push(`=== QUARANTINE LOG (${quarantine.length}) ===\n${lines.join("\n")}`);
    }

    return parts.join("\n\n");
  });
}

// ── Social Media Signals ────────────────────────────────────────────────────

function getSocialSignals(): string {
  return safe(() => {
    const rows = qa(
      `SELECT platform, signal_type, author_handle, content_preview, ai_severity,
              ai_summary, status, detected_at, victim_handle
       FROM social_signals
       WHERE status IN ('New','Reviewing','Escalated')
       ORDER BY detected_at DESC LIMIT 15`
    );
    if (!rows.length) return "";
    const lines = rows.map((r: any) =>
      `• [${r.ai_severity}] ${r.platform.toUpperCase()} ${r.signal_type} | @${r.author_handle} | ${String(r.content_preview).slice(0, 80)} | AI: ${r.ai_summary?.slice(0, 60)}`
    );
    return `=== ACTIVE SOCIAL MEDIA THREATS (${rows.length}) ===\n${lines.join("\n")}`;
  });
}

// ── Security Rules ──────────────────────────────────────────────────────────

function getSecurityRules(): string {
  return safe(() => {
    const rows = qa(
      `SELECT title, language, status, nodes_deployed, created_at
       FROM security_rules WHERE status = 'Active' ORDER BY created_at DESC LIMIT 15`
    );
    if (!rows.length) return "";
    const lines = rows.map((r: any) =>
      `• [${r.language}] ${r.title} | deployed to ${r.nodes_deployed} nodes`
    );
    return `=== ACTIVE DETECTION RULES (${rows.length}) ===\n${lines.join("\n")}`;
  });
}

// ── Critical Assets ─────────────────────────────────────────────────────────

function getCriticalAssets(): string {
  return safe(() => {
    const rows = qa(
      `SELECT name, sector, owner, location, risk_score, criticality, status
       FROM critical_assets ORDER BY risk_score DESC LIMIT 20`
    );
    if (!rows.length) return "";
    const lines = rows.map((r: any) =>
      `• [${r.criticality}/risk:${r.risk_score}] ${r.name} | ${r.sector} | ${r.owner} | ${r.location} | ${r.status}`
    );
    return `=== CRITICAL NATIONAL ASSETS (${rows.length}) ===\n${lines.join("\n")}`;
  });
}

// ── SIEM Logs ───────────────────────────────────────────────────────────────

function getRecentLogs(limit = 15): string {
  return safe(() => {
    const rows = qa(
      `SELECT timestamp, source, event, severity, indicator
       FROM simulated_logs ORDER BY timestamp DESC LIMIT ?`,
      limit
    );
    if (!rows.length) return "";
    const lines = rows.map((r: any) =>
      `• [${r.severity}] ${r.source} — ${r.event}${r.indicator ? ` (${r.indicator})` : ""}`
    );
    return `=== RECENT SIEM LOGS (${rows.length}) ===\n${lines.join("\n")}`;
  });
}

// ── Predictive Intelligence Engine ─────────────────────────────────────────
// Analyzes temporal patterns in the DB to generate threat predictions.
// This runs fully offline — no API call needed.

function getPredictions(): string {
  return safe(() => {
    const predictions: string[] = [];

    // 1. Incident velocity trend
    const last7  = (q("SELECT COUNT(*) as c FROM incidents WHERE created_at >= datetime('now','-7 days')") as any)?.c ?? 0;
    const prev7  = (q("SELECT COUNT(*) as c FROM incidents WHERE created_at >= datetime('now','-14 days') AND created_at < datetime('now','-7 days')") as any)?.c ?? 0;
    if (prev7 > 0 && last7 > prev7 * 1.3) {
      const pct = ((last7 - prev7) / prev7 * 100).toFixed(0);
      predictions.push(`⚠ RISING THREAT VELOCITY: Incident rate up ${pct}% this week vs last. Escalation likely if trend continues.`);
    }

    // 2. Category surge detection
    const catVelocity = qa(
      `SELECT category, COUNT(*) as n FROM incidents
       WHERE created_at >= datetime('now','-7 days')
       GROUP BY category ORDER BY n DESC LIMIT 3`
    );
    for (const cat of catVelocity) {
      if (cat.n >= 3) {
        predictions.push(`📈 SURGE: ${cat.category} incidents × ${cat.n} in last 7 days — possible coordinated campaign.`);
      }
    }

    // 3. Unresolved critical incidents (escalation risk)
    const staleCritical = qa(
      `SELECT title, created_at FROM incidents
       WHERE severity = 'Critical' AND status NOT IN ('Resolved','Closed','Contained')
       AND created_at <= datetime('now','-2 days')
       ORDER BY created_at ASC LIMIT 5`
    );
    if (staleCritical.length > 0) {
      predictions.push(`🔴 ESCALATION RISK: ${staleCritical.length} Critical incident(s) unresolved for 2+ days — risk of lateral spread or data exfiltration.`);
      for (const i of staleCritical) {
        predictions.push(`   → "${i.title}" (open since ${i.created_at?.slice(0, 10)})`);
      }
    }

    // 4. SIM swap cluster detection
    const simSwaps = (q("SELECT COUNT(*) as c FROM telecom_alerts WHERE type LIKE '%SIM%' AND status='Active'") as any)?.c ?? 0;
    if (simSwaps >= 3) {
      predictions.push(`📱 SIM SWAP CLUSTER: ${simSwaps} active SIM swap alerts — likely coordinated attack on mobile money. Recommend telecom lockdown advisory.`);
    }

    // 5. High-risk endpoint agents
    const highRiskAgents = (q("SELECT COUNT(*) as c FROM suspicious_activities WHERE risk_score >= 80 AND status = 'OPEN'") as any)?.c ?? 0;
    if (highRiskAgents > 0) {
      predictions.push(`💻 ENDPOINT THREAT: ${highRiskAgents} endpoint(s) with risk score ≥ 80 — recommend immediate isolation and forensic imaging.`);
    }

    // 6. Quarantine spike
    const recentQuarantine = (q("SELECT COUNT(*) as c FROM quarantine_log WHERE quarantined_at >= datetime('now','-24 hours')") as any)?.c ?? 0;
    if (recentQuarantine >= 3) {
      predictions.push(`🦠 MALWARE SPIKE: ${recentQuarantine} files quarantined in last 24 hours — possible ransomware spread across organization.`);
    }

    // 7. Social media escalation
    const escalatedSocial = (q("SELECT COUNT(*) as c FROM social_signals WHERE status = 'Escalated'") as any)?.c ?? 0;
    if (escalatedSocial >= 2) {
      predictions.push(`📣 SOCIAL ESCALATION: ${escalatedSocial} social media threats escalated — reputational or public panic risk in the next 24–48h.`);
    }

    // 8. Sector concentration analysis
    const sectorConcentration = qa(
      `SELECT sector, COUNT(*) as n FROM incidents
       WHERE sector != '' AND status NOT IN ('Resolved','Closed')
       GROUP BY sector ORDER BY n DESC LIMIT 1`
    );
    if (sectorConcentration.length > 0 && sectorConcentration[0].n >= 5) {
      const sec = sectorConcentration[0];
      predictions.push(`🎯 SECTOR TARGETING: ${sec.sector} sector has ${sec.n} open incidents — appears to be primary target. Recommend sector-wide advisory.`);
    }

    // 9. IOC abuse score alert
    const highAbuseIocs = (q("SELECT COUNT(*) as c FROM threat_intel WHERE abuse_score >= 90") as any)?.c ?? 0;
    if (highAbuseIocs > 0) {
      predictions.push(`🚨 CRITICAL IOCs: ${highAbuseIocs} IOC(s) with abuse score ≥ 90% active in database — actively malicious infrastructure detected.`);
    }

    // 10. No recent incidents (calm before storm warning)
    if (last7 === 0 && prev7 > 0) {
      predictions.push(`⚠ ANOMALOUS QUIET: Zero incidents reported this week after ${prev7} last week. Possible reporting gap or adversary dormancy period before planned attack.`);
    }

    if (!predictions.length) {
      predictions.push("✅ No significant threat escalation patterns detected. System operating within normal parameters.");
    }

    return `=== PREDICTIVE THREAT INTELLIGENCE (Auto-generated from pattern analysis) ===\n${predictions.join("\n")}`;
  });
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Build the complete FULL SYSTEM INTELLIGENCE CONTEXT block.
 * Injected into every AI prompt — gives the agent total situational awareness.
 */
export function buildLocalContext(opts: ContextOptions = {}): string {
  const {
    incidents      = true,
    threatIntel    = true,
    telecomAlerts  = true,
    watchlist      = true,
    blocklist      = true,
    endpoints      = true,
    socialSignals  = true,
    securityRules  = true,
    criticalAssets = true,
    logs           = false,
    predictions    = true,
    maxIncidents   = 20,
    maxIocs        = 12,
  } = opts;

  const sections: string[] = [];

  sections.push(getStatsSnapshot());
  if (predictions)    sections.push(getPredictions());
  if (incidents)      sections.push(getRecentIncidents(maxIncidents));
  if (threatIntel)    sections.push(getActiveThreatIntel(maxIocs));
  if (telecomAlerts)  sections.push(getRecentTelecomAlerts());
  if (watchlist)      sections.push(getWatchlist());
  if (blocklist)      sections.push(getBlocklist());
  if (endpoints)      sections.push(getEndpointStatus());
  if (socialSignals)  sections.push(getSocialSignals());
  if (securityRules)  sections.push(getSecurityRules());
  if (criticalAssets) sections.push(getCriticalAssets());
  if (logs)           sections.push(getRecentLogs());

  const body = sections.filter(Boolean).join("\n\n");
  if (!body.trim()) return "";

  return [
    "╔══════════════════════════════════════════════════════════════════╗",
    "║     FULL SYSTEM INTELLIGENCE CONTEXT — LitSecure Sentinel        ║",
    `║     Retrieved: ${new Date().toISOString()}          ║`,
    "║     Use ALL sections below to answer questions about the system,  ║",
    "║     predict threats, and provide operational recommendations.     ║",
    "╚══════════════════════════════════════════════════════════════════╝",
    body,
    "╔══════════════════════════════════════════════════════════════════╗",
    "║                     END SYSTEM CONTEXT                           ║",
    "╚══════════════════════════════════════════════════════════════════╝",
  ].join("\n");
}
