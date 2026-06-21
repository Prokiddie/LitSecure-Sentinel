/**
 * LitSecure Sentinel — Threat Feed Integration (Phase 1)
 * Multi-source IOC ingestion: AbuseIPDB, VirusTotal, AlienVault OTX,
 * MalwareBazaar, Kaspersky OpenTIP (free tier).
 * Runs on a configurable schedule and persists all indicators to SQLite.
 */
import { db, generateId } from "../db/index.js";
import { addToBlocklist } from "./endpointAgent.js";
import { notifyNewIoc } from "./notifications.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IOCType = "IP" | "DOMAIN" | "URL" | "HASH" | "EMAIL";

export interface ThreatIndicator {
  type:        IOCType;
  value:       string;
  source:      string;
  confidence:  number;  // 0–100
  category:    string;
  description: string;
  metadata:    Record<string, any>;
}

interface FeedConfig {
  name:      string;
  enabled:   boolean;
  intervalMs:number;
  lastRunAt: number;
}

// ─── Feed Configs ─────────────────────────────────────────────────────────────

const FEEDS: Record<string, FeedConfig> = {
  abuseipdb:   { name: "AbuseIPDB",          enabled: true,  intervalMs: 30 * 60_000, lastRunAt: 0 },
  virustotal:  { name: "VirusTotal",          enabled: false, intervalMs: 60 * 60_000, lastRunAt: 0 },
  alienvault:  { name: "AlienVault OTX",      enabled: false, intervalMs: 60 * 60_000, lastRunAt: 0 },
  malwarebazaar:{ name:"MalwareBazaar",       enabled: true,  intervalMs: 90 * 60_000, lastRunAt: 0 },
  kasperskyotp:{ name: "Kaspersky OpenTIP",   enabled: true,  intervalMs:120 * 60_000, lastRunAt: 0 },
};

let schedulerRunning = false;

// ─── Indicator type detection ─────────────────────────────────────────────────

export function detectIOCType(value: string): IOCType {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value))              return "IP";
  if (/^https?:\/\//.test(value))                           return "URL";
  if (/^[a-fA-F0-9]{32}$/.test(value))                     return "HASH"; // MD5
  if (/^[a-fA-F0-9]{40}$/.test(value))                     return "HASH"; // SHA1
  if (/^[a-fA-F0-9]{64}$/.test(value))                     return "HASH"; // SHA256
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))           return "EMAIL";
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+$/.test(value))    return "DOMAIN";
  return "URL";
}

// ─── Persist indicator ────────────────────────────────────────────────────────

function persistIndicator(ind: ThreatIndicator): void {
  const now = new Date().toISOString();
  // Try to update existing, else insert
  const existing = db.prepare(
    "SELECT id, confidence FROM threat_intel WHERE value = ? AND type = ?"
  ).get(ind.value, ind.type) as any;

  if (existing) {
    // Only update if new source has higher confidence
    if (ind.confidence > (existing.confidence ?? 0)) {
      db.prepare(`
        UPDATE threat_intel
        SET source=?, confidence=?, description=?, metadata=?, last_seen=?
        WHERE value=? AND type=?
      `).run(ind.source, ind.confidence, ind.description, JSON.stringify(ind.metadata), now, ind.value, ind.type);
    }
  } else {
    const severity = ind.confidence >= 80 ? "Critical" : ind.confidence >= 60 ? "High" : ind.confidence >= 40 ? "Medium" : "Low";
    db.prepare(`
      INSERT INTO threat_intel (id, type, value, origin, severity, date, source, confidence, description, metadata, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId("ti"),
      ind.type,
      ind.value,
      ind.source,
      severity,
      now,
      ind.source,
      ind.confidence,
      ind.description,
      JSON.stringify(ind.metadata),
      now,
      now,
    );
    // Notify analysts about high/critical new IOCs
    if (ind.confidence >= 60) {
      try { notifyNewIoc(ind.type, ind.value, severity, ind.source); } catch {}
    }
  }

  // Auto-blocklist high confidence indicators
  if (ind.confidence >= 80) {
    addToBlocklist(ind.type, ind.value, ind.category, ind.source, ind.confidence);
  }
}

// ─── AbuseIPDB ───────────────────────────────────────────────────────────────

async function fetchAbuseIPDB(): Promise<void> {
  const key = process.env.ABUSEIPDB_API_KEY;
  if (!key) return;

  try {
    const res = await fetch(
      "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=70&limit=200",
      { headers: { Key: key, Accept: "application/json" } }
    );
    if (!res.ok) return;
    const json = await res.json() as any;

    for (const item of (json.data ?? [])) {
      persistIndicator({
        type:        "IP",
        value:       item.ipAddress,
        source:      "AbuseIPDB",
        confidence:  item.abuseConfidenceScore ?? 70,
        category:    "ABUSE",
        description: `Reported ${item.totalReports ?? 0} times. Country: ${item.countryCode ?? "Unknown"}`,
        metadata:    { totalReports: item.totalReports, countryCode: item.countryCode },
      });
    }
    console.log("[ThreatFeed] AbuseIPDB: ingested blacklist.");
  } catch (e) {
    console.error("[ThreatFeed] AbuseIPDB error:", e);
  }
}

// ─── VirusTotal ───────────────────────────────────────────────────────────────

async function fetchVirusTotal(): Promise<void> {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key) { FEEDS.virustotal.enabled = false; return; }

  try {
    // Recent malicious files
    const res = await fetch("https://www.virustotal.com/api/v3/feeds/files?cursor=", {
      headers: { "x-apikey": key },
    });
    if (!res.ok) return;
    // VT feeds return NDJSON lines
    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);

    for (const line of lines.slice(0, 100)) {
      try {
        const item = JSON.parse(line);
        const attr  = item.attributes ?? {};
        const stats = attr.last_analysis_stats ?? {};
        const mal   = stats.malicious ?? 0;
        const total = stats.total ?? 1;
        if (mal === 0) continue;
        const confidence = Math.round((mal / total) * 100);
        persistIndicator({
          type:        "HASH",
          value:       attr.sha256 ?? item.id,
          source:      "VirusTotal",
          confidence,
          category:    "MALWARE",
          description: `Detected by ${mal}/${total} engines`,
          metadata:    { sha256: attr.sha256, md5: attr.md5, fileType: attr.type_description, stats },
        });
      } catch {}
    }
    console.log("[ThreatFeed] VirusTotal: ingested file hashes.");
  } catch (e) {
    console.error("[ThreatFeed] VirusTotal error:", e);
  }
}

// ─── AlienVault OTX ──────────────────────────────────────────────────────────

async function fetchAlienVault(): Promise<void> {
  const key = process.env.ALIENVAULT_API_KEY;
  if (!key) { FEEDS.alienvault.enabled = false; return; }

  try {
    const res = await fetch(
      "https://otx.alienvault.com/api/v1/pulses/subscribed?limit=20",
      { headers: { "X-OTX-API-KEY": key } }
    );
    if (!res.ok) return;
    const json = await res.json() as any;

    for (const pulse of (json.results ?? [])) {
      for (const ind of (pulse.indicators ?? [])) {
        persistIndicator({
          type:        detectIOCType(ind.indicator),
          value:       ind.indicator,
          source:      "AlienVault OTX",
          confidence:  Math.min((ind.risk ?? 50), 100),
          category:    (pulse.tags ?? []).join(", ") || "MALICIOUS",
          description: pulse.description ?? "AlienVault OTX pulse",
          metadata:    { pulseName: pulse.name, pulseId: pulse.id, tags: pulse.tags },
        });
      }
    }
    console.log("[ThreatFeed] AlienVault OTX: ingested pulses.");
  } catch (e) {
    console.error("[ThreatFeed] AlienVault error:", e);
  }
}

// ─── MalwareBazaar ───────────────────────────────────────────────────────────

async function fetchMalwareBazaar(): Promise<void> {
  try {
    const res = await fetch("https://mb-api.abuse.ch/api/v1/", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    "query=get_recent&selector=time",
    });
    if (!res.ok) return;
    const json = await res.json() as any;

    for (const item of (json.data ?? []).slice(0, 100)) {
      persistIndicator({
        type:        "HASH",
        value:       item.sha256_hash,
        source:      "MalwareBazaar",
        confidence:  90,
        category:    item.malware_type ?? "MALWARE",
        description: `${item.malware_family ?? "Unknown"} — ${item.file_name ?? ""}`,
        metadata:    { sha256: item.sha256_hash, md5: item.md5_hash, fileSize: item.file_size, family: item.malware_family },
      });
    }
    console.log("[ThreatFeed] MalwareBazaar: ingested recent samples.");
  } catch (e) {
    console.error("[ThreatFeed] MalwareBazaar error:", e);
  }
}

// ─── Kaspersky OpenTIP (free, no key required) ────────────────────────────────

async function fetchKasperskyOpenTIP(): Promise<void> {
  // Kaspersky OpenTIP free tier — phishing URL feed
  try {
    const res = await fetch(
      "https://opentip.kaspersky.com/api/v1/search/domain?request=phishing&limit=50",
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return;
    const json = await res.json() as any;

    const items = json.DomainGeneralInfo ?? json.data ?? [];
    for (const item of items) {
      const domain = item.Domain ?? item.domain ?? item.value;
      if (!domain) continue;
      persistIndicator({
        type:        "DOMAIN",
        value:       domain,
        source:      "Kaspersky OpenTIP",
        confidence:  item.Popularity !== undefined ? 75 : 70,
        category:    "PHISHING",
        description: "Kaspersky threat intelligence: phishing domain",
        metadata:    item,
      });
    }
    console.log("[ThreatFeed] Kaspersky OpenTIP: ingested domains.");
  } catch {
    // Kaspersky OpenTIP free API sometimes 403s — silently ignore
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export function startThreatFeedScheduler(): void {
  if (process.env.DISABLE_BACKGROUND_THREAT_FEEDS === "true") {
    console.log("[ThreatFeed] Scheduler disabled via DISABLE_BACKGROUND_THREAT_FEEDS flag.");
    return;
  }
  if (schedulerRunning) return;
  schedulerRunning = true;

  // Enable VT / AlienVault if keys are present
  if (process.env.VIRUSTOTAL_API_KEY) FEEDS.virustotal.enabled = true;
  if (process.env.ALIENVAULT_API_KEY)  FEEDS.alienvault.enabled  = true;

  // Run all feeds immediately on startup
  runAllFeeds();

  // Then check every 5 minutes which feeds are due
  setInterval(runAllFeeds, 5 * 60_000);

  console.log("[ThreatFeed] Scheduler started. Active feeds:", 
    Object.values(FEEDS).filter(f => f.enabled).map(f => f.name).join(", "));
}

async function runAllFeeds(): Promise<void> {
  const now = Date.now();
  for (const [key, cfg] of Object.entries(FEEDS)) {
    if (!cfg.enabled) continue;
    if (now - cfg.lastRunAt < cfg.intervalMs) continue;
    cfg.lastRunAt = now;
    switch (key) {
      case "abuseipdb":    await fetchAbuseIPDB();        break;
      case "virustotal":   await fetchVirusTotal();       break;
      case "alienvault":   await fetchAlienVault();       break;
      case "malwarebazaar":await fetchMalwareBazaar();    break;
      case "kasperskyotp": await fetchKasperskyOpenTIP(); break;
    }
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export function getFeedStats() {
  const rows = db.prepare(
    "SELECT source, COUNT(*) as count, AVG(confidence) as avg_confidence FROM threat_intel WHERE source != 'manual' GROUP BY source"
  ).all() as any[];

  return {
    totalIndicators: (db.prepare("SELECT COUNT(*) as c FROM threat_intel").get() as any).c,
    totalBlocklisted: (db.prepare("SELECT COUNT(*) as c FROM blocklist").get() as any).c,
    bySource: rows,
    feeds: Object.entries(FEEDS).map(([k, v]) => ({
      key:         k,
      name:        v.name,
      enabled:     v.enabled,
      lastRunAt:   v.lastRunAt ? new Date(v.lastRunAt).toISOString() : null,
      intervalMin: Math.round(v.intervalMs / 60_000),
    })),
  };
}

export function searchIndicator(value: string): any[] {
  return db.prepare(
    "SELECT * FROM threat_intel WHERE value LIKE ? ORDER BY confidence DESC LIMIT 20"
  ).all(`%${value}%`) as any[];
}

export function getRecentIndicators(limit = 50): any[] {
  return db.prepare(
    "SELECT * FROM threat_intel WHERE source != 'manual' ORDER BY last_seen DESC LIMIT ?"
  ).all(limit) as any[];
}
