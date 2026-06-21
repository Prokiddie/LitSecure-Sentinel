import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "sentinel.db");

// Ensure the data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);

// Performance + integrity pragmas
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    full_name       TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    phone           TEXT,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('admin','investigator','analyst','org_user','org_admin','auditor','gov_admin','citizen','soc_manager','super_admin')),
    organization_id TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    mfa_enabled     INTEGER NOT NULL DEFAULT 0,
    mfa_secret      TEXT,
    failed_logins   INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    last_login      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  -- JWT blocklist: tokens added here are rejected even if cryptographically valid
  CREATE TABLE IF NOT EXISTS revoked_tokens (
    id          TEXT PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,
    user_id     TEXT,
    revoked_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL  -- used for cleanup, mirrors JWT exp
  );
  CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);

  -- TOTP MFA pending setups (before confirmed enrollment)
  CREATE TABLE IF NOT EXISTS mfa_pending (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret     TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Brute-force tracking
  CREATE TABLE IF NOT EXISTS login_attempts (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    ip         TEXT,
    success    INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at);

  CREATE TABLE IF NOT EXISTS organizations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    api_key       TEXT UNIQUE NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id                     TEXT PRIMARY KEY,
    title                  TEXT NOT NULL,
    description            TEXT NOT NULL,
    category               TEXT NOT NULL,
    severity               TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'Reported',
    reporter_name          TEXT NOT NULL,
    reporter_contact       TEXT NOT NULL,
    reporter_org           TEXT NOT NULL,
    incident_date          TEXT NOT NULL,
    evidence_url           TEXT,
    assigned_investigator  TEXT,
    mitigation_advice      TEXT NOT NULL DEFAULT '',
    compromised_indicators TEXT NOT NULL DEFAULT '{"phoneNumbers":[],"ips":[],"domains":[],"devices":[]}',
    analysis_summary       TEXT NOT NULL DEFAULT '',
    updates                TEXT NOT NULL DEFAULT '[]',
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    reporter_email         TEXT,
    physical_addresses     TEXT,
    witness_details        TEXT
  );

  CREATE TABLE IF NOT EXISTS incident_evidence (
    id               TEXT PRIMARY KEY,
    incident_id      TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    file_name        TEXT NOT NULL,
    file_url         TEXT NOT NULL,
    file_type        TEXT NOT NULL, -- screenshot | log | document | capture | malware
    file_size        INTEGER NOT NULL,
    sha256_hash      TEXT NOT NULL,
    chain_of_custody TEXT NOT NULL DEFAULT '[]',
    tags             TEXT NOT NULL DEFAULT '[]',
    uploaded_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS critical_assets (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    sector        TEXT NOT NULL, -- government | banking | telecom | utility | university | hospital
    owner         TEXT NOT NULL,
    location      TEXT NOT NULL,
    risk_score    INTEGER NOT NULL DEFAULT 50,
    criticality   TEXT NOT NULL, -- Low | Medium | High | Critical
    status        TEXT NOT NULL DEFAULT 'Operational',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS security_rules (
    id             TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    language       TEXT NOT NULL, -- YARA | Sigma | Snort
    content        TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'Active',
    nodes_deployed INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telecom_alerts (
    id           TEXT PRIMARY KEY,
    timestamp    TEXT NOT NULL,
    type         TEXT NOT NULL, -- SIM Swap | Fraud Report | Wallet Anomalies
    source       TEXT NOT NULL, -- TNM | Airtel
    phone_number TEXT NOT NULL,
    details      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    timestamp   TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    user_role   TEXT NOT NULL,
    action      TEXT NOT NULL,
    details     TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    ip_address  TEXT,
    user_agent  TEXT,
    chain_hash  TEXT
  );

  CREATE TABLE IF NOT EXISTS simulated_logs (
    id        TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    source    TEXT NOT NULL,
    event     TEXT NOT NULL,
    severity  TEXT NOT NULL,
    details   TEXT NOT NULL,
    indicator TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sites (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    location       TEXT NOT NULL,
    address        TEXT NOT NULL,
    org_id         TEXT NOT NULL,
    security_level TEXT NOT NULL DEFAULT 'Standard'
  );

  CREATE TABLE IF NOT EXISTS cameras (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    rtsp_url            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Online',
    site_id             TEXT NOT NULL REFERENCES sites(id),
    is_recording        INTEGER NOT NULL DEFAULT 0,
    ai_detection_flags  TEXT NOT NULL DEFAULT '[]',
    resolution          TEXT NOT NULL DEFAULT '1080p',
    model               TEXT NOT NULL DEFAULT 'LIT-Eye Standard'
  );

  CREATE TABLE IF NOT EXISTS security_events (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    timestamp  TEXT NOT NULL,
    severity   TEXT NOT NULL,
    location   TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'Airing',
    details    TEXT NOT NULL,
    camera_id  TEXT
  );

  CREATE TABLE IF NOT EXISTS access_logs (
    id          TEXT PRIMARY KEY,
    timestamp   TEXT NOT NULL,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    action      TEXT NOT NULL,
    status      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threat_intel (
    id       TEXT PRIMARY KEY,
    type     TEXT NOT NULL,
    value    TEXT NOT NULL,
    origin   TEXT NOT NULL,
    severity TEXT NOT NULL,
    date     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seed_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- ── Social Media Monitoring ──────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS social_signals (
    id              TEXT PRIMARY KEY,
    platform        TEXT NOT NULL,        -- twitter | facebook | tiktok | instagram | youtube | simulated
    signal_type     TEXT NOT NULL,        -- account_theft | cyberbullying | impersonation | harassment | hate_speech | scam
    post_id         TEXT,                 -- platform-native post/video/comment ID
    post_url        TEXT,                 -- direct link to content
    author_handle   TEXT NOT NULL DEFAULT '',
    author_url      TEXT NOT NULL DEFAULT '',
    content_preview TEXT NOT NULL,        -- first 500 chars of offending content
    victim_handle   TEXT NOT NULL DEFAULT '',
    keywords_hit    TEXT NOT NULL DEFAULT '[]',
    ai_severity     TEXT NOT NULL DEFAULT 'Medium',
    ai_summary      TEXT NOT NULL DEFAULT '',
    ai_action       TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'New',  -- New | Reviewing | Escalated | Resolved | FalsePositive
    incident_id     TEXT,
    reviewed_by     TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    detected_at     TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS social_keywords (
    id         TEXT PRIMARY KEY,
    keyword    TEXT NOT NULL UNIQUE,
    category   TEXT NOT NULL DEFAULT 'general',
    severity   TEXT NOT NULL DEFAULT 'Medium',
    platforms  TEXT NOT NULL DEFAULT '["twitter","facebook","tiktok","instagram","youtube"]',
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS social_platform_config (
    id            TEXT PRIMARY KEY,
    platform      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    is_enabled    INTEGER NOT NULL DEFAULT 1,
    api_key_set   INTEGER NOT NULL DEFAULT 0,
    scan_interval INTEGER NOT NULL DEFAULT 15,
    last_scan_at  TEXT NOT NULL DEFAULT '',
    total_signals INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL CHECK(type IN ('phone', 'ip', 'domain')),
    value      TEXT NOT NULL UNIQUE,
    risk_level TEXT NOT NULL CHECK(risk_level IN ('Medium', 'High', 'Critical')),
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- ── Phase 1: Endpoint Agent Infrastructure ───────────────────────────────────

  CREATE TABLE IF NOT EXISTS endpoint_agents (
    agent_id       TEXT PRIMARY KEY,
    organization   TEXT NOT NULL,
    sector         TEXT NOT NULL,
    hostname       TEXT NOT NULL,
    ip_address     TEXT NOT NULL,
    os             TEXT NOT NULL DEFAULT '',
    version        TEXT NOT NULL DEFAULT '1.0.0',
    status         TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | INACTIVE | QUARANTINED
    last_seen      TEXT NOT NULL,
    registered_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_commands (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL REFERENCES endpoint_agents(agent_id) ON DELETE CASCADE,
    command     TEXT NOT NULL,  -- JSON
    status      TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SENT | EXECUTED | FAILED
    issued_at   TEXT NOT NULL,
    executed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS quarantine_log (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL,
    file_hash    TEXT NOT NULL,
    file_path    TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'QUARANTINED',
    quarantined_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suspicious_activities (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL,
    type        TEXT NOT NULL,  -- FILE_HASH | PROCESS | NETWORK | BEHAVIORAL
    data        TEXT NOT NULL,  -- JSON
    risk_score  INTEGER NOT NULL DEFAULT 0,
    confidence  REAL NOT NULL DEFAULT 0.8,
    status      TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | RESOLVED | FALSE_POSITIVE
    detected_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocklist (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,  -- IP | DOMAIN | URL | HASH | EMAIL
    value      TEXT NOT NULL UNIQUE,
    category   TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'manual',
    confidence INTEGER NOT NULL DEFAULT 80,
    added_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_events (
    id           TEXT PRIMARY KEY,
    event_type   TEXT NOT NULL,
    payload      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING',
    retry_count  INTEGER NOT NULL DEFAULT 0,
    error_log    TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    processed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vulnerabilities (
    id              TEXT PRIMARY KEY,
    cve_id          TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    cvss_score      REAL NOT NULL,
    severity        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Open',
    affected_assets TEXT NOT NULL DEFAULT '[]',
    remediation     TEXT NOT NULL DEFAULT '',
    detected_at     TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
`);

// ─── Schema Migrations (idempotent) ────────────────────────────────────────────
// SQLite doesn't support IF NOT EXISTS on ADD COLUMN — wrap each in try/catch.
const _migrate = (sql: string) => { try { db.exec(sql); } catch {} };

// Incidents — priority + context fields
_migrate("ALTER TABLE incidents ADD COLUMN priority_score  INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE incidents ADD COLUMN priority_level  TEXT    NOT NULL DEFAULT 'LOW'");
_migrate("ALTER TABLE incidents ADD COLUMN priority_factors TEXT   NOT NULL DEFAULT '[]'");
_migrate("ALTER TABLE incidents ADD COLUMN affected_users  INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE incidents ADD COLUMN estimated_loss  INTEGER NOT NULL DEFAULT 0"); // MWK
_migrate("ALTER TABLE incidents ADD COLUMN sector          TEXT    NOT NULL DEFAULT ''");
_migrate("ALTER TABLE incidents ADD COLUMN campaign_id     TEXT");
_migrate("ALTER TABLE incidents ADD COLUMN ai_confidence   INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE incidents ADD COLUMN reporter_email         TEXT");
_migrate("ALTER TABLE incidents ADD COLUMN physical_addresses     TEXT");
_migrate("ALTER TABLE incidents ADD COLUMN witness_details        TEXT");

// Threat Intel — enrichment fields
_migrate("ALTER TABLE threat_intel ADD COLUMN abuse_score  INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE threat_intel ADD COLUMN vt_positives INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE threat_intel ADD COLUMN vt_total     INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE threat_intel ADD COLUMN geo_country  TEXT    NOT NULL DEFAULT ''");
_migrate("ALTER TABLE threat_intel ADD COLUMN geo_isp      TEXT    NOT NULL DEFAULT ''");
_migrate("ALTER TABLE threat_intel ADD COLUMN last_enriched TEXT");

// Threat Intel — Phase 1 feed source fields
_migrate("ALTER TABLE threat_intel ADD COLUMN source       TEXT    NOT NULL DEFAULT 'manual'");
_migrate("ALTER TABLE threat_intel ADD COLUMN confidence   INTEGER NOT NULL DEFAULT 50");
_migrate("ALTER TABLE threat_intel ADD COLUMN description  TEXT    NOT NULL DEFAULT ''");
_migrate("ALTER TABLE threat_intel ADD COLUMN metadata     TEXT    NOT NULL DEFAULT '{}'");
_migrate("ALTER TABLE threat_intel ADD COLUMN first_seen   TEXT");
_migrate("ALTER TABLE threat_intel ADD COLUMN last_seen    TEXT");

// Users — brute-force protection + MFA fields (CRITICAL: must exist for auth to work)
_migrate("ALTER TABLE users ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE users ADD COLUMN locked_until  TEXT");
_migrate("ALTER TABLE users ADD COLUMN mfa_enabled   INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE users ADD COLUMN mfa_secret    TEXT");
_migrate("ALTER TABLE users ADD COLUMN last_login    TEXT");
_migrate("ALTER TABLE users ADD COLUMN updated_at    TEXT NOT NULL DEFAULT ''");
_migrate("ALTER TABLE users ADD COLUMN phone         TEXT");

// Organizations — extended fields
_migrate("ALTER TABLE organizations ADD COLUMN updated_at TEXT");
_migrate("ALTER TABLE organizations ADD COLUMN is_active  INTEGER NOT NULL DEFAULT 1");

// Incident evidence — malware analysis results
_migrate("ALTER TABLE incident_evidence ADD COLUMN malware_risk_level TEXT");
_migrate("ALTER TABLE incident_evidence ADD COLUMN malware_risk_score INTEGER NOT NULL DEFAULT 0");
_migrate("ALTER TABLE incident_evidence ADD COLUMN malware_summary    TEXT    NOT NULL DEFAULT ''");


// ─── ID Generator ────────────────────────────────────────────────────────────

export function generateId(prefix: string = "id"): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

// ─── Typed Row Mappers ────────────────────────────────────────────────────────
import { decryptField } from "../services/encryptionService.js";

export function mapIncident(row: any) {
  return {
    id:                   row.id,
    title:                row.title,
    description:          row.description,
    category:             row.category,
    severity:             row.severity,
    status:               row.status,
    reporterName:         decryptField(row.reporter_name),
    reporterContact:      decryptField(row.reporter_contact),
    reporterOrg:          row.reporter_org,
    incidentDate:         row.incident_date,
    evidenceUrl:          row.evidence_url ?? undefined,
    assignedInvestigator: row.assigned_investigator ?? null,
    mitigationAdvice:     row.mitigation_advice,
    compromisedIndicators:JSON.parse(row.compromised_indicators),
    analysisSummary:      row.analysis_summary,
    updates:              JSON.parse(row.updates),
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
    // Priority Engine fields
    priorityScore:   row.priority_score   ?? 0,
    priorityLevel:   row.priority_level   ?? "LOW",
    priorityFactors: (() => { try { return JSON.parse(row.priority_factors || "[]"); } catch { return []; } })(),
    affectedUsers:   row.affected_users   ?? 0,
    estimatedLoss:   row.estimated_loss   ?? 0,
    sector:          row.sector           ?? "",
    campaignId:      row.campaign_id      ?? null,
    aiConfidence:    row.ai_confidence    ?? 0,
    reporterEmail:   decryptField(row.reporter_email),
    physicalAddresses: decryptField(row.physical_addresses),
    witnessDetails:  decryptField(row.witness_details),
  };
}

export function mapCamera(row: any) {
  return {
    id: row.id,
    name: row.name,
    rtspUrl: row.rtsp_url,
    status: row.status,
    siteId: row.site_id,
    isRecording: row.is_recording === 1,
    aiDetectionFlags: JSON.parse(row.ai_detection_flags),
    resolution: row.resolution,
    model: row.model,
  };
}

export function mapAuditLog(row: any) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    user: row.user_name,
    role: row.user_role,
    action: row.action,
    details: row.details,
  };
}

// ─── Prepared Statements ─────────────────────────────────────────────────────

export const queries = {
  // Users
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1"),
  getUserById:    db.prepare("SELECT * FROM users WHERE id = ?"),

  // Incidents
  getAllIncidents:  db.prepare("SELECT * FROM incidents ORDER BY incident_date DESC"),
  getIncidentById: db.prepare("SELECT * FROM incidents WHERE id = ?"),
  insertIncident:  db.prepare(`
    INSERT INTO incidents (id,title,description,category,severity,status,reporter_name,reporter_contact,reporter_org,incident_date,evidence_url,assigned_investigator,mitigation_advice,compromised_indicators,analysis_summary,updates,created_at,updated_at)
    VALUES (@id,@title,@description,@category,@severity,@status,@reporter_name,@reporter_contact,@reporter_org,@incident_date,@evidence_url,@assigned_investigator,@mitigation_advice,@compromised_indicators,@analysis_summary,@updates,@created_at,@updated_at)
  `),
  updateIncident: db.prepare(`
    UPDATE incidents SET status=@status, assigned_investigator=@assigned_investigator, updates=@updates, updated_at=@updated_at WHERE id=@id
  `),
  deleteIncident: db.prepare("DELETE FROM incidents WHERE id = ?"),

  // Incident Evidence
  getEvidenceForIncident: db.prepare("SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY uploaded_at DESC"),
  insertEvidence: db.prepare(`
    INSERT INTO incident_evidence (id, incident_id, file_name, file_url, file_type, file_size, sha256_hash, chain_of_custody, tags, uploaded_at)
    VALUES (@id, @incident_id, @file_name, @file_url, @file_type, @file_size, @sha256_hash, @chain_of_custody, @tags, @uploaded_at)
  `),

  // Critical Assets
  getAllAssets: db.prepare("SELECT * FROM critical_assets ORDER BY created_at DESC"),
  insertAsset: db.prepare(`
    INSERT INTO critical_assets (id, name, sector, owner, location, risk_score, criticality, status, created_at)
    VALUES (@id, @name, @sector, @owner, @location, @risk_score, @criticality, @status, @created_at)
  `),

  // Security Rules
  getAllRules: db.prepare("SELECT * FROM security_rules ORDER BY created_at DESC"),
  insertRule: db.prepare(`
    INSERT INTO security_rules (id, title, language, content, status, nodes_deployed, created_at)
    VALUES (@id, @title, @language, @content, @status, @nodes_deployed, @created_at)
  `),

  // Telecom Alerts (SIM Swap, Fraud)
  getAllTelecomAlerts: db.prepare("SELECT * FROM telecom_alerts ORDER BY timestamp DESC"),
  insertTelecomAlert: db.prepare(`
    INSERT INTO telecom_alerts (id, timestamp, type, source, phone_number, details, status)
    VALUES (@id, @timestamp, @type, @source, @phone_number, @details, @status)
  `),
  updateTelecomAlertStatus: db.prepare("UPDATE telecom_alerts SET status = ? WHERE id = ?"),

  // Audit Logs
  getAllAuditLogs: db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC"),
  insertAuditLog: db.prepare(`
    INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id)
    VALUES (@id,@timestamp,@user_name,@user_role,@action,@details,@entity_type,@entity_id)
  `),

  // Simulated Logs
  getAllLogs:    db.prepare("SELECT * FROM simulated_logs ORDER BY timestamp DESC LIMIT 50"),
  insertLog:    db.prepare(`
    INSERT INTO simulated_logs (id,timestamp,source,event,severity,details,indicator)
    VALUES (@id,@timestamp,@source,@event,@severity,@details,@indicator)
  `),

  // Sites
  getAllSites:  db.prepare("SELECT * FROM sites"),
  getSiteById: db.prepare("SELECT * FROM sites WHERE id = ?"),
  insertSite:  db.prepare(`
    INSERT INTO sites (id,name,location,address,org_id,security_level)
    VALUES (@id,@name,@location,@address,@org_id,@security_level)
  `),

  // Cameras
  getAllCameras:  db.prepare("SELECT * FROM cameras"),
  getCameraById: db.prepare("SELECT * FROM cameras WHERE id = ?"),
  insertCamera:  db.prepare(`
    INSERT INTO cameras (id,name,rtsp_url,status,site_id,is_recording,ai_detection_flags,resolution,model)
    VALUES (@id,@name,@rtsp_url,@status,@site_id,@is_recording,@ai_detection_flags,@resolution,@model)
  `),
  updateCameraStatus: db.prepare("UPDATE cameras SET status=@status, is_recording=@is_recording WHERE id=@id"),

  // Security Events
  getAllEvents:   db.prepare("SELECT * FROM security_events ORDER BY timestamp DESC"),
  getEventById:  db.prepare("SELECT * FROM security_events WHERE id = ?"),
  insertEvent:   db.prepare(`
    INSERT INTO security_events (id,type,timestamp,severity,location,status,details,camera_id)
    VALUES (@id,@type,@timestamp,@severity,@location,@status,@details,@camera_id)
  `),
  acknowledgeEvent: db.prepare("UPDATE security_events SET status='Acknowledged' WHERE id=?"),

  // Access Logs
  getAllAccessLogs: db.prepare("SELECT * FROM access_logs ORDER BY timestamp DESC"),
  insertAccessLog: db.prepare(`
    INSERT INTO access_logs (id,timestamp,device_name,device_type,user_name,action,status)
    VALUES (@id,@timestamp,@device_name,@device_type,@user_name,@action,@status)
  `),

  // Threat Intel
  getAllThreatIntel: db.prepare("SELECT * FROM threat_intel ORDER BY date DESC"),
  insertThreatIntel: db.prepare(`
    INSERT OR IGNORE INTO threat_intel (id,type,value,origin,severity,date)
    VALUES (@id,@type,@value,@origin,@severity,@date)
  `),

  // Seed Meta
  getSeedMeta: db.prepare("SELECT value FROM seed_meta WHERE key = ?"),
  setSeedMeta: db.prepare("INSERT OR REPLACE INTO seed_meta (key,value) VALUES (?,?)"),

  // Users insert
  insertUser: db.prepare(`
    INSERT INTO users (id,full_name,email,phone,password_hash,role,organization_id,is_active,created_at,updated_at)
    VALUES (@id,@full_name,@email,@phone,@password_hash,@role,@organization_id,@is_active,@created_at,@updated_at)
  `),

  // Watchlist
  getWatchlist: db.prepare("SELECT * FROM watchlist ORDER BY created_at DESC"),
  insertWatchlist: db.prepare(`
    INSERT OR REPLACE INTO watchlist (id, type, value, risk_level, reason, created_at)
    VALUES (@id, @type, @value, @risk_level, @reason, @created_at)
  `),
  deleteWatchlist: db.prepare("DELETE FROM watchlist WHERE id = ?"),

  // Priority scoring update
  updateIncidentPriority: db.prepare(`
    UPDATE incidents
    SET priority_score=@priority_score, priority_level=@priority_level,
        priority_factors=@priority_factors, ai_confidence=@ai_confidence,
        affected_users=@affected_users, estimated_loss=@estimated_loss,
        sector=@sector, campaign_id=@campaign_id, updated_at=@updated_at
    WHERE id=@id
  `),

  // Threat Intel enrichment update
  updateThreatEnrichment: db.prepare(`
    UPDATE threat_intel
    SET abuse_score=@abuse_score, vt_positives=@vt_positives, vt_total=@vt_total,
        geo_country=@geo_country, geo_isp=@geo_isp, last_enriched=@last_enriched
    WHERE value=@value
  `),

  // Vulnerabilities
  getAllVulnerabilities: db.prepare("SELECT * FROM vulnerabilities ORDER BY cvss_score DESC"),
  getVulnerabilityById:  db.prepare("SELECT * FROM vulnerabilities WHERE id = ?"),
  insertVulnerability:   db.prepare(`
    INSERT OR REPLACE INTO vulnerabilities (id, cve_id, title, description, cvss_score, severity, status, affected_assets, remediation, detected_at, updated_at)
    VALUES (@id, @cve_id, @title, @description, @cvss_score, @severity, @status, @affected_assets, @remediation, @detected_at, @updated_at)
  `),
  updateVulnerabilityStatus: db.prepare("UPDATE vulnerabilities SET status = ?, updated_at = ? WHERE id = ?"),
};

export default db;

// ─── PostgreSQL Integration ───────────────────────────────────────────────────
import {
  pgPool as pgPoolImport,
  executePostgresQuery,
  translateSqlToPostgres,
  encryptParams,
  decryptRow
} from "./postgres.js";

export const pgPool = pgPoolImport;

// Cache pg readiness check
let pgReady: boolean | null = null;

export async function isPgActive(): Promise<boolean> {
  if (pgReady !== null) return pgReady;
  if (!pgPool) {
    pgReady = false;
    return false;
  }
  try {
    const client = await pgPool.connect();
    client.release();
    pgReady = true;
    return true;
  } catch (err) {
    console.warn("Postgres is not reachable, using SQLite fallback. Error:", err);
    pgReady = false;
    return false;
  }
}

/** Returns true if a PostgreSQL pool is configured and reachable. */
export async function isPgReady(): Promise<boolean> {
  return isPgActive();
}

/** Helper: run a parameterised query on pgPool. Throws if pgPool not configured. */
export async function pgQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  if (!pgPool) throw new Error("PostgreSQL not configured. Set DATABASE_URL.");
  const { rows } = await pgPool.query(sql, params);
  return rows as T[];
}

/** Execute a query on the active database (Postgres when ready, SQLite fallback). */
export async function executeDbQuery<T = any>(sql: string, params: any = []): Promise<T[]> {
  const active = await isPgActive();
  if (active) {
    return executePostgresQuery<T>(sql, params);
  } else {
    // SQLite fallback — translate PostgreSQL-style $1,$2... placeholders to ? if needed
    let sqliteSQL = sql;
    let sqliteParams: any[];

    if (Array.isArray(params)) {
      // Replace $1, $2 ... $N style with ? for SQLite
      sqliteSQL = sql.replace(/\$\d+/g, "?");
      sqliteParams = params;
    } else if (params && typeof params === "object") {
      // Named @param style — encryptParams handles object params
      sqliteParams = params;
    } else {
      sqliteParams = [];
    }

    const encryptedParams = encryptParams(sqliteParams);
    const stmt = db.prepare(sqliteSQL);
    let rows: any[];
    if (Array.isArray(encryptedParams)) {
      rows = stmt.all(...encryptedParams);
    } else if (encryptedParams && typeof encryptedParams === "object") {
      rows = stmt.all(encryptedParams);
    } else {
      rows = stmt.all();
    }
    return rows.map(decryptRow) as T[];
  }
}

export async function queryAll<T = any>(sql: string, params: any = []): Promise<T[]> {
  return executeDbQuery<T>(sql, params);
}

export async function queryGet<T = any>(sql: string, params: any = []): Promise<T | null> {
  const rows = await executeDbQuery<T>(sql, params);
  return rows[0] || null;
}

export async function queryRun(sql: string, params: any = []): Promise<void> {
  const active = await isPgActive();
  if (active) {
    // Postgres: executePostgresQuery handles all statement types
    await executePostgresQuery(sql, params);
    return;
  }

  // SQLite: must use .run() for INSERT/UPDATE/DELETE (not .all())
  let sqliteSQL = sql;
  let sqliteParams: any[];

  if (Array.isArray(params)) {
    sqliteSQL = sql.replace(/\$\d+/g, "?");
    sqliteParams = params;
  } else if (params && typeof params === "object") {
    sqliteParams = params;
  } else {
    sqliteParams = [];
  }

  const encryptedParams = encryptParams(sqliteParams);
  const stmt = db.prepare(sqliteSQL);
  if (Array.isArray(encryptedParams)) {
    stmt.run(...encryptedParams);
  } else if (encryptedParams && typeof encryptedParams === "object") {
    stmt.run(encryptedParams);
  } else {
    stmt.run();
  }
}

export async function dbTransaction(fn: (query: (sql: string, params?: any) => Promise<any[]>) => Promise<void>): Promise<void> {
  const active = await isPgActive();
  if (active) {
    const client = await pgPool!.connect();
    try {
      await client.query("BEGIN");
      const localQuery = async (sql: string, params: any = []) => {
        const encryptedParams = encryptParams(params);
        const { sql: finalSql, values } = translateSqlToPostgres(sql, encryptedParams);
        const res = await client.query(finalSql, values);
        return res.rows.map(decryptRow);
      };
      await fn(localQuery);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    db.exec("BEGIN");
    try {
      const localQuery = async (sql: string, params: any = []) => {
        const encryptedParams = encryptParams(params);
        const stmt = db.prepare(sql);
        let rows: any[];
        if (Array.isArray(encryptedParams)) {
          rows = stmt.all(...encryptedParams);
        } else if (encryptedParams && typeof encryptedParams === "object") {
          rows = stmt.all(encryptedParams);
        } else {
          rows = stmt.all();
        }
        return rows.map(decryptRow);
      };
      await fn(localQuery);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

