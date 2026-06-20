/**
 * LitSecure Sentinel — SIEM Correlation Engine
 * Unified log aggregation, correlation rules, and event timeline.
 * Microsoft Sentinel / LogRhythm equivalent for the national SOC.
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Database, Activity, Shield, AlertTriangle, CheckCircle2,
  Server, Globe, Monitor, Wifi, X, RefreshCw, Search,
  ToggleLeft, ToggleRight, ChevronRight, TrendingUp,
  Terminal, Clock, Zap, BarChart3, Eye, Plus
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LogSource {
  id: string;
  name: string;
  type: string;
  icon: React.ElementType;
  color: string;
  eps: number;           // events per second (base)
  latencyMs: number;
  status: "connected" | "degraded" | "offline";
  eventsToday: number;
  lastEvent: string;
}

interface CorrelationRule {
  id: string;
  name: string;
  description: string;
  mitre: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  hitsToday: number;
  lastHit: string;
  active: boolean;
  logic: string;        // simplified SIGMA-like syntax
  category: string;
}

// ─── Log Sources Data ──────────────────────────────────────────────────────────
const INITIAL_SOURCES: LogSource[] = [
  { id: "winev",   name: "Windows Event Logs",    type: "Endpoint",     icon: Monitor, color: "#3b82f6", eps: 340, latencyMs: 45,  status: "connected", eventsToday: 1_842_000, lastEvent: "0s ago" },
  { id: "syslog",  name: "Linux Syslog",           type: "Server",       icon: Server,  color: "#22c55e", eps: 280, latencyMs: 38,  status: "connected", eventsToday: 2_104_500, lastEvent: "0s ago" },
  { id: "ngfw",    name: "NGFW Firewall Logs",     type: "Network",      icon: Shield,  color: "#f97316", eps: 910, latencyMs: 22,  status: "connected", eventsToday: 5_643_200, lastEvent: "0s ago" },
  { id: "dns",     name: "DNS Query Logs",         type: "Network",      icon: Globe,   color: "#06b6d4", eps: 1240,latencyMs: 15,  status: "connected", eventsToday: 8_901_400, lastEvent: "0s ago" },
  { id: "momo",    name: "MoMo API Gateway",       type: "Financial",    icon: Zap,     color: "#FFD600", eps: 78,  latencyMs: 89,  status: "connected", eventsToday: 451_000,   lastEvent: "1s ago" },
  { id: "govprt",  name: "Gov Portal Web Logs",    type: "Web",          icon: Globe,   color: "#8b5cf6", eps: 134, latencyMs: 67,  status: "degraded",  eventsToday: 732_000,   lastEvent: "3s ago" },
  { id: "ad",      name: "Active Directory / LDAP",type: "Identity",     icon: Database,color: "#ec4899", eps: 56,  latencyMs: 102, status: "connected", eventsToday: 312_000,   lastEvent: "0s ago" },
  { id: "email",   name: "Email Gateway (SMTP)",   type: "Email",        icon: Activity,color: "#f59e0b", eps: 23,  latencyMs: 145, status: "connected", eventsToday: 127_000,   lastEvent: "2s ago" },
  { id: "netflow", name: "NetFlow / sFlow",        type: "Network",      icon: Wifi,    color: "#14b8a6", eps: 2100,latencyMs: 12,  status: "connected", eventsToday: 14_200_000,lastEvent: "0s ago" },
  { id: "waf",     name: "WAF (Web App Firewall)",  type: "Web",         icon: Shield,  color: "#ef4444", eps: 45,  latencyMs: 78,  status: "offline",   eventsToday: 0,          lastEvent: "4m ago" },
];

// ─── Correlation Rules Data ────────────────────────────────────────────────────
const INITIAL_RULES: CorrelationRule[] = [
  {
    id: "R001", name: "Brute Force Login Detection", category: "Identity",
    description: "Alert when ≥10 failed logins from same source in 5 minutes",
    mitre: "T1110", severity: "High", hitsToday: 14, lastHit: "8m ago", active: true,
    logic: `title: Brute Force Logins\ndetection:\n  sel: EventID=4625\n  filter: count(src_ip) > 10\n  timeframe: 5m\ncondition: sel and not filter`,
  },
  {
    id: "R002", name: "Ransomware Shadow Copy Deletion", category: "Endpoint",
    description: "Detect vssadmin or wmic shadow copy deletion commands",
    mitre: "T1490", severity: "Critical", hitsToday: 2, lastHit: "22m ago", active: true,
    logic: `title: Shadow Copy Deletion\ndetection:\n  sel:\n    CommandLine|contains:\n      - 'vssadmin delete shadows'\n      - 'wmic shadowcopy delete'\ncondition: sel`,
  },
  {
    id: "R003", name: "DNS Tunneling / High Entropy Query", category: "Network",
    description: "Flag DNS queries with subdomain length >50 chars",
    mitre: "T1048", severity: "High", hitsToday: 7, lastHit: "15m ago", active: true,
    logic: `title: DNS Tunneling\ndetection:\n  sel:\n    query_length: '>50'\n    entropy_score: '>4.5'\ncondition: sel`,
  },
  {
    id: "R004", name: "Lateral Movement — Pass the Hash", category: "Identity",
    description: "Detect NTLM authentication using pre-computed hash",
    mitre: "T1550", severity: "Critical", hitsToday: 1, lastHit: "40m ago", active: true,
    logic: `title: Pass the Hash\ndetection:\n  sel:\n    EventID: 4624\n    LogonType: 3\n    AuthPkg: NTLM\n    WorkstationName|not: '%source_host%'\ncondition: sel`,
  },
  {
    id: "R005", name: "Mobile Money Fraud — Velocity Check", category: "Financial",
    description: "Alert on >5 transactions from same account in 60 seconds",
    mitre: "T1657", severity: "Critical", hitsToday: 31, lastHit: "2m ago", active: true,
    logic: `title: MoMo Velocity Fraud\ndetection:\n  sel: event_type='TRANSACTION'\n  agg: count(account_id) > 5\n  timeframe: 60s\ncondition: sel`,
  },
  {
    id: "R006", name: "Powershell Empire / Encoded Commands", category: "Endpoint",
    description: "Flag base64-encoded PowerShell execution",
    mitre: "T1059", severity: "High", hitsToday: 4, lastHit: "1h ago", active: true,
    logic: `title: Encoded PowerShell\ndetection:\n  sel:\n    EventID: 4104\n    ScriptBlockText|contains:\n      - '-EncodedCommand'\n      - '-Enc '\ncondition: sel`,
  },
  {
    id: "R007", name: "C2 Beacon Detection — Periodic Egress", category: "Network",
    description: "Detect consistent outbound connections at regular intervals (beaconing)",
    mitre: "T1071", severity: "High", hitsToday: 3, lastHit: "55m ago", active: true,
    logic: `title: C2 Beaconing\ndetection:\n  sel: dst_port in [80,443,8080]\n  agg: stddev(interval) < 5s\n  min_count: 20\ncondition: sel`,
  },
  {
    id: "R008", name: "Data Staging — Large Archive Creation", category: "Endpoint",
    description: "Detect creation of large archive files (potential pre-exfiltration)",
    mitre: "T1560", severity: "Medium", hitsToday: 9, lastHit: "30m ago", active: false,
    logic: `title: Data Staging\ndetection:\n  sel:\n    EventID: 11\n    file_ext: ['.zip','.rar','.7z']\n    file_size: '>500MB'\ncondition: sel`,
  },
  {
    id: "R009", name: "SIM Swap Alert — MACRA API", category: "Financial",
    description: "Triggered by MACRA portability API for repeat swap attempts",
    mitre: "T1657", severity: "Critical", hitsToday: 8, lastHit: "6m ago", active: true,
    logic: `title: SIM Swap Detection\ndetection:\n  sel:\n    event_src: 'MACRA_API'\n    event_type: 'SIM_PORT_REQUEST'\n    velocity: '>2 in 7d'\ncondition: sel`,
  },
  {
    id: "R010", name: "Impossible Travel Login", category: "Identity",
    description: "Login from 2 different countries within 30 minutes",
    mitre: "T1078", severity: "High", hitsToday: 5, lastHit: "12m ago", active: true,
    logic: `title: Impossible Travel\ndetection:\n  sel:\n    event: 'LOGIN_SUCCESS'\n    geo_distance: '>500km'\n    time_delta: '<30m'\ncondition: sel`,
  },
];

// ─── Event Timeline Data (24h) ──────────────────────────────────────────────────
const genTimeline = () => {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return hours.map(h => ({
    hour: h,
    critical: Math.max(0, Math.floor(Math.random() * 8 - 3)),
    high:     Math.floor(Math.random() * 20 + 5),
    medium:   Math.floor(Math.random() * 40 + 10),
    low:      Math.floor(Math.random() * 80 + 20),
  }));
};

// ─── Mini Sparkline / Bar Chart ────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const h = Math.max(2, Math.round((value / max) * 40));
  return <div className="w-[5px] rounded-sm flex-shrink-0" style={{ height: h, background: color, opacity: 0.8 }} />;
}

function EventTimeline({ data }: { data: ReturnType<typeof genTimeline> }) {
  const maxTotal = Math.max(...data.map(d => d.critical + d.high + d.medium + d.low));
  const now = new Date().getHours();
  return (
    <div className="flex items-end gap-px h-12 px-1">
      {data.map(d => {
        const total = d.critical + d.high + d.medium + d.low;
        const isPast = d.hour <= now;
        return (
          <div key={d.hour} title={`${d.hour}:00 — ${total} events`}
            className="flex-1 flex flex-col items-center gap-px cursor-pointer hover:opacity-80 transition">
            <MiniBar value={d.critical} max={maxTotal} color={isPast ? "#ef4444" : "#ef444440"} />
            <MiniBar value={d.high}     max={maxTotal} color={isPast ? "#f97316" : "#f9731640"} />
            <MiniBar value={d.medium}   max={maxTotal} color={isPast ? "#eab308" : "#eab30840"} />
            <MiniBar value={d.low}      max={maxTotal} color={isPast ? "#3b82f6" : "#3b82f640"} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SiemCorrelation() {
  const [sources, setSources]     = useState<LogSource[]>(INITIAL_SOURCES);
  const [rules, setRules]         = useState<CorrelationRule[]>(INITIAL_RULES);
  const [timeline]                = useState(genTimeline);
  const [ruleSearch, setRSearch]  = useState("");
  const [selectedRule, setSelRule]= useState<CorrelationRule | null>(null);
  const [activeTab, setActiveTab] = useState<"sources" | "rules" | "timeline">("sources");
  const [totalEps, setTotalEps]   = useState(0);

  // Simulate live EPS fluctuation
  useEffect(() => {
    const tick = () => {
      setSources(prev => prev.map(s => ({
        ...s,
        eps: s.status === "offline" ? 0 :
             Math.max(1, s.eps + Math.floor(Math.random() * 21 - 10)),
      })));
    };
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setTotalEps(sources.reduce((a, s) => a + (s.status !== "offline" ? s.eps : 0), 0));
  }, [sources]);

  const filteredRules = useMemo(() =>
    rules.filter(r => !ruleSearch || r.name.toLowerCase().includes(ruleSearch.toLowerCase()) || r.mitre.includes(ruleSearch)),
  [rules, ruleSearch]);

  const toggleRule = useCallback((id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  }, []);

  const totalEventsToday = sources.reduce((a, s) => a + s.eventsToday, 0);
  const connectedSources = sources.filter(s => s.status === "connected").length;
  const activeRules      = rules.filter(r => r.active).length;
  const totalHitsToday   = rules.reduce((a, r) => a + r.hitsToday, 0);

  const statusStyle = (s: LogSource["status"]) =>
    s === "connected" ? { dot: "bg-emerald-400 animate-pulse", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" } :
    s === "degraded"  ? { dot: "bg-yellow-400 animate-pulse",  text: "text-yellow-400",  badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"  } :
                        { dot: "bg-red-500",                   text: "text-red-400",     badge: "bg-red-500/15 text-red-400 border-red-500/25"           };

  const sevStyle: Record<string, string> = {
    Critical: "bg-red-500/15 text-red-400 border-red-500/30",
    High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
    Medium:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    Low:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "#1e2d42", background: "linear-gradient(135deg,#0d1520,#111927)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 70% 50%, rgba(59,130,246,0.06) 0%, transparent 60%)" }} />
        <div className="relative p-5 flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">SIEM CORRELATION ENGINE</h2>
              <p className="text-[10px] text-slate-500 font-mono">Unified Log Aggregation · SIGMA Rules · Real-time Event Correlation</p>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:ml-auto">
            {[
              { label: "Total EPS",     val: totalEps.toLocaleString(),                color: "text-blue-400"    },
              { label: "Log Sources",   val: `${connectedSources}/${sources.length}`,  color: "text-emerald-400" },
              { label: "Active Rules",  val: `${activeRules}/${rules.length}`,         color: "text-[#FFD600]"   },
              { label: "Hits Today",    val: totalHitsToday,                           color: "text-orange-400"  },
              { label: "Events Today",  val: (totalEventsToday / 1_000_000).toFixed(1) + "M", color: "text-slate-300" },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className={`font-orbitron text-xl font-bold ${color}`}>{val}</div>
                <div className="text-[8px] font-mono text-slate-600 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EPS Gauge */}
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl border" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
        <Activity className="w-4 h-4 text-blue-400 shrink-0" />
        <div className="text-[9px] font-mono text-slate-500">Live EPS:</div>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: `${Math.min(100, totalEps / 60)}%`,
            background: totalEps > 4000 ? "#ef4444" : totalEps > 2000 ? "#f97316" : "#3b82f6",
          }} />
        </div>
        <div className="font-orbitron text-sm font-bold text-white shrink-0">{totalEps.toLocaleString()} <span className="text-[9px] text-slate-500">eps</span></div>
        <div className="text-[8px] font-mono text-emerald-400 shrink-0">● INGESTING</div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-0 border-b" style={{ borderColor: "#1e2d42" }}>
        {(["sources", "rules", "timeline"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-xs font-mono font-bold capitalize relative transition ${
              activeTab === tab ? "text-[#4a7aff]" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "sources" ? "Log Sources" : tab === "rules" ? "Correlation Rules" : "Event Timeline"}
            {activeTab === tab && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#4a7aff] rounded-t" />}
          </button>
        ))}
      </div>

      {/* ── Tab: Log Sources ──────────────────────────────────────────────── */}
      {activeTab === "sources" && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          <div className="grid text-[8px] font-mono text-slate-600 uppercase tracking-widest px-4 py-2 border-b" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr", borderColor: "#1e2d42", background: "#111927" }}>
            <span>Source</span><span>Type</span><span>Status</span><span>EPS</span><span>Latency</span><span>Events Today</span><span>Last Event</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#1e2d4250" }}>
            {sources.map(s => {
              const ss = statusStyle(s.status);
              const Icon = s.icon;
              return (
                <div key={s.id} className="grid items-center gap-3 px-4 py-3 hover:bg-white/2 transition" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}18`, border: `1px solid ${s.color}30` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-200 truncate">{s.name}</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">{s.type}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${ss.dot} shrink-0`} />
                    <span className={`text-[8px] font-mono font-bold ${ss.text}`}>{s.status.toUpperCase()}</span>
                  </div>
                  <div className="font-orbitron text-xs font-bold" style={{ color: s.status === "offline" ? "#4a5568" : "#3b82f6" }}>
                    {s.status === "offline" ? "—" : s.eps.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono text-slate-400">{s.status === "offline" ? "—" : `${s.latencyMs}ms`}</div>
                  <div className="text-[9px] font-mono text-slate-300">{s.status === "offline" ? "—" : (s.eventsToday >= 1_000_000 ? `${(s.eventsToday/1_000_000).toFixed(1)}M` : `${(s.eventsToday/1000).toFixed(0)}K`)}</div>
                  <div className="text-[9px] font-mono text-slate-500">{s.status === "offline" ? <span className="text-red-400">OFFLINE</span> : s.lastEvent}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Correlation Rules ────────────────────────────────────────── */}
      {activeTab === "rules" && (
        <div className="flex gap-4">
          {/* Rules Table */}
          <div className="flex-1 rounded-2xl border overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#1e2d42", background: "#111927" }}>
              <div className="flex items-center gap-2 flex-1 max-w-xs rounded-lg border px-3" style={{ background: "#1a2332", borderColor: "#1e2d42" }}>
                <Search className="w-3 h-3 text-slate-600" />
                <input value={ruleSearch} onChange={e => setRSearch(e.target.value)} placeholder="Search rules or MITRE ID…" className="flex-1 bg-transparent text-[10px] text-slate-200 placeholder-slate-600 outline-none py-1.5 font-mono" />
              </div>
              <span className="text-[9px] font-mono text-slate-600 ml-auto">{activeRules} active of {rules.length} rules</span>
            </div>
            <div className="grid text-[8px] font-mono text-slate-600 uppercase tracking-widest px-4 py-2 border-b" style={{ gridTemplateColumns: "1fr auto auto auto auto auto", borderColor: "#1e2d42", background: "#111927" }}>
              <span>Rule Name</span><span>MITRE</span><span>Severity</span><span>Hits Today</span><span>Last Hit</span><span>Active</span>
            </div>
            <div className="divide-y" style={{ borderColor: "#1e2d4250" }}>
              {filteredRules.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelRule(prev => prev?.id === r.id ? null : r)}
                  className={`grid items-center gap-4 px-4 py-3 cursor-pointer transition hover:bg-white/2 ${selectedRule?.id === r.id ? "bg-[#4a7aff]/5" : ""}`}
                  style={{ gridTemplateColumns: "1fr auto auto auto auto auto" }}
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-slate-200 truncate">{r.name}</div>
                    <div className="text-[8px] font-mono text-slate-600 truncate">{r.category}</div>
                  </div>
                  <span className="text-[9px] font-mono text-indigo-400">{r.mitre}</span>
                  <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${sevStyle[r.severity]}`}>{r.severity}</span>
                  <span className="font-orbitron text-xs font-bold text-white">{r.hitsToday}</span>
                  <span className="text-[9px] font-mono text-slate-500">{r.lastHit}</span>
                  <button
                    onClick={e => { e.stopPropagation(); toggleRule(r.id); }}
                    className={`flex items-center transition ${r.active ? "text-emerald-400" : "text-slate-600"}`}
                  >
                    {r.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Rule Detail */}
          {selectedRule && (
            <div className="w-72 shrink-0 rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "#1e2d42", background: "#111927" }}>
                <Shield className="w-3.5 h-3.5 text-[#4a7aff]" />
                <span className="text-[9px] font-mono font-bold text-white uppercase tracking-widest flex-1">Rule Detail</span>
                <button onClick={() => setSelRule(null)}><X className="w-4 h-4 text-slate-600 hover:text-white transition" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <div className="text-xs font-bold text-white mb-1">{selectedRule.name}</div>
                  <div className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded border w-fit ${sevStyle[selectedRule.severity]}`}>{selectedRule.severity}</div>
                </div>
                <div>
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1">Description</div>
                  <p className="text-[9px] text-slate-400 leading-relaxed">{selectedRule.description}</p>
                </div>
                <div>
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1">SIGMA Logic</div>
                  <pre className="text-[9px] font-mono text-emerald-400 bg-[#080d14] border border-white/5 p-3 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap">{selectedRule.logic}</pre>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                  <div><div className="text-slate-600 mb-0.5">Hits Today</div><div className="text-white font-bold">{selectedRule.hitsToday}</div></div>
                  <div><div className="text-slate-600 mb-0.5">Last Hit</div><div className="text-slate-300">{selectedRule.lastHit}</div></div>
                  <div><div className="text-slate-600 mb-0.5">MITRE TTP</div><div className="text-indigo-400">{selectedRule.mitre}</div></div>
                  <div><div className="text-slate-600 mb-0.5">Status</div><div className={selectedRule.active ? "text-emerald-400" : "text-slate-600"}>{selectedRule.active ? "ACTIVE" : "DISABLED"}</div></div>
                </div>
                <button
                  onClick={() => toggleRule(selectedRule.id)}
                  className={`w-full py-2 text-xs font-mono font-bold rounded-lg border transition ${selectedRule.active ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"}`}
                >
                  {selectedRule.active ? "Disable Rule" : "Enable Rule"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Event Timeline ──────────────────────────────────────────── */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          {/* 24h Chart */}
          <div className="p-5 rounded-2xl border" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-bold text-white">24-Hour Event Volume</div>
                <div className="text-[9px] font-mono text-slate-500 mt-0.5">All sources combined · Stacked by severity</div>
              </div>
              <div className="flex items-center gap-3 text-[8px] font-mono">
                {[
                  { label: "Critical", color: "#ef4444" },
                  { label: "High",     color: "#f97316" },
                  { label: "Medium",   color: "#eab308" },
                  { label: "Low",      color: "#3b82f6" },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    <span className="text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <EventTimeline data={timeline} />
            <div className="flex justify-between text-[7px] font-mono text-slate-600 mt-1 px-1">
              {[0,6,12,18,23].map(h => <span key={h}>{h}:00</span>)}
            </div>
          </div>

          {/* Top anomalies */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Top Correlation Hits (Today)</div>
              {[...rules].sort((a,b) => b.hitsToday - a.hitsToday).slice(0,5).map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-slate-600 font-mono text-[9px] w-4">#{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-slate-200 truncate">{r.name}</div>
                    <div className="text-[8px] font-mono text-indigo-400">{r.mitre}</div>
                  </div>
                  <div className="font-orbitron text-sm font-bold text-white">{r.hitsToday}</div>
                  <span className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded border ${sevStyle[r.severity]}`}>{r.severity[0]}</span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl border" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Highest Volume Sources (EPS)</div>
              {[...sources].sort((a,b) => b.eps - a.eps).slice(0,5).map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <span className="text-slate-600 font-mono text-[9px] w-4">#{i+1}</span>
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: s.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-slate-200 truncate">{s.name}</div>
                    </div>
                    <div className="font-orbitron text-sm font-bold" style={{ color: s.color }}>{s.eps.toLocaleString()}</div>
                    <span className="text-[7px] font-mono text-slate-600">eps</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
