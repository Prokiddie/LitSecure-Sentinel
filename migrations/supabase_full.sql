-- ================================================================================
-- LitSecure Sentinel — Complete Supabase Migration v2.3 (FINAL)
-- ================================================================================
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → Paste → RUN
--
-- CHANGES v2.2:
--   • Removed SET search_path (not permitted in Supabase SQL Editor)
--   • Added 6 missing tables discovered in supabase-client.ts:
--       security_policies, policy_deployments, takedown_requests,
--       malawi_reputation, sharing_requests, endpoints
--   • Added defensive ALTER TABLE...ADD COLUMN blocks for tables that may
--     have been created by prior partial migrations without all columns
--   • Fixed INSERT RLS policies: USING → WITH CHECK
--   • Removed pg_trgm dependency (not on all Supabase plans)
-- ================================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── updated_at trigger ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ================================================================================
-- § 1 — USERS & AUTH
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  full_name       TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'citizen' CHECK(role IN (
    'admin','investigator','analyst','org_user','org_admin',
    'auditor','gov_admin','citizen','soc_manager','super_admin'
  )),
  organization_id TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret      TEXT,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON public.users(role);
DROP TRIGGER IF EXISTS trg_users_upd ON public.users;
CREATE TRIGGER trg_users_upd BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- refresh_tokens — user_id is plain TEXT (no FK to avoid auth.users UUID clash)
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rt_user    ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires ON public.refresh_tokens(expires_at);

-- revoked_tokens — JWT blocklist
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_hash    ON public.revoked_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rev_expires ON public.revoked_tokens(expires_at);

-- Cleanup function — schedule hourly in Supabase Dashboard → Database → Hooks
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM public.revoked_tokens WHERE expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.refresh_tokens WHERE expires_at < now();
  DELETE FROM public.login_attempts WHERE attempted_at < now() - INTERVAL '7 days';
  RETURN n;
END;
$$;

-- mfa_pending
CREATE TABLE IF NOT EXISTS public.mfa_pending (
  user_id    TEXT PRIMARY KEY,
  secret     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- login_attempts
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  email        TEXT NOT NULL,
  ip           TEXT,
  success      BOOLEAN NOT NULL DEFAULT FALSE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_la_email ON public.login_attempts(email, attempted_at);

-- organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'other',
  contact_email TEXT,
  contact_phone TEXT,
  api_key       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Defensive: updated_at not in old 001_initial.sql organizations schema
DO $$ BEGIN ALTER TABLE public.organizations ADD COLUMN updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD COLUMN contact_email TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD COLUMN contact_phone TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_org_upd ON public.organizations;
CREATE TRIGGER trg_org_upd BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================================
-- § 2 — INCIDENTS
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.incidents (
  id                     TEXT PRIMARY KEY,
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  category               TEXT NOT NULL,
  severity               TEXT NOT NULL DEFAULT 'Medium'
                           CHECK(severity IN ('Low','Medium','High','Critical')),
  status                 TEXT NOT NULL DEFAULT 'Reported'
                           CHECK(status IN ('Reported','Investigating','Contained','Resolved','Closed')),
  reporter_name          TEXT NOT NULL DEFAULT '',
  reporter_contact       TEXT NOT NULL DEFAULT '',
  reporter_org           TEXT NOT NULL DEFAULT '',
  incident_date          TEXT NOT NULL DEFAULT '',
  evidence_url           TEXT,
  assigned_investigator  TEXT,
  mitigation_advice      TEXT NOT NULL DEFAULT '',
  analysis_summary       TEXT NOT NULL DEFAULT '',
  compromised_indicators JSONB NOT NULL DEFAULT '{"phoneNumbers":[],"ips":[],"domains":[],"devices":[]}',
  updates                JSONB NOT NULL DEFAULT '[]',
  priority_score         INTEGER NOT NULL DEFAULT 0,
  priority_level         TEXT    NOT NULL DEFAULT 'LOW',
  priority_factors       JSONB   NOT NULL DEFAULT '[]',
  ai_confidence          REAL    NOT NULL DEFAULT 0,
  affected_users         INTEGER NOT NULL DEFAULT 0,
  estimated_loss         REAL    NOT NULL DEFAULT 0,
  sector                 TEXT    NOT NULL DEFAULT '',
  campaign_id            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inc_status   ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_inc_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_inc_sector   ON public.incidents(sector);
CREATE INDEX IF NOT EXISTS idx_inc_created  ON public.incidents(created_at DESC);
DROP TRIGGER IF EXISTS trg_inc_upd ON public.incidents;
CREATE TRIGGER trg_inc_upd BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Defensive: add columns that may be absent in older schema
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN priority_score   INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN priority_level   TEXT    NOT NULL DEFAULT 'LOW';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN priority_factors JSONB   NOT NULL DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN ai_confidence    REAL    NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN affected_users   INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN estimated_loss   REAL    NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN sector           TEXT    NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN campaign_id      TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- incident_evidence
CREATE TABLE IF NOT EXISTS public.incident_evidence (
  id               TEXT PRIMARY KEY,
  incident_id      TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  file_url         TEXT NOT NULL DEFAULT '',
  file_type        TEXT NOT NULL DEFAULT 'document',
  file_size        BIGINT NOT NULL DEFAULT 0,
  sha256_hash      TEXT NOT NULL DEFAULT '',
  chain_of_custody JSONB NOT NULL DEFAULT '[]',
  tags             JSONB NOT NULL DEFAULT '[]',
  uploaded_by      TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ev_incident ON public.incident_evidence(incident_id);
-- Defensive: columns not present in 001_initial.sql evidence schema
DO $$ BEGIN ALTER TABLE public.incident_evidence ADD COLUMN sha256_hash      TEXT  NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.incident_evidence ADD COLUMN chain_of_custody JSONB NOT NULL DEFAULT '[]'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.incident_evidence ADD COLUMN tags             JSONB NOT NULL DEFAULT '[]'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.incident_evidence ADD COLUMN file_url         TEXT  NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
-- Index after column guaranteed present
CREATE INDEX IF NOT EXISTS idx_ev_hash ON public.incident_evidence(sha256_hash);

-- campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  threat_actor   TEXT NOT NULL DEFAULT 'Unknown',
  first_seen     TIMESTAMPTZ,
  last_seen      TIMESTAMPTZ,
  incident_count INTEGER NOT NULL DEFAULT 0,
  severity       TEXT NOT NULL DEFAULT 'Medium',
  status         TEXT NOT NULL DEFAULT 'Active',
  tactics        JSONB NOT NULL DEFAULT '[]',
  iocs           JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_camp_upd ON public.campaigns;
CREATE TRIGGER trg_camp_upd BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================================
-- § 3 — THREAT INTELLIGENCE
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.threat_intel (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL DEFAULT 'IP',
  value         TEXT NOT NULL,
  origin        TEXT NOT NULL DEFAULT '',
  severity      TEXT NOT NULL DEFAULT 'Medium',
  date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL DEFAULT 'manual',
  confidence    INTEGER NOT NULL DEFAULT 50,
  description   TEXT NOT NULL DEFAULT '',
  metadata      JSONB NOT NULL DEFAULT '{}',
  first_seen    TIMESTAMPTZ DEFAULT now(),
  last_seen     TIMESTAMPTZ DEFAULT now(),
  abuse_score   INTEGER NOT NULL DEFAULT 0,
  vt_positives  INTEGER NOT NULL DEFAULT 0,
  vt_total      INTEGER NOT NULL DEFAULT 0,
  geo_country   TEXT NOT NULL DEFAULT '',
  geo_isp       TEXT NOT NULL DEFAULT '',
  last_enriched TIMESTAMPTZ
);
-- NOTE: indexes are created AFTER defensive ADD COLUMN blocks below


-- Defensive: add source column if threat_intel was created without it
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN confidence INTEGER NOT NULL DEFAULT 50;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN description TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN first_seen TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN last_seen TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN abuse_score INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN vt_positives INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN vt_total INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN geo_country TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN geo_isp TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.threat_intel ADD COLUMN last_enriched TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- All threat_intel indexes after columns are guaranteed present
CREATE INDEX IF NOT EXISTS idx_ti_type     ON public.threat_intel(type);
CREATE INDEX IF NOT EXISTS idx_ti_value    ON public.threat_intel(value);
CREATE INDEX IF NOT EXISTS idx_ti_severity ON public.threat_intel(severity);
CREATE INDEX IF NOT EXISTS idx_ti_last     ON public.threat_intel(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_ti_source   ON public.threat_intel(source);

-- watchlist
CREATE TABLE IF NOT EXISTS public.watchlist (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK(type IN ('phone','ip','domain')),
  value      TEXT NOT NULL UNIQUE,
  risk_level TEXT NOT NULL DEFAULT 'Medium' CHECK(risk_level IN ('Medium','High','Critical')),
  reason     TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wl_type  ON public.watchlist(type);
CREATE INDEX IF NOT EXISTS idx_wl_value ON public.watchlist(value);

-- blocklist
CREATE TABLE IF NOT EXISTS public.blocklist (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  value      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'threat',
  source     TEXT NOT NULL DEFAULT 'manual',
  confidence INTEGER NOT NULL DEFAULT 80,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, value)
);
CREATE INDEX IF NOT EXISTS idx_bl_value ON public.blocklist(value);
CREATE INDEX IF NOT EXISTS idx_bl_type  ON public.blocklist(type);

-- security_rules
CREATE TABLE IF NOT EXISTS public.security_rules (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  language       TEXT NOT NULL DEFAULT 'Sigma',
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Active',
  nodes_deployed INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_rules_upd ON public.security_rules;
CREATE TRIGGER trg_rules_upd BEFORE UPDATE ON public.security_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================================
-- § 4 — NOTIFICATIONS & AUDIT
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  priority   TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,
  entity_id  TEXT,
  roles      JSONB NOT NULL DEFAULT '[]',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  read_by    JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_created ON public.notifications(created_at DESC);
-- Defensive: roles, read_by, entity_id, priority not in old 001_initial.sql notifications schema
DO $$ BEGIN ALTER TABLE public.notifications ADD COLUMN roles     JSONB   NOT NULL DEFAULT '[]'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ADD COLUMN read_by   JSONB   NOT NULL DEFAULT '[]'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ADD COLUMN entity_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ADD COLUMN priority  TEXT    NOT NULL DEFAULT 'medium'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ADD COLUMN link      TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ADD COLUMN is_read   BOOLEAN NOT NULL DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          TEXT PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_name   TEXT NOT NULL DEFAULT '',
  user_role   TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id   TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  chain_hash  TEXT
);
CREATE INDEX IF NOT EXISTS idx_al_ts     ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_al_entity ON public.audit_logs(entity_type, entity_id);
-- Defensive: user_agent, chain_hash not in old schema
DO $$ BEGIN ALTER TABLE public.audit_logs ADD COLUMN user_agent TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.audit_logs ADD COLUMN chain_hash TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.simulated_logs (
  id        TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  source    TEXT NOT NULL,
  event     TEXT NOT NULL,
  severity  TEXT NOT NULL DEFAULT 'Low',
  details   TEXT NOT NULL DEFAULT '',
  indicator TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sl_ts ON public.simulated_logs(timestamp DESC);
-- Defensive: indicator not in all prior schemas
DO $$ BEGIN ALTER TABLE public.simulated_logs ADD COLUMN indicator TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ================================================================================
-- § 5 — CRITICAL ASSETS & PHYSICAL SECURITY
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.critical_assets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sector      TEXT NOT NULL DEFAULT 'government',
  owner       TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  risk_score  INTEGER NOT NULL DEFAULT 50,
  criticality TEXT NOT NULL DEFAULT 'Medium',
  status      TEXT NOT NULL DEFAULT 'Operational',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_assets_upd ON public.critical_assets;
CREATE TRIGGER trg_assets_upd BEFORE UPDATE ON public.critical_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sites (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  location       TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  org_id         TEXT NOT NULL,
  security_level TEXT NOT NULL DEFAULT 'Standard'
);

CREATE TABLE IF NOT EXISTS public.cameras (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  rtsp_url           TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'Online',
  site_id            TEXT NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  is_recording       BOOLEAN NOT NULL DEFAULT FALSE,
  ai_detection_flags JSONB NOT NULL DEFAULT '[]',
  resolution         TEXT NOT NULL DEFAULT '1080p',
  model              TEXT NOT NULL DEFAULT 'LIT-Eye Standard',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_events (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity  TEXT NOT NULL DEFAULT 'Low',
  location  TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'Active',
  details   TEXT NOT NULL DEFAULT '',
  camera_id TEXT REFERENCES public.cameras(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_se_ts ON public.security_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS public.access_logs (
  id          TEXT PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_name TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL DEFAULT '',
  user_name   TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Granted'
);

-- ================================================================================
-- § 6 — TELECOM & SOCIAL MEDIA
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.telecom_alerts (
  id                 TEXT PRIMARY KEY,
  timestamp          TIMESTAMPTZ NOT NULL DEFAULT now(),
  type               TEXT NOT NULL DEFAULT 'Fraud Report',
  source             TEXT NOT NULL DEFAULT 'Manual',
  phone_number       TEXT NOT NULL DEFAULT '',
  details            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'Active',
  linked_incident_id TEXT REFERENCES public.incidents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ta_ts    ON public.telecom_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ta_phone ON public.telecom_alerts(phone_number);
-- Defensive: old schema had 'alert_type' not 'type', and no linked_incident_id
DO $$ BEGIN ALTER TABLE public.telecom_alerts ADD COLUMN status             TEXT NOT NULL DEFAULT 'Active'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.telecom_alerts ADD COLUMN type               TEXT NOT NULL DEFAULT 'Fraud Report'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.telecom_alerts ADD COLUMN source             TEXT NOT NULL DEFAULT 'Manual'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.telecom_alerts ADD COLUMN linked_incident_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
-- Index on status after column guaranteed
CREATE INDEX IF NOT EXISTS idx_ta_status ON public.telecom_alerts(status);

CREATE TABLE IF NOT EXISTS public.social_signals (
  id              TEXT PRIMARY KEY,
  platform        TEXT NOT NULL DEFAULT 'simulated',
  signal_type     TEXT NOT NULL DEFAULT 'scam',
  post_id         TEXT,
  post_url        TEXT,
  author_handle   TEXT NOT NULL DEFAULT '',
  author_url      TEXT NOT NULL DEFAULT '',
  content_preview TEXT NOT NULL DEFAULT '',
  victim_handle   TEXT NOT NULL DEFAULT '',
  keywords_hit    JSONB NOT NULL DEFAULT '[]',
  ai_severity     TEXT NOT NULL DEFAULT 'Medium',
  ai_summary      TEXT NOT NULL DEFAULT '',
  ai_action       TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'New',
  incident_id     TEXT REFERENCES public.incidents(id) ON DELETE SET NULL,
  reviewed_by     TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ss_ts       ON public.social_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_platform ON public.social_signals(platform);
-- Defensive: old schema may not have all new columns
DO $$ BEGIN ALTER TABLE public.social_signals ADD COLUMN post_id     TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_signals ADD COLUMN post_url    TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_signals ADD COLUMN ai_summary  TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_signals ADD COLUMN ai_action   TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_signals ADD COLUMN reviewed_by TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_signals ADD COLUMN notes       TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_ss_upd ON public.social_signals;
CREATE TRIGGER trg_ss_upd BEFORE UPDATE ON public.social_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.social_keywords (
  id         TEXT PRIMARY KEY,
  keyword    TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL DEFAULT 'general',
  severity   TEXT NOT NULL DEFAULT 'Medium',
  platforms  JSONB NOT NULL DEFAULT '["twitter","facebook","tiktok"]',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_platform_config (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  api_key_set   BOOLEAN NOT NULL DEFAULT FALSE,
  scan_interval INTEGER NOT NULL DEFAULT 15,
  last_scan_at  TIMESTAMPTZ,
  total_signals INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================================
-- § 7 — EDR / ENDPOINT
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.endpoint_agents (
  agent_id      TEXT PRIMARY KEY,
  organization  TEXT NOT NULL DEFAULT '',
  sector        TEXT NOT NULL DEFAULT '',
  hostname      TEXT NOT NULL DEFAULT '',
  ip_address    TEXT NOT NULL DEFAULT '',   -- used by SQLite/internal
  ip            TEXT NOT NULL DEFAULT '',   -- used by supabase-client.ts
  os            TEXT NOT NULL DEFAULT '',
  version       TEXT NOT NULL DEFAULT '1.0.0',
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Defensive: 'ip' column added v2.2 (supabase-client uses 'ip' not 'ip_address')
DO $$ BEGIN ALTER TABLE public.endpoint_agents ADD COLUMN ip TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- endpoints — separate from endpoint_agents, used by supabase-client.ts EDR sync
CREATE TABLE IF NOT EXISTS public.endpoints (
  id                  TEXT PRIMARY KEY,
  hostname            TEXT NOT NULL,
  ip                  TEXT NOT NULL DEFAULT '',
  mac                 TEXT,
  os                  TEXT NOT NULL DEFAULT '',
  version             TEXT,
  agent_version       TEXT,
  status              TEXT NOT NULL DEFAULT 'ONLINE',
  last_seen           TIMESTAMPTZ NOT NULL DEFAULT now(),
  organization        TEXT NOT NULL DEFAULT '',
  sector              TEXT NOT NULL DEFAULT '',
  tags                JSONB NOT NULL DEFAULT '[]',
  risk_score          INTEGER NOT NULL DEFAULT 0,
  vulnerabilities     JSONB NOT NULL DEFAULT '[]',
  processes           JSONB NOT NULL DEFAULT '[]',
  network_connections JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_ep_org    ON public.endpoints(organization);
CREATE INDEX IF NOT EXISTS idx_ep_status ON public.endpoints(status);

CREATE TABLE IF NOT EXISTS public.agent_commands (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES public.endpoint_agents(agent_id) ON DELETE CASCADE,
  command     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'PENDING',
  issued_by   TEXT,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.quarantine_log (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES public.endpoint_agents(agent_id) ON DELETE CASCADE,
  file_hash      TEXT NOT NULL,
  file_path      TEXT NOT NULL DEFAULT '',
  organization   TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'QUARANTINED',
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ql_hash ON public.quarantine_log(file_hash);

CREATE TABLE IF NOT EXISTS public.suspicious_activities (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES public.endpoint_agents(agent_id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'BEHAVIORAL',
  data        JSONB NOT NULL DEFAULT '{}',
  risk_score  INTEGER NOT NULL DEFAULT 0,
  confidence  REAL NOT NULL DEFAULT 0.8,
  status      TEXT NOT NULL DEFAULT 'OPEN',
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,  -- used by supabase-client.ts
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Defensive: status + resolved not present in some old schemas
DO $$ BEGIN ALTER TABLE public.suspicious_activities ADD COLUMN status   TEXT    NOT NULL DEFAULT 'OPEN'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.suspicious_activities ADD COLUMN resolved BOOLEAN NOT NULL DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
-- Indexes after columns are guaranteed present
CREATE INDEX IF NOT EXISTS idx_sa_status ON public.suspicious_activities(status);
CREATE INDEX IF NOT EXISTS idx_sa_agent  ON public.suspicious_activities(agent_id);

-- ================================================================================
-- § 8 — POLICY ENGINE  (used by supabase-client.ts)
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.security_policies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sector      TEXT NOT NULL DEFAULT 'all',
  category    TEXT NOT NULL DEFAULT 'DETECTION',
  rules       JSONB NOT NULL DEFAULT '[]',
  actions     JSONB NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  priority    INTEGER NOT NULL DEFAULT 50,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_pol_upd ON public.security_policies;
CREATE TRIGGER trg_pol_upd BEFORE UPDATE ON public.security_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.policy_deployments (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  policy_id   TEXT NOT NULL REFERENCES public.security_policies(id) ON DELETE CASCADE,
  sector      TEXT NOT NULL DEFAULT 'all',
  deployed_by TEXT,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'DEPLOYED'
);
CREATE INDEX IF NOT EXISTS idx_pd_policy ON public.policy_deployments(policy_id);

-- ================================================================================
-- § 9 — TAKEDOWN TRACKER  (used by supabase-client.ts)
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.takedown_requests (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL DEFAULT 'DOMAIN',
  target       TEXT NOT NULL,
  description  TEXT,
  evidence     TEXT,
  reason       TEXT,
  category     TEXT,
  status       TEXT NOT NULL DEFAULT 'PENDING',
  priority     TEXT NOT NULL DEFAULT 'HIGH',
  submitted_by TEXT NOT NULL DEFAULT 'system',
  organization TEXT,
  assigned_to  TEXT,
  notes        TEXT,
  incident_id  TEXT REFERENCES public.incidents(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at  TIMESTAMPTZ,
  actioned_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_td_status ON public.takedown_requests(status);

-- ================================================================================
-- § 10 — REPUTATION  (used by supabase-client.ts)
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.malawi_reputation (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  type             TEXT NOT NULL DEFAULT 'IP',
  value            TEXT NOT NULL UNIQUE,
  score            INTEGER NOT NULL DEFAULT 0,
  reputation       INTEGER NOT NULL DEFAULT 0,
  confidence       REAL NOT NULL DEFAULT 0.5,
  risk_level       TEXT NOT NULL DEFAULT 'CLEAN',
  category         TEXT,
  source           TEXT,
  is_blocked       BOOLEAN NOT NULL DEFAULT FALSE,
  is_malawi_asn    BOOLEAN NOT NULL DEFAULT FALSE,
  is_malawi_domain BOOLEAN NOT NULL DEFAULT FALSE,
  geo_country      TEXT,
  geo_isp          TEXT,
  typosquat_of     TEXT,
  mw_carrier       TEXT,
  flags            JSONB NOT NULL DEFAULT '[]',
  incident_count   INTEGER NOT NULL DEFAULT 0,
  telecom_alerts   INTEGER NOT NULL DEFAULT 0,
  total_reports    INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rep_value ON public.malawi_reputation(value);
CREATE INDEX IF NOT EXISTS idx_rep_type  ON public.malawi_reputation(type);

-- ================================================================================
-- § 11 — STIX / SHARING  (used by supabase-client.ts → "sharing_requests" table)
-- ================================================================================

-- The app writes to "sharing_requests" (not stix_sharing_log)
CREATE TABLE IF NOT EXISTS public.sharing_requests (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL DEFAULT 'EXPORT',
  format       TEXT NOT NULL DEFAULT 'STIX_2_1',
  data         TEXT,
  source       TEXT NOT NULL DEFAULT 'LitSecure',
  destination  TEXT NOT NULL DEFAULT 'API Consumer',
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'SENT',
  object_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sr_ts ON public.sharing_requests(timestamp DESC);

-- ================================================================================
-- § 12 — MISC
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.seed_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ================================================================================
-- § 13 — ROW LEVEL SECURITY
-- ================================================================================

-- Helper: read role from JWT (set by app via custom claims or header)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN coalesce(
    nullif(current_setting('request.jwt.claims', TRUE), '')::jsonb ->> 'role',
    'anonymous'
  );
EXCEPTION WHEN OTHERS THEN RETURN 'anonymous';
END;
$$;

-- public.users: RLS intentionally OFF — app uses its own JWT auth layer
ALTER TABLE public.incidents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telecom_alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_agents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspicious_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_policies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takedown_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.malawi_reputation    ENABLE ROW LEVEL SECURITY;

-- ── Incidents ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS inc_staff ON public.incidents;
CREATE POLICY inc_staff ON public.incidents
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst','auditor'
  ));

-- ── Audit logs — auditors and admins only ────────────────────────────────────────
DROP POLICY IF EXISTS al_view ON public.audit_logs;
CREATE POLICY al_view ON public.audit_logs FOR SELECT
  USING (public.current_user_role() IN (
    'admin','super_admin','auditor','soc_manager','gov_admin'
  ));

-- ── Notifications — each role sees its own ───────────────────────────────────────
DROP POLICY IF EXISTS notif_role ON public.notifications;
CREATE POLICY notif_role ON public.notifications FOR SELECT
  USING (roles @> to_jsonb(public.current_user_role()));

-- ── Threat intel — read: any auth; write: analyst+ ───────────────────────────────
DROP POLICY IF EXISTS ti_read  ON public.threat_intel;
DROP POLICY IF EXISTS ti_write ON public.threat_intel;
CREATE POLICY ti_read ON public.threat_intel FOR SELECT
  USING (public.current_user_role() != 'anonymous');
CREATE POLICY ti_write ON public.threat_intel FOR INSERT
  WITH CHECK (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── Watchlist: analyst+ ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS wl_view ON public.watchlist;
CREATE POLICY wl_view ON public.watchlist
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── Telecom alerts: investigator+ ────────────────────────────────────────────────
DROP POLICY IF EXISTS ta_view ON public.telecom_alerts;
CREATE POLICY ta_view ON public.telecom_alerts FOR SELECT
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── Social signals: analyst+ ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS ss_view ON public.social_signals;
CREATE POLICY ss_view ON public.social_signals FOR SELECT
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── EDR: soc_manager+ ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS edr_view ON public.endpoint_agents;
CREATE POLICY edr_view ON public.endpoint_agents FOR SELECT
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));
DROP POLICY IF EXISTS sa_view ON public.suspicious_activities;
CREATE POLICY sa_view ON public.suspicious_activities FOR SELECT
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── Policies & takedowns: analyst+ ───────────────────────────────────────────────
DROP POLICY IF EXISTS pol_view ON public.security_policies;
CREATE POLICY pol_view ON public.security_policies
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst','auditor'
  ));
DROP POLICY IF EXISTS td_view ON public.takedown_requests;
CREATE POLICY td_view ON public.takedown_requests
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── Reputation: analyst+ ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rep_view ON public.malawi_reputation;
CREATE POLICY rep_view ON public.malawi_reputation
  USING (public.current_user_role() IN (
    'admin','super_admin','soc_manager','gov_admin','investigator','analyst'
  ));

-- ── Users: RLS disabled — app uses its own JWT auth, not Supabase Auth ──────────
-- The u_self policy caused uuid=text type mismatch because Supabase resolves
-- users.id as UUID (auth.users type) when public.users doesn't exist yet.
-- The app's server enforces per-user access via JWT middleware — no DB-level RLS needed.
DROP POLICY IF EXISTS u_admin ON public.users;
DROP POLICY IF EXISTS u_self  ON public.users;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- ================================================================================
-- § 14 — SUPABASE REALTIME
-- ================================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE t TEXT;
  tbls TEXT[] := ARRAY[
    'incidents','notifications','threat_intel','telecom_alerts',
    'social_signals','suspicious_activities','endpoint_agents',
    'audit_logs','campaigns','security_events'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ================================================================================
-- § 15 — VIEWS
-- ================================================================================

CREATE OR REPLACE VIEW public.vw_incident_stats AS
SELECT
  COUNT(*)                                                     AS "totalIncidents",
  COUNT(*) FILTER (WHERE status = 'Reported')                  AS "reportedCount",
  COUNT(*) FILTER (WHERE status = 'Investigating')             AS "investigatingCount",
  COUNT(*) FILTER (WHERE status = 'Contained')                 AS "containedCount",
  COUNT(*) FILTER (WHERE status = 'Resolved')                  AS "resolvedCount",
  COUNT(*) FILTER (WHERE severity = 'Critical')                AS "criticalCount",
  COUNT(*) FILTER (WHERE status NOT IN ('Resolved','Closed','Contained')) AS "activeAlerts"
FROM public.incidents;

CREATE OR REPLACE VIEW public.vw_sector_risk AS
SELECT
  sector,
  COUNT(*)                                         AS total_incidents,
  COUNT(*) FILTER (WHERE severity = 'Critical')    AS critical_count,
  COUNT(*) FILTER (WHERE status NOT IN ('Resolved','Closed')) AS active_count,
  ROUND(AVG(priority_score))                       AS avg_priority
FROM public.incidents
WHERE sector IS NOT NULL AND sector != ''
GROUP BY sector;

-- ================================================================================
-- § 16 — SEED META
-- ================================================================================

INSERT INTO public.seed_meta (key, value) VALUES
  ('supabase_schema_version', '2.3'),
  ('applied_at', now()::TEXT)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ================================================================================
-- DONE — v2.2 applied successfully
-- ================================================================================
-- POST-RUN STEPS:
--   1. Supabase Dashboard → Auth → Settings → copy JWT Secret → .env.local JWT_SECRET
--   2. Dashboard → Settings → API → copy SUPABASE_URL + SUPABASE_ANON_KEY + SERVICE_ROLE_KEY
--   3. Dashboard → Database → Functions → add scheduled job:
--        SELECT public.cleanup_expired_tokens();  -- every hour
--   4. Confirm Realtime tables in Dashboard → Database → Replication
-- ================================================================================
