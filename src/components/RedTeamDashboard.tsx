import React, { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AttackCategory = "CREDENTIAL_STUFFING" | "API_FUZZING" | "ENDPOINT_SCANNING" | "CHAOS_HTTP" | "EXFIL_PROBE" | "PROMPT_INJECTION";
type AttackResult   = "BLOCKED" | "DETECTED" | "PASSED" | "ERROR";
type AITestCategory = "JAILBREAK" | "PROMPT_INJECTION" | "DATA_LEAKAGE" | "POLICY_REGRESSION" | "ADVERSARIAL_EVOLUTION";
type AITestResult   = "SAFE" | "BYPASS" | "DEGRADED" | "ERROR";

interface AttackRecord {
  id:         string;
  category:   AttackCategory;
  target:     string;
  payload?:   string;
  statusCode: number | null;
  result:     AttackResult;
  latencyMs:  number;
  detail:     string;
  timestamp:  string;
}

interface RedTeamStats {
  total:     number;
  blocked:   number;
  detected:  number;
  passed:    number;
  errors:    number;
  blockRate: number;
  byCategory: { category: string; count: number; findings: number }[];
  lastRun:   string | null;
}

interface AITestRecord {
  id:        string;
  category:  AITestCategory;
  prompt:    string;
  response?: string;
  result:    AITestResult;
  latencyMs: number;
  detail:    string;
  timestamp: string;
}

interface AIStats {
  total:     number;
  safe:      number;
  bypasses:  number;
  degraded:  number;
  errors:    number;
  safeRate:  number;
  byCategory: { category: string; count: number; bypasses: number }[];
  lastRun:   string | null;
}

interface AnomalyProfile {
  userId:         string | null;
  ip:             string;
  windowStart:    string;
  requests:       number;
  failedAuths:    number;
  bytesRead:      number;
  privilegeOps:   number;
  offHoursHits:   number;
  uniqueEndpoints: number;
  anomalyScore:   number;
  alerts:         { type: string; score: number; detail: string; timestamp: string }[];
}

interface EmergencyState {
  readOnly:    boolean;
  killSwitch:  boolean;
  activatedBy?: string;
  activatedAt?: string;
  reason?:     string;
  tenantLocks: string[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const cyberFetch = async (path: string, opts?: RequestInit) => {
  const token = localStorage.getItem("sentinel_token");
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
};

const RESULT_COLORS: Record<AttackResult, string> = {
  BLOCKED:  "var(--color-green)",
  DETECTED: "var(--color-yellow)",
  PASSED:   "var(--color-red)",
  ERROR:    "var(--color-muted)",
};

const AI_RESULT_COLORS: Record<AITestResult, string> = {
  SAFE:     "var(--color-green)",
  BYPASS:   "var(--color-red)",
  DEGRADED: "var(--color-yellow)",
  ERROR:    "var(--color-muted)",
};

const CATEGORY_ICONS: Record<string, string> = {
  CREDENTIAL_STUFFING:   "🔐",
  API_FUZZING:           "🧬",
  ENDPOINT_SCANNING:     "🔭",
  CHAOS_HTTP:            "💥",
  EXFIL_PROBE:           "📤",
  PROMPT_INJECTION:      "🧠",
  JAILBREAK:             "🔓",
  DATA_LEAKAGE:          "💧",
  POLICY_REGRESSION:     "📋",
  ADVERSARIAL_EVOLUTION: "🦠",
};

function scoreColor(score: number): string {
  if (score >= 75) return "var(--color-red)";
  if (score >= 40) return "var(--color-yellow)";
  return "var(--color-green)";
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon?: string }> = ({ label, value, sub, color, icon }) => (
  <div className="rt-stat-card">
    {icon && <span className="rt-stat-icon">{icon}</span>}
    <div className="rt-stat-value" style={color ? { color } : {}}>{value}</div>
    <div className="rt-stat-label">{label}</div>
    {sub && <div className="rt-stat-sub">{sub}</div>}
  </div>
);

const ResultBadge: React.FC<{ result: AttackResult | AITestResult }> = ({ result }) => {
  const isAI = ["SAFE","BYPASS","DEGRADED"].includes(result);
  const color = isAI
    ? AI_RESULT_COLORS[result as AITestResult]
    : RESULT_COLORS[result as AttackResult];
  return (
    <span className="rt-badge" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {result}
    </span>
  );
};

// ─── Red Team Engine Tab ───────────────────────────────────────────────────────
const RedTeamEngineTab: React.FC = () => {
  const [stats,   setStats]   = useState<RedTeamStats | null>(null);
  const [results, setResults] = useState<AttackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("ALL");

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        cyberFetch("/api/redteam/stats"),
        cyberFetch("/api/redteam/results?limit=150"),
      ]);
      setStats(s);
      setResults(r.results || []);
    } catch { /* silently fail on load */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const trigger = async () => {
    setTriggering(true);
    try { await cyberFetch("/api/redteam/trigger", { method: "POST" }); }
    catch { /* admin only — may fail */ }
    finally { setTimeout(() => { setTriggering(false); load(); }, 3000); }
  };

  const filtered = filterCat === "ALL" ? results : results.filter(r => r.category === filterCat);
  const categories = ["ALL", "CREDENTIAL_STUFFING", "API_FUZZING", "ENDPOINT_SCANNING", "CHAOS_HTTP", "EXFIL_PROBE"];

  if (loading) return <div className="rt-loading">🔴 Connecting to Red Team Engine...</div>;

  return (
    <div className="rt-tab-content">
      {/* Stats row */}
      {stats && (
        <div className="rt-stats-grid">
          <StatCard label="Total Attacks" value={stats.total} icon="⚔️" />
          <StatCard label="Blocked" value={stats.blocked} color="var(--color-green)" icon="🛡️" />
          <StatCard label="Detected" value={stats.detected} color="var(--color-yellow)" icon="👁️" />
          <StatCard label="Findings" value={stats.passed} color={stats.passed > 0 ? "var(--color-red)" : "var(--color-green)"} icon="🚨" />
          <StatCard label="Block Rate" value={`${stats.blockRate}%`} color={stats.blockRate >= 90 ? "var(--color-green)" : "var(--color-red)"} icon="📊" />
          <StatCard label="Last Run" value={stats.lastRun ? timeSince(stats.lastRun) : "—"} icon="🕐" />
        </div>
      )}

      {/* Category breakdown */}
      {stats && (
        <div className="rt-category-grid">
          {stats.byCategory.map(c => (
            <div key={c.category} className="rt-cat-pill" onClick={() => setFilterCat(f => f === c.category ? "ALL" : c.category)} style={{ borderColor: c.findings > 0 ? "var(--color-red)" : "var(--color-border)" }}>
              <span className="rt-cat-icon">{CATEGORY_ICONS[c.category] || "🎯"}</span>
              <span className="rt-cat-name">{c.category.replace(/_/g, " ")}</span>
              <span className="rt-cat-count">{c.count}</span>
              {c.findings > 0 && <span className="rt-cat-finding">⚠️ {c.findings}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="rt-controls">
        <div className="rt-filter-tabs">
          {categories.map(c => (
            <button key={c} className={`rt-filter-btn ${filterCat === c ? "active" : ""}`} onClick={() => setFilterCat(c)}>
              {CATEGORY_ICONS[c] || "🎯"} {c === "ALL" ? "All Attacks" : c.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <button className="rt-trigger-btn" onClick={trigger} disabled={triggering}>
          {triggering ? "🔄 Running..." : "🔴 Trigger Suite Now"}
        </button>
      </div>

      {/* Results table */}
      <div className="rt-results-table">
        <div className="rt-table-header">
          <span>Result</span><span>Category</span><span>Target</span><span>Code</span><span>Latency</span><span>Detail</span><span>Time</span>
        </div>
        {filtered.slice(0, 80).map(r => (
          <div key={r.id} className={`rt-table-row ${r.result === "PASSED" ? "rt-finding" : ""}`}>
            <span><ResultBadge result={r.result} /></span>
            <span className="rt-cat-label">{CATEGORY_ICONS[r.category]} {r.category.replace(/_/g," ")}</span>
            <span className="rt-mono">{r.target}</span>
            <span className="rt-code" style={{ color: r.statusCode && r.statusCode >= 500 ? "var(--color-red)" : r.statusCode === 429 ? "var(--color-yellow)" : "var(--color-muted)" }}>{r.statusCode ?? "—"}</span>
            <span className="rt-muted">{r.latencyMs}ms</span>
            <span className="rt-detail">{r.detail}</span>
            <span className="rt-muted rt-ts">{timeSince(r.timestamp)}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rt-empty">No results yet — engine runs 30s after server start, then every 10 minutes.</div>
        )}
      </div>
    </div>
  );
};

// ─── Adversarial AI Tab ────────────────────────────────────────────────────────
const AdversarialAITab: React.FC = () => {
  const [stats,   setStats]   = useState<AIStats | null>(null);
  const [results, setResults] = useState<AITestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        cyberFetch("/api/redteam/ai/stats"),
        cyberFetch("/api/redteam/ai?limit=100"),
      ]);
      setStats(s);
      setResults(r.results || []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const trigger = async () => {
    setTriggering(true);
    try { await cyberFetch("/api/redteam/ai/trigger", { method: "POST" }); }
    catch { }
    finally { setTimeout(() => { setTriggering(false); load(); }, 3000); }
  };

  if (loading) return <div className="rt-loading">🤖 Connecting to Adversarial AI Engine...</div>;

  return (
    <div className="rt-tab-content">
      {stats && (
        <div className="rt-stats-grid">
          <StatCard label="Tests Run" value={stats.total} icon="🧪" />
          <StatCard label="Safe" value={stats.safe} color="var(--color-green)" icon="✅" />
          <StatCard label="Bypasses" value={stats.bypasses} color={stats.bypasses > 0 ? "var(--color-red)" : "var(--color-green)"} icon="🔓" />
          <StatCard label="Degraded" value={stats.degraded} color="var(--color-yellow)" icon="⚠️" />
          <StatCard label="AI Safety Rate" value={`${stats.safeRate}%`} color={stats.safeRate >= 95 ? "var(--color-green)" : stats.safeRate >= 80 ? "var(--color-yellow)" : "var(--color-red)"} icon="🛡️" />
          <StatCard label="Last Run" value={stats.lastRun ? timeSince(stats.lastRun) : "—"} icon="🕐" />
        </div>
      )}

      {stats && (
        <div className="rt-category-grid">
          {stats.byCategory.map(c => (
            <div key={c.category} className="rt-cat-pill" style={{ borderColor: c.bypasses > 0 ? "var(--color-red)" : "var(--color-border)" }}>
              <span className="rt-cat-icon">{CATEGORY_ICONS[c.category] || "🤖"}</span>
              <span className="rt-cat-name">{c.category.replace(/_/g, " ")}</span>
              <span className="rt-cat-count">{c.count}</span>
              {c.bypasses > 0 && <span className="rt-cat-finding">🔓 {c.bypasses}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="rt-controls">
        <div />
        <button className="rt-trigger-btn rt-trigger-ai" onClick={trigger} disabled={triggering}>
          {triggering ? "🔄 Testing..." : "🤖 Run AI Test Suite Now"}
        </button>
      </div>

      <div className="rt-results-table">
        <div className="rt-table-header">
          <span>Result</span><span>Category</span><span>Prompt (truncated)</span><span>Latency</span><span>Detail</span><span>Time</span>
        </div>
        {results.map(r => (
          <React.Fragment key={r.id}>
            <div className={`rt-table-row rt-ai-row ${r.result === "BYPASS" ? "rt-finding" : ""}`} onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
              <span><ResultBadge result={r.result} /></span>
              <span className="rt-cat-label">{CATEGORY_ICONS[r.category]} {r.category.replace(/_/g," ")}</span>
              <span className="rt-prompt-snippet">{r.prompt.slice(0, 60)}...</span>
              <span className="rt-muted">{r.latencyMs}ms</span>
              <span className="rt-detail">{r.detail}</span>
              <span className="rt-muted rt-ts">{timeSince(r.timestamp)}</span>
            </div>
            {expanded === r.id && (
              <div className="rt-expanded">
                <div><strong>Full Prompt:</strong><pre className="rt-pre">{r.prompt}</pre></div>
                {r.response && <div><strong>AI Response (truncated):</strong><pre className="rt-pre">{r.response}</pre></div>}
              </div>
            )}
          </React.Fragment>
        ))}
        {results.length === 0 && (
          <div className="rt-empty">AI test suite runs 60s after server start, then every 15 minutes.</div>
        )}
      </div>
    </div>
  );
};

// ─── Behavioral Anomaly Tab ────────────────────────────────────────────────────
const AnomalyTab: React.FC = () => {
  const [anomalies, setAnomalies] = useState<AnomalyProfile[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<AnomalyProfile | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await cyberFetch("/api/redteam/anomalies?limit=30");
      setAnomalies(r.anomalies || []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);

  if (loading) return <div className="rt-loading">📡 Loading behavioral profiles...</div>;

  return (
    <div className="rt-tab-content">
      <div className="rt-anomaly-header">
        <span className="rt-anomaly-title">🧬 Behavioral Anomaly Engine — Top Profiles by Risk Score</span>
        <span className="rt-anomaly-sub">Rolling 5-minute windows • Updated every 15s</span>
      </div>

      <div className="rt-anomaly-grid">
        {anomalies.map((a, i) => (
          <div key={i} className={`rt-anomaly-card ${a.anomalyScore >= 75 ? "rt-anomaly-high" : a.anomalyScore >= 40 ? "rt-anomaly-med" : ""}`}
               onClick={() => setSelected(selected === a ? null : a)}>
            <div className="rt-anomaly-score" style={{ color: scoreColor(a.anomalyScore) }}>
              {a.anomalyScore}
              <span className="rt-anomaly-score-label">/100</span>
            </div>
            <div className="rt-anomaly-info">
              <div className="rt-anomaly-identity">
                {a.userId ? `👤 ${a.userId.slice(0,12)}...` : `🌐 ${a.ip}`}
              </div>
              <div className="rt-anomaly-stats-row">
                <span>📨 {a.requests} req</span>
                <span>❌ {a.failedAuths} auth fails</span>
                <span>🔑 {a.privilegeOps} priv ops</span>
              </div>
              <div className="rt-anomaly-stats-row">
                <span>📖 {(a.bytesRead / 1024).toFixed(0)} KB read</span>
                <span>🕐 {a.offHoursHits} off-hrs</span>
                <span>🗺️ {a.uniqueEndpoints} endpoints</span>
              </div>
            </div>
            {a.anomalyScore >= 75 && <div className="rt-anomaly-alert-badge">🚨 HIGH RISK</div>}
          </div>
        ))}
        {anomalies.length === 0 && (
          <div className="rt-empty">No behavioral profiles yet. Traffic must hit /api/* to generate profiles.</div>
        )}
      </div>

      {/* Alert detail drawer */}
      {selected && selected.alerts.length > 0 && (
        <div className="rt-anomaly-detail">
          <div className="rt-anomaly-detail-title">Alert Details — {selected.userId || selected.ip}</div>
          {selected.alerts.map((al, i) => (
            <div key={i} className="rt-anomaly-alert">
              <span className="rt-anomaly-alert-type">{al.type.replace(/_/g," ")}</span>
              <span className="rt-anomaly-alert-score" style={{ color: scoreColor(al.score) }}>+{al.score.toFixed(0)}</span>
              <span className="rt-anomaly-alert-detail">{al.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Break Glass Tab ───────────────────────────────────────────────────────────
const BreakGlassTab: React.FC = () => {
  const [state, setState]       = useState<EmergencyState | null>(null);
  const [loading, setLoading]   = useState(true);
  const [reason, setReason]     = useState("");
  const [tenantId, setTenantId] = useState("");
  const [working, setWorking]   = useState(false);
  const [msg, setMsg]           = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await cyberFetch("/api/break-glass/status");
      setState(r);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  const act = async (endpoint: string, body?: object) => {
    setWorking(true);
    setMsg(null);
    try {
      const r = await cyberFetch(`/api/break-glass/${endpoint}`, {
        method: "POST",
        body:   JSON.stringify({ reason, ...body }),
      });
      setMsg({ text: r.message, type: "ok" });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: "err" });
    } finally { setWorking(false); }
  };

  if (loading) return <div className="rt-loading">🔐 Loading emergency controls...</div>;

  return (
    <div className="rt-tab-content">
      {/* Status Banner */}
      {state && (
        <div className={`rt-bg-status ${state.killSwitch ? "rt-bg-kill" : state.readOnly ? "rt-bg-readonly" : "rt-bg-normal"}`}>
          {state.killSwitch && <><span>🛑</span> KILL SWITCH ACTIVE — All API requests are blocked</>}
          {!state.killSwitch && state.readOnly && <><span>🔒</span> READ-ONLY MODE ACTIVE — Mutations disabled</>}
          {!state.killSwitch && !state.readOnly && <><span>✅</span> SYSTEM NORMAL — All controls deactivated</>}
          {state.activatedBy && <span className="rt-bg-by"> by {state.activatedBy}</span>}
        </div>
      )}

      {state && state.tenantLocks.length > 0 && (
        <div className="rt-bg-locks">
          🔐 Isolated tenants: {state.tenantLocks.join(", ")}
        </div>
      )}

      {/* Feedback message */}
      {msg && (
        <div className={`rt-bg-msg ${msg.type === "ok" ? "rt-bg-msg-ok" : "rt-bg-msg-err"}`}>
          {msg.type === "ok" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* Reason input */}
      <div className="rt-bg-reason">
        <label>Reason / Justification (required for audit log):</label>
        <input
          id="bg-reason-input"
          className="rt-bg-input"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Suspected APT active — isolating until investigation complete"
        />
      </div>

      {/* Controls grid */}
      <div className="rt-bg-controls">
        <div className="rt-bg-control-card rt-bg-card-warn">
          <div className="rt-bg-card-icon">🔒</div>
          <div className="rt-bg-card-title">Read-Only Mode</div>
          <div className="rt-bg-card-desc">Disable all mutation endpoints (POST/PUT/PATCH/DELETE). Read operations continue normally.</div>
          <button id="bg-readonly-btn" className="rt-bg-btn rt-bg-btn-warn" onClick={() => act("readonly-mode")} disabled={working || !reason.trim()}>
            {state?.readOnly ? "Already Active" : "🔒 Activate Read-Only"}
          </button>
        </div>

        <div className="rt-bg-control-card rt-bg-card-danger">
          <div className="rt-bg-card-icon">🛑</div>
          <div className="rt-bg-card-title">API Kill Switch</div>
          <div className="rt-bg-card-desc">Immediately return 503 for ALL API requests. Use during active breach. Admin only.</div>
          <button id="bg-killswitch-btn" className="rt-bg-btn rt-bg-btn-danger" onClick={() => act("kill-switch")} disabled={working || !reason.trim()}>
            {state?.killSwitch ? "Already Active" : "🛑 Activate Kill Switch"}
          </button>
        </div>

        <div className="rt-bg-control-card rt-bg-card-danger">
          <div className="rt-bg-card-icon">🔑</div>
          <div className="rt-bg-card-title">Revoke All Sessions</div>
          <div className="rt-bg-card-desc">Immediately invalidate ALL active JWT sessions. All users must re-authenticate. Admin only.</div>
          <button id="bg-revoke-btn" className="rt-bg-btn rt-bg-btn-danger" onClick={() => act("revoke-all")} disabled={working || !reason.trim()}>
            🔑 Revoke All Sessions
          </button>
        </div>

        <div className="rt-bg-control-card">
          <div className="rt-bg-card-icon">🔐</div>
          <div className="rt-bg-card-title">Isolate Tenant</div>
          <div className="rt-bg-card-desc">Lock a specific user to read-only access immediately. SOC Manager+.</div>
          <input id="bg-tenant-input" className="rt-bg-input rt-bg-input-sm" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="User ID to isolate..." />
          <button id="bg-isolate-btn" className="rt-bg-btn rt-bg-btn-warn" onClick={() => act("tenant-isolate", { userId: tenantId })} disabled={working || !reason.trim() || !tenantId.trim()}>
            🔐 Isolate Tenant
          </button>
        </div>

        <div className="rt-bg-control-card rt-bg-card-green">
          <div className="rt-bg-card-icon">✅</div>
          <div className="rt-bg-card-title">Restore Normal Operation</div>
          <div className="rt-bg-card-desc">Deactivate ALL emergency controls. Re-enable all API mutations. Admin only.</div>
          <button id="bg-restore-btn" className="rt-bg-btn rt-bg-btn-green" onClick={() => act("restore")} disabled={working || !reason.trim()}>
            ✅ Restore Normal Operation
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const RedTeamDashboard: React.FC = () => {
  const [tab, setTab] = useState<"engine" | "ai" | "anomaly" | "breakglass">("engine");

  const tabs = [
    { id: "engine",     label: "🔴 Red Team Engine",      desc: "Live attack simulations" },
    { id: "ai",         label: "🤖 Adversarial AI",        desc: "Jailbreak testing" },
    { id: "anomaly",    label: "🧬 Behavior Anomalies",    desc: "Insider & exfil detection" },
    { id: "breakglass", label: "🚨 Break Glass",           desc: "Emergency controls" },
  ] as const;

  return (
    <div className="redteam-dashboard">
      {/* Header */}
      <div className="rt-header">
        <div className="rt-header-left">
          <div className="rt-header-icon">🎯</div>
          <div>
            <h1 className="rt-header-title">Continuous Adversarial Security Engine</h1>
            <p className="rt-header-sub">Self-testing autonomous cybersecurity — SOC + Red Team simultaneously</p>
          </div>
        </div>
        <div className="rt-pulse-dot">
          <span className="rt-pulse-ring" />
          <span className="rt-pulse-core" />
          LIVE
        </div>
      </div>

      {/* Tabs */}
      <div className="rt-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            id={`rt-tab-${t.id}`}
            className={`rt-tab ${tab === t.id ? "rt-tab-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="rt-tab-label">{t.label}</span>
            <span className="rt-tab-desc">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "engine"     && <RedTeamEngineTab />}
      {tab === "ai"         && <AdversarialAITab />}
      {tab === "anomaly"    && <AnomalyTab />}
      {tab === "breakglass" && <BreakGlassTab />}

      <style>{`
        .redteam-dashboard {
          background: var(--color-bg, #0a0f1e);
          color: var(--color-text, #e2e8f0);
          min-height: 100%;
          font-family: 'Inter', sans-serif;
          padding: 0 0 40px;
        }

        /* ── Header ── */
        .rt-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px 28px 16px;
          border-bottom: 1px solid rgba(255,50,50,0.2);
          background: linear-gradient(135deg, rgba(200,20,20,0.08) 0%, transparent 60%);
        }
        .rt-header-left { display: flex; align-items: center; gap: 16px; }
        .rt-header-icon { font-size: 2.4rem; filter: drop-shadow(0 0 12px rgba(255,50,50,0.6)); }
        .rt-header-title { font-size: 1.4rem; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
        .rt-header-sub { font-size: 0.8rem; color: rgba(255,255,255,0.5); margin: 2px 0 0; }

        /* Pulse indicator */
        .rt-pulse-dot {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em;
          color: #ff4444; position: relative;
        }
        .rt-pulse-ring {
          display: inline-block; width: 14px; height: 14px; border-radius: 50%;
          background: rgba(255,50,50,0.3); position: absolute; left: -20px;
          animation: pulse-ring 1.5s ease-out infinite;
        }
        .rt-pulse-core {
          display: inline-block; width: 8px; height: 8px; border-radius: 50%;
          background: #ff4444; position: absolute; left: -17px;
        }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:1} 100%{transform:scale(2.5);opacity:0} }

        /* ── Tabs ── */
        .rt-tabs {
          display: flex; padding: 16px 28px 0; gap: 4px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .rt-tab {
          display: flex; flex-direction: column; align-items: flex-start;
          padding: 10px 18px; border: none; border-radius: 8px 8px 0 0;
          background: transparent; cursor: pointer;
          color: rgba(255,255,255,0.5); transition: all 0.15s;
        }
        .rt-tab:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.8); }
        .rt-tab-active { background: rgba(255,50,50,0.12) !important; color: #fff !important; border-bottom: 2px solid #ff4444; }
        .rt-tab-label { font-size: 0.85rem; font-weight: 600; }
        .rt-tab-desc { font-size: 0.7rem; opacity: 0.6; margin-top: 1px; }

        /* ── Tab content ── */
        .rt-tab-content { padding: 24px 28px; }
        .rt-loading { padding: 48px; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.9rem; }
        .rt-empty { padding: 32px; text-align: center; color: rgba(255,255,255,0.3); font-style: italic; }

        /* ── Stats grid ── */
        .rt-stats-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .rt-stat-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 16px; text-align: center;
          transition: border-color 0.2s;
        }
        .rt-stat-card:hover { border-color: rgba(255,255,255,0.15); }
        .rt-stat-icon { font-size: 1.3rem; }
        .rt-stat-value { font-size: 1.8rem; font-weight: 700; margin: 6px 0 2px; }
        .rt-stat-label { font-size: 0.72rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
        .rt-stat-sub { font-size: 0.68rem; color: rgba(255,255,255,0.3); margin-top: 2px; }

        /* ── Category pills ── */
        .rt-category-grid {
          display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;
        }
        .rt-cat-pill {
          display: flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px; padding: 6px 14px; cursor: pointer;
          font-size: 0.78rem; transition: all 0.15s;
        }
        .rt-cat-pill:hover { background: rgba(255,255,255,0.08); }
        .rt-cat-icon { font-size: 1rem; }
        .rt-cat-name { font-weight: 500; }
        .rt-cat-count { background: rgba(255,255,255,0.1); border-radius: 10px; padding: 1px 7px; font-size: 0.72rem; }
        .rt-cat-finding { background: rgba(255,50,50,0.2); color: #ff6666; border-radius: 10px; padding: 1px 7px; font-size: 0.72rem; }

        /* ── Controls bar ── */
        .rt-controls {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px; gap: 12px; flex-wrap: wrap;
        }
        .rt-filter-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
        .rt-filter-btn {
          padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);
          background: transparent; color: rgba(255,255,255,0.5); font-size: 0.75rem;
          cursor: pointer; transition: all 0.15s;
        }
        .rt-filter-btn:hover, .rt-filter-btn.active { background: rgba(255,50,50,0.15); color: #fff; border-color: rgba(255,50,50,0.4); }
        .rt-trigger-btn {
          padding: 8px 20px; border-radius: 8px; border: 1px solid rgba(255,50,50,0.4);
          background: rgba(255,50,50,0.15); color: #ff6666; font-size: 0.82rem;
          font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .rt-trigger-btn:hover:not(:disabled) { background: rgba(255,50,50,0.3); }
        .rt-trigger-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rt-trigger-ai { border-color: rgba(100,100,255,0.4); background: rgba(100,100,255,0.15); color: #8888ff; }
        .rt-trigger-ai:hover:not(:disabled) { background: rgba(100,100,255,0.3); }

        /* ── Results table ── */
        .rt-results-table {
          background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; overflow: hidden;
        }
        .rt-table-header {
          display: grid; grid-template-columns: 100px 180px 1fr 60px 80px 1fr 80px;
          padding: 10px 16px; font-size: 0.7rem; font-weight: 600;
          color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .rt-table-row {
          display: grid; grid-template-columns: 100px 180px 1fr 60px 80px 1fr 80px;
          padding: 9px 16px; font-size: 0.78rem; border-bottom: 1px solid rgba(255,255,255,0.04);
          align-items: center; transition: background 0.1s;
        }
        .rt-table-row:hover { background: rgba(255,255,255,0.03); }
        .rt-finding { background: rgba(255,50,50,0.08) !important; }
        .rt-ai-row { grid-template-columns: 100px 200px 1fr 80px 1fr 80px; }
        .rt-table-header:has(+ .rt-ai-row) { grid-template-columns: 100px 200px 1fr 80px 1fr 80px; }

        .rt-badge {
          display: inline-block; padding: 2px 8px; border-radius: 5px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em;
        }
        .rt-mono { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: rgba(255,255,255,0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rt-code { font-family: monospace; font-size: 0.78rem; font-weight: 600; }
        .rt-muted { color: rgba(255,255,255,0.4); font-size: 0.75rem; }
        .rt-ts { font-size: 0.7rem; }
        .rt-detail { font-size: 0.75rem; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rt-cat-label { font-size: 0.75rem; color: rgba(255,255,255,0.65); }
        .rt-prompt-snippet { font-size: 0.73rem; color: rgba(255,220,100,0.8); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Expanded row */
        .rt-expanded {
          padding: 12px 24px 16px; background: rgba(0,0,0,0.4);
          border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;
        }
        .rt-pre {
          background: rgba(0,0,0,0.5); border-radius: 6px; padding: 10px;
          font-size: 0.72rem; overflow: auto; max-height: 150px;
          border: 1px solid rgba(255,255,255,0.08); margin: 6px 0 12px;
          white-space: pre-wrap; word-break: break-all;
          color: rgba(255,220,100,0.9);
        }

        /* ── Anomaly cards ── */
        .rt-anomaly-header {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
        }
        .rt-anomaly-title { font-weight: 600; font-size: 0.9rem; }
        .rt-anomaly-sub { font-size: 0.75rem; color: rgba(255,255,255,0.4); }

        .rt-anomaly-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .rt-anomaly-card {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 14px 16px; cursor: pointer;
          transition: all 0.15s; position: relative;
        }
        .rt-anomaly-card:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); }
        .rt-anomaly-high { border-color: rgba(255,50,50,0.3); background: rgba(255,50,50,0.05); }
        .rt-anomaly-med { border-color: rgba(255,200,50,0.3); background: rgba(255,200,50,0.04); }
        .rt-anomaly-score { font-size: 2rem; font-weight: 800; min-width: 52px; text-align: center; line-height: 1; }
        .rt-anomaly-score-label { font-size: 0.7rem; color: rgba(255,255,255,0.4); font-weight: 400; }
        .rt-anomaly-info { flex: 1; }
        .rt-anomaly-identity { font-size: 0.8rem; font-weight: 600; margin-bottom: 5px; font-family: monospace; }
        .rt-anomaly-stats-row { display: flex; gap: 10px; font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-top: 3px; flex-wrap: wrap; }
        .rt-anomaly-alert-badge {
          position: absolute; top: 8px; right: 8px;
          background: rgba(255,50,50,0.2); color: #ff6666; border-radius: 6px;
          padding: 2px 8px; font-size: 0.65rem; font-weight: 700;
        }

        .rt-anomaly-detail {
          background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 16px; margin-top: 8px;
        }
        .rt-anomaly-detail-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 12px; opacity: 0.8; }
        .rt-anomaly-alert {
          display: grid; grid-template-columns: 180px 60px 1fr;
          gap: 12px; font-size: 0.78rem; padding: 7px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04); align-items: center;
        }
        .rt-anomaly-alert-type { font-weight: 600; color: rgba(255,255,255,0.7); }
        .rt-anomaly-alert-score { font-weight: 700; font-size: 0.9rem; }
        .rt-anomaly-alert-detail { color: rgba(255,255,255,0.5); }

        /* ── Break Glass ── */
        .rt-bg-status {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 20px; border-radius: 10px; margin-bottom: 16px;
          font-weight: 600; font-size: 0.9rem;
        }
        .rt-bg-normal { background: rgba(50,200,100,0.12); border: 1px solid rgba(50,200,100,0.3); color: #66ee88; }
        .rt-bg-readonly { background: rgba(255,200,50,0.12); border: 1px solid rgba(255,200,50,0.3); color: #ffdd66; }
        .rt-bg-kill { background: rgba(255,30,30,0.15); border: 1px solid rgba(255,30,30,0.4); color: #ff5555; animation: bg-flash 1s ease-in-out infinite alternate; }
        @keyframes bg-flash { from{opacity:1} to{opacity:0.7} }
        .rt-bg-by { font-weight: 400; opacity: 0.7; margin-left: auto; font-size: 0.8rem; }

        .rt-bg-locks {
          padding: 10px 16px; background: rgba(255,200,50,0.08); border: 1px solid rgba(255,200,50,0.2);
          border-radius: 8px; margin-bottom: 14px; font-size: 0.82rem; color: rgba(255,220,100,0.8);
        }
        .rt-bg-msg { padding: 10px 16px; border-radius: 8px; margin-bottom: 14px; font-size: 0.82rem; }
        .rt-bg-msg-ok { background: rgba(50,200,100,0.1); color: #66ee88; border: 1px solid rgba(50,200,100,0.2); }
        .rt-bg-msg-err { background: rgba(255,50,50,0.1); color: #ff6666; border: 1px solid rgba(255,50,50,0.2); }

        .rt-bg-reason { margin-bottom: 20px; }
        .rt-bg-reason label { display: block; font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-bottom: 6px; }
        .rt-bg-input {
          width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.85rem;
          outline: none; box-sizing: border-box; transition: border-color 0.15s;
        }
        .rt-bg-input:focus { border-color: rgba(255,100,100,0.5); }
        .rt-bg-input-sm { margin-bottom: 10px; }

        .rt-bg-controls {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap: 14px;
        }
        .rt-bg-control-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 10px;
        }
        .rt-bg-card-warn { border-color: rgba(255,200,50,0.2); }
        .rt-bg-card-danger { border-color: rgba(255,50,50,0.2); }
        .rt-bg-card-green { border-color: rgba(50,200,100,0.2); }
        .rt-bg-card-icon { font-size: 1.8rem; }
        .rt-bg-card-title { font-size: 0.95rem; font-weight: 700; }
        .rt-bg-card-desc { font-size: 0.78rem; color: rgba(255,255,255,0.45); line-height: 1.5; flex: 1; }
        .rt-bg-btn {
          padding: 9px 16px; border-radius: 8px; border: none; font-size: 0.82rem;
          font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .rt-bg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rt-bg-btn-warn { background: rgba(255,200,50,0.2); color: #ffdd66; border: 1px solid rgba(255,200,50,0.3); }
        .rt-bg-btn-warn:hover:not(:disabled) { background: rgba(255,200,50,0.35); }
        .rt-bg-btn-danger { background: rgba(255,50,50,0.2); color: #ff6666; border: 1px solid rgba(255,50,50,0.35); }
        .rt-bg-btn-danger:hover:not(:disabled) { background: rgba(255,50,50,0.35); }
        .rt-bg-btn-green { background: rgba(50,200,100,0.2); color: #66ee88; border: 1px solid rgba(50,200,100,0.3); }
        .rt-bg-btn-green:hover:not(:disabled) { background: rgba(50,200,100,0.35); }
      `}</style>
    </div>
  );
};

export default RedTeamDashboard;
