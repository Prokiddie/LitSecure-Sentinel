-- ============================================================
-- LitSecure Sentinel — PostgreSQL Migration v1
-- Run with: psql $DATABASE_URL -f migrations/001_initial.sql
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  full_name       TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN (
    'admin','investigator','analyst','org_user','org_admin',
    'auditor','gov_admin','citizen','soc_manager','super_admin'
  )),
  organization_id TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  mfa_enabled     INTEGER NOT NULL DEFAULT 0,
  mfa_secret      TEXT,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Refresh Tokens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Revoked Tokens (JWT blocklist) ───────────────────────────
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);

-- Auto-cleanup function for expired revoked tokens
CREATE OR REPLACE FUNCTION cleanup_revoked_tokens() RETURNS void AS $$
BEGIN
  DELETE FROM revoked_tokens WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- ── MFA Pending Setup ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_pending (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Login Attempts (brute-force tracking) ────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email        TEXT NOT NULL,
  ip           TEXT,
  success      BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at);

-- ── Organizations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  api_key       TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Incidents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL,
  description             TEXT NOT NULL,
  category                TEXT NOT NULL,
  severity                TEXT NOT NULL CHECK(severity IN ('Low','Medium','High','Critical')),
  status                  TEXT NOT NULL DEFAULT 'Reported',
  reporter_name           TEXT,
  reporter_contact        TEXT,
  reporter_org            TEXT,
  assigned_investigator   TEXT,
  incident_date           TEXT,
  evidence_url            TEXT,
  mitigation_advice       TEXT,
  analysis_summary        TEXT,
  compromised_indicators  JSONB DEFAULT '{}',
  updates                 JSONB DEFAULT '[]',
  priority_score          INTEGER DEFAULT 0,
  priority_level          TEXT DEFAULT 'Low',
  priority_factors        JSONB DEFAULT '[]',
  ai_confidence           REAL DEFAULT 0,
  affected_users          INTEGER DEFAULT 0,
  estimated_loss          REAL DEFAULT 0,
  sector                  TEXT,
  campaign_id             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created  ON incidents(created_at DESC);

-- ── Incident Evidence ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_evidence (
  id           TEXT PRIMARY KEY,
  incident_id  TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_type    TEXT,
  file_size    INTEGER,
  uploaded_by  TEXT,
  description  TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit Logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_name   TEXT,
  user_role   TEXT,
  action      TEXT NOT NULL,
  details     TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  ip_address  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity    ON audit_logs(entity_type, entity_id);

-- ── Notifications ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  priority   TEXT NOT NULL CHECK(priority IN ('low','medium','high','critical')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,
  entity_id  TEXT,
  roles      JSONB NOT NULL DEFAULT '[]',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_roles   ON notifications USING gin(roles);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ── Threat Intelligence ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS threat_intel (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  value       TEXT NOT NULL,
  origin      TEXT,
  severity    TEXT,
  date        TIMESTAMPTZ,
  source      TEXT,
  confidence  INTEGER DEFAULT 0,
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  first_seen  TIMESTAMPTZ,
  last_seen   TIMESTAMPTZ,
  UNIQUE(value, type)
);
CREATE INDEX IF NOT EXISTS idx_threat_intel_type  ON threat_intel(type);
CREATE INDEX IF NOT EXISTS idx_threat_intel_value ON threat_intel(value);

-- ── Social Signals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_signals (
  id              TEXT PRIMARY KEY,
  platform        TEXT NOT NULL,
  signal_type     TEXT NOT NULL,
  content_preview TEXT,
  author_handle   TEXT,
  author_url      TEXT,
  post_url        TEXT,
  victim_handle   TEXT,
  keywords_hit    JSONB DEFAULT '[]',
  ai_severity     TEXT DEFAULT 'Low',
  ai_summary      TEXT,
  ai_action       TEXT,
  status          TEXT DEFAULT 'New',
  notes           TEXT,
  reviewed_by     TEXT,
  incident_id     TEXT REFERENCES incidents(id) ON DELETE SET NULL,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Telecom Alerts (SIM swap / USSD fraud) ───────────────────
CREATE TABLE IF NOT EXISTS telecom_alerts (
  id          TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  alert_type  TEXT NOT NULL,
  source      TEXT,
  details     TEXT,
  status      TEXT DEFAULT 'Active',
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Endpoint Agents (EDR) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS endpoint_agents (
  agent_id      TEXT PRIMARY KEY,
  organization  TEXT NOT NULL,
  sector        TEXT,
  hostname      TEXT NOT NULL,
  ip_address    TEXT,
  os            TEXT,
  version       TEXT,
  status        TEXT DEFAULT 'ACTIVE',
  last_seen     TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Suspicious Activities (EDR) ──────────────────────────────
CREATE TABLE IF NOT EXISTS suspicious_activities (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT REFERENCES endpoint_agents(agent_id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  data        JSONB DEFAULT '{}',
  risk_score  INTEGER DEFAULT 0,
  confidence  REAL DEFAULT 0,
  status      TEXT DEFAULT 'OPEN',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Blocklist ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocklist (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  value      TEXT NOT NULL,
  category   TEXT,
  source     TEXT,
  confidence INTEGER DEFAULT 0,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, value)
);

-- ── Quarantine Log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quarantine_log (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT,
  file_hash      TEXT NOT NULL,
  file_path      TEXT,
  organization   TEXT,
  status         TEXT DEFAULT 'QUARANTINED',
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row Level Security (RLS) — recommended for multi-tenant ──
-- Enable on tables that need tenant isolation when ready:
-- ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_incidents ON incidents USING (organization_id = current_setting('app.org_id'));
