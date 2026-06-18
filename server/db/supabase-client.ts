/**
 * LitSecure Sentinel — Server-Side Supabase Client
 * Uses the Service Role key (bypasses RLS) for trusted backend writes.
 * Anon key is used for reads that should respect RLS.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Lazy env readers — read at call time (after dotenv.config runs) ───────────
const getUrl  = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const getSvcKey = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const getAnon   = () => process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

let _adminClient: SupabaseClient | null = null;
let _anonClient:  SupabaseClient | null = null;

export function isSupabaseEnabled(): boolean {
  return !!(getUrl() && getSvcKey());
}

/** Admin client — service role key, bypasses RLS. Use for writes. */
export function getAdminClient(): SupabaseClient | null {
  if (!isSupabaseEnabled()) return null;
  if (!_adminClient) {
    _adminClient = createClient(getUrl(), getSvcKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}

/** Anon client — respects RLS. Use for public reads. */
export function getAnonClient(): SupabaseClient | null {
  if (!getUrl() || !getAnon()) return null;
  if (!_anonClient) {
    _anonClient = createClient(getUrl(), getAnon(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _anonClient;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Look up a user by email from Supabase.
 * Returns the raw row or null. Used as auth fallback when Supabase is configured.
 */
export async function getUserFromSupabase(email: string): Promise<any | null> {
  const client = getAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("users")
      .select("id, full_name, email, phone, password_hash, role, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .single();
    if (error || !data) return null;
    // Normalize to match the SQLite row shape the rest of the app expects
    return {
      id:            data.id,
      full_name:     data.full_name,
      email:         data.email,
      phone:         data.phone,
      password_hash: data.password_hash,
      role:          data.role,
      is_active:     data.is_active ? 1 : 0,
    };
  } catch {
    return null;
  }
}

/** Upsert a single incident row to Supabase. Returns true on success. */
export async function upsertIncidentToSupabase(incident: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("incidents").upsert(incident, { onConflict: "id" });
    if (error) { console.error("[Supabase] upsert incident error:", error.message); return false; }
    return true;
  } catch (err) {
    console.error("[Supabase] upsert exception:", err);
    return false;
  }
}

/** Insert an audit log row to Supabase. Fire-and-forget. */
export async function insertAuditToSupabase(log: Record<string, any>): Promise<void> {
  const client = getAdminClient();
  if (!client) return;
  try {
    await client.from("audit_logs").insert(log);
  } catch {}
}

/** Fetch all incidents from Supabase. Null if unavailable. */
export async function fetchIncidentsFromSupabase(): Promise<any[] | null> {
  const client = getAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[Supabase] fetchIncidents error:", error.message);
      return null;
    }
    return data;
  } catch { return null; }
}

/** Fetch stats counts from Supabase for KPI bar. Returns null on failure. */
export async function fetchStatsFromSupabase(): Promise<Record<string, number> | null> {
  const client = getAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("incidents")
      .select("status, severity");
    if (error || !data) return null;
    return {
      total:         data.length,
      reported:      data.filter(r => r.status === "Reported").length,
      investigating: data.filter(r => r.status === "Investigating").length,
      contained:     data.filter(r => r.status === "Contained").length,
      resolved:      data.filter(r => r.status === "Resolved").length,
      critical:      data.filter(r => r.severity === "Critical").length,
    };
  } catch { return null; }
}

/** Sync SQLite incidents to Supabase (one-time backfill). */
export async function backfillToSupabase(sqliteIncidents: any[]): Promise<number> {
  const client = getAdminClient();
  if (!client || !sqliteIncidents.length) return 0;
  let synced = 0;
  for (const inc of sqliteIncidents) {
    const payload = {
      id:                    inc.id,
      title:                 inc.title,
      description:           inc.description            || "",
      category:              inc.category               || "other",
      severity:              inc.severity               || "Medium",
      status:                inc.status                 || "Reported",
      reporter_name:         inc.reporter_name          || inc.reporterName    || "",
      reporter_org:          inc.reporter_org           || inc.reporterOrg     || "",
      reporter_contact:      inc.reporter_contact       || inc.reporterContact || "",
      assigned_investigator: inc.assigned_investigator  || inc.assignedInvestigator || null,
      mitigation_advice:     inc.mitigation_advice      || inc.mitigationAdvice || "",
      analysis_summary:      inc.analysis_summary       || inc.analysisSummary  || "",
      compromised_indicators: typeof inc.compromised_indicators === "string"
        ? JSON.parse(inc.compromised_indicators)
        : (inc.compromisedIndicators || { phoneNumbers: [], ips: [], domains: [], devices: [] }),
      updates:               typeof inc.updates === "string"
        ? JSON.parse(inc.updates)
        : (inc.updates || []),
      priority_score:        inc.priority_score  ?? inc.priorityScore  ?? 0,
      priority_level:        inc.priority_level  ?? inc.priorityLevel  ?? "LOW",
      priority_factors:      typeof inc.priority_factors === "string"
        ? JSON.parse(inc.priority_factors)
        : (inc.priorityFactors || []),
      affected_users:        inc.affected_users  ?? inc.affectedUsers  ?? 0,
      estimated_loss:        inc.estimated_loss  ?? inc.estimatedLoss  ?? 0,
      sector:                inc.sector          ?? "",
      campaign_id:           inc.campaign_id     ?? inc.campaignId     ?? null,
      ai_confidence:         inc.ai_confidence   ?? inc.aiConfidence   ?? 0,
      incident_date:         inc.incident_date   || inc.incidentDate   || new Date().toISOString(),
      created_at:            inc.created_at      || new Date().toISOString(),
      updated_at:            inc.updated_at      || new Date().toISOString(),
    };
    const ok = await upsertIncidentToSupabase(payload);
    if (ok) synced++;
  }
  return synced;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Policy Engine dual-write helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert a security policy to Supabase. Returns true on success. */
export async function upsertPolicyToSupabase(policy: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("security_policies").upsert(
      {
        id:          policy.id,
        name:        policy.name,
        description: policy.description ?? null,
        sector:      policy.sector      ?? "all",
        category:    policy.category    ?? "DETECTION",
        rules:       typeof policy.rules   === "string" ? policy.rules   : JSON.stringify(policy.rules   ?? []),
        actions:     typeof policy.actions === "string" ? policy.actions : JSON.stringify(policy.actions ?? []),
        status:      policy.status      ?? "ACTIVE",
        priority:    policy.priority    ?? 50,
        created_by:  policy.created_by  ?? null,
        created_at:  policy.created_at  || new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) { console.error("[Supabase] upsert policy error:", error.message); return false; }
    return true;
  } catch (err) {
    console.error("[Supabase] upsertPolicy exception:", err);
    return false;
  }
}

/** Delete a security policy from Supabase by id. */
export async function deletePolicyFromSupabase(id: string): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("security_policies").delete().eq("id", id);
    if (error) { console.error("[Supabase] delete policy error:", error.message); return false; }
    return true;
  } catch { return false; }
}

/** Insert a policy deployment record to Supabase. */
export async function insertPolicyDeploymentToSupabase(deployment: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("policy_deployments").insert({
      policy_id:   deployment.policy_id,
      sector:      deployment.sector,
      deployed_by: deployment.deployed_by ?? null,
      deployed_at: deployment.deployed_at || new Date().toISOString(),
      status:      deployment.status      ?? "DEPLOYED",
    });
    if (error) { console.error("[Supabase] insert policy_deployment error:", error.message); return false; }
    return true;
  } catch { return false; }
}

/** Upsert a takedown request to Supabase. */
export async function upsertTakedownToSupabase(req: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("takedown_requests").upsert(
      {
        id:           req.id,
        type:         req.type,
        target:       req.target,
        description:  req.description   ?? null,
        evidence:     req.evidence      ?? null,
        reason:       req.reason        ?? null,
        category:     req.category      ?? null,
        status:       req.status        ?? "PENDING",
        priority:     req.priority      ?? "HIGH",
        submitted_by: req.submitted_by  || req.requester || "system",
        organization: req.organization  ?? null,
        assigned_to:  req.assigned_to   ?? null,
        notes:        req.notes         ?? null,
        incident_id:  req.incident_id   ?? null,
        submitted_at: req.submitted_at  || new Date().toISOString(),
        approved_at:  req.approved_at   ?? null,
        actioned_at:  req.actioned_at   ?? null,
        completed_at: req.completed_at  ?? null,
      },
      { onConflict: "id" }
    );
    if (error) { console.error("[Supabase] upsert takedown error:", error.message); return false; }
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Reputation dual-write
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert a reputation lookup result to Supabase (IP, domain, or phone). */
export async function upsertReputationToSupabase(entry: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("malawi_reputation").upsert(
      {
        type:             entry.type,
        value:            entry.value,
        score:            entry.score          ?? 0,
        reputation:       entry.reputation     ?? entry.score ?? 0,
        confidence:       entry.confidence     ?? 0.5,
        risk_level:       entry.riskLevel      ?? entry.risk_level ?? "CLEAN",
        category:         entry.category       ?? null,
        source:           entry.source         ?? null,
        is_blocked:       !!entry.isBlocked,
        is_malawi_asn:    !!entry.isMalawiASN,
        is_malawi_domain: !!entry.isMalawiDomain,
        geo_country:      entry.geo?.country   ?? null,
        geo_isp:          entry.geo?.isp       ?? null,
        typosquat_of:     entry.typosquatOf    ?? null,
        mw_carrier:       entry.carrier        ?? null,
        flags:            typeof entry.flags === "string" ? entry.flags : JSON.stringify(entry.flags ?? []),
        incident_count:   entry.incidentCount  ?? 0,
        telecom_alerts:   entry.telecomAlerts  ?? 0,
        total_reports:    entry.totalReports   ?? 0,
        notes:            entry.notes          ?? null,
        first_seen:       entry.firstSeen      || new Date().toISOString(),
        last_seen:        new Date().toISOString(),
      },
      { onConflict: "value" }
    );
    if (error) { console.error("[Supabase] upsert reputation error:", error.message); return false; }
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: STIX/TAXII sharing log
// ─────────────────────────────────────────────────────────────────────────────

/** Log a STIX bundle export or import event to Supabase. Fire-and-forget. */
export async function insertSharingRequestToSupabase(entry: {
  type:         string;
  format:       string;
  source:       string;
  destination:  string;
  object_count: number;
  status:       string;
}): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("sharing_requests").insert({
      id:           `sr-${Date.now()}`,
      type:         entry.type,
      format:       entry.format,
      data:         `${entry.object_count} objects`,
      source:       entry.source,
      destination:  entry.destination,
      timestamp:    new Date().toISOString(),
      status:       entry.status,
      object_count: entry.object_count,
    });
    if (error) { console.error("[Supabase] insert sharing_request error:", error.message); return false; }
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: EDR / Endpoint Agent dual-write
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert an endpoint agent registration to Supabase. */
export async function upsertEndpointAgentToSupabase(agent: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("endpoint_agents").upsert(
      {
        agent_id:      agent.agent_id,
        organization:  agent.organization,
        sector:        agent.sector,
        hostname:      agent.hostname,
        ip:            agent.ip,
        os:            agent.os,
        version:       agent.version       ?? null,
        registered_at: agent.registered_at || new Date().toISOString(),
        last_seen:     new Date().toISOString(),
        status:        agent.status        ?? "ACTIVE",
      },
      { onConflict: "agent_id" }
    );
    if (error) { console.error("[Supabase] upsert endpoint_agent error:", error.message); return false; }
    return true;
  } catch { return false; }
}

/** Insert a suspicious activity event to Supabase. Fire-and-forget. */
export async function insertSuspiciousActivityToSupabase(event: Record<string, any>): Promise<void> {
  const client = getAdminClient();
  if (!client) return;
  try {
    await client.from("suspicious_activities").insert({
      agent_id:    event.agent_id,
      type:        event.type,
      data:        typeof event.data === "string" ? event.data : JSON.stringify(event.data),
      risk_score:  event.risk_score  ?? null,
      confidence:  event.confidence  ?? null,
      detected_at: event.detected_at || new Date().toISOString(),
      resolved:    false,
    });
  } catch {}
}

/** Upsert an EDR-managed endpoint to Supabase. */
export async function upsertEndpointToSupabase(endpoint: Record<string, any>): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from("endpoints").upsert(
      {
        id:                  endpoint.id,
        hostname:            endpoint.hostname,
        ip:                  endpoint.ip,
        mac:                 endpoint.mac              ?? null,
        os:                  endpoint.os,
        version:             endpoint.version          ?? null,
        agent_version:       endpoint.agent_version    ?? null,
        status:              endpoint.status           ?? "ONLINE",
        last_seen:           new Date().toISOString(),
        organization:        endpoint.organization,
        sector:              endpoint.sector,
        tags:                typeof endpoint.tags === "string"
          ? endpoint.tags : JSON.stringify(endpoint.tags ?? []),
        risk_score:          endpoint.risk_score       ?? 0,
        vulnerabilities:     typeof endpoint.vulnerabilities === "string"
          ? endpoint.vulnerabilities : JSON.stringify(endpoint.vulnerabilities ?? []),
        processes:           typeof endpoint.processes === "string"
          ? endpoint.processes : JSON.stringify(endpoint.processes ?? []),
        network_connections: typeof endpoint.network_connections === "string"
          ? endpoint.network_connections : JSON.stringify(endpoint.network_connections ?? []),
      },
      { onConflict: "id" }
    );
    if (error) { console.error("[Supabase] upsert endpoint error:", error.message); return false; }
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk backfill helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Backfill all security_policies from SQLite to Supabase. */
export async function backfillPoliciesToSupabase(policies: any[]): Promise<number> {
  let synced = 0;
  for (const p of policies) { if (await upsertPolicyToSupabase(p)) synced++; }
  console.log(`[Supabase] backfill policies: ${synced}/${policies.length}`);
  return synced;
}

/** Backfill takedown_requests from local state to Supabase. */
export async function backfillTakedownsToSupabase(requests: any[]): Promise<number> {
  let synced = 0;
  for (const r of requests) { if (await upsertTakedownToSupabase(r)) synced++; }
  console.log(`[Supabase] backfill takedowns: ${synced}/${requests.length}`);
  return synced;
}

/** Backfill reputation entries from SQLite to Supabase. */
export async function backfillReputationToSupabase(entries: any[]): Promise<number> {
  let synced = 0;
  for (const e of entries) { if (await upsertReputationToSupabase(e)) synced++; }
  console.log(`[Supabase] backfill reputation: ${synced}/${entries.length}`);
  return synced;
}
