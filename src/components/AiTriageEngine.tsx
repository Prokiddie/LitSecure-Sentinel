/**
 * LitSecure Sentinel — AI Triage & Alert Fusion Engine
 * Anti-alert-fatigue system. Simulates ensemble ML + semantic clustering.
 * Raw alert firehose → meta-event clusters → analyst priority queue.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Brain, Activity, Shield, CheckCircle2, AlertTriangle,
  ChevronRight, X, ArrowUp, Loader2, Pause, Play,
  TrendingDown, Eye, BarChart3, Zap, Server, Globe,
  Hash, Clock, RefreshCw, Filter, Crosshair
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawAlert {
  id: string;
  timestamp: string;
  source: string;
  type: string;
  host: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  mitre?: string;
}

interface MetaCluster {
  id: string;
  name: string;
  alertCount: number;
  severity: "Critical" | "High" | "Medium";
  model: string;
  confidence: number;
  mitre: string;
  topIocs: string[];
  firstSeen: string;
  lastSeen: string;
  status: "new" | "reviewing" | "escalated" | "dismissed";
  description: string;
}

// ─── Simulated Alert Sources ───────────────────────────────────────────────────
const ALERT_SOURCES = ["Firewall", "EDR", "DNS", "SIEM", "MoMo API", "AD", "Proxy", "Email GW", "NetFlow", "WAF"];
const ALERT_TYPES   = [
  "Port Scan Detected", "Suspicious Login", "Malware Hash Match", "C2 Beacon",
  "DNS Exfiltration", "Brute Force Attempt", "Ransomware Indicator", "Privilege Escalation",
  "Lateral Movement", "Data Staging", "SIM Swap Alert", "MFA Bypass", "SQL Injection", "XSS Attempt",
];
const HOSTS = ["WKST-045", "SRV-DB-02", "FW-EDGE-01", "DC-PRIMARY", "MoMo-API-GW", "PROXY-01", "MAIL-SRV"];

const SEV_WEIGHTS: { sev: RawAlert["severity"]; weight: number }[] = [
  { sev: "critical", weight: 3 },
  { sev: "high",     weight: 8 },
  { sev: "medium",   weight: 25 },
  { sev: "low",      weight: 40 },
  { sev: "info",     weight: 24 },
];

let alertSeq = 1;
const genAlert = (): RawAlert => {
  const r = Math.random() * 100;
  let cum = 0;
  let sev: RawAlert["severity"] = "info";
  for (const { sev: s, weight } of SEV_WEIGHTS) {
    cum += weight;
    if (r < cum) { sev = s; break; }
  }
  return {
    id: `AL-${String(alertSeq++).padStart(5, "0")}`,
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    source: ALERT_SOURCES[Math.floor(Math.random() * ALERT_SOURCES.length)],
    type: ALERT_TYPES[Math.floor(Math.random() * ALERT_TYPES.length)],
    host: HOSTS[Math.floor(Math.random() * HOSTS.length)],
    severity: sev,
    message: `${ALERT_TYPES[Math.floor(Math.random() * ALERT_TYPES.length)]} on ${HOSTS[Math.floor(Math.random() * HOSTS.length)]}`,
    mitre: ["T1566", "T1110", "T1486", "T1657", "T1071", "T1059"][Math.floor(Math.random() * 6)],
  };
};

// ─── Pre-built Meta Clusters ───────────────────────────────────────────────────
const INITIAL_CLUSTERS: MetaCluster[] = [
  {
    id: "C-001", name: "SIM Swap Fraud Campaign — TNM Mpamba",
    alertCount: 47, severity: "Critical", model: "GNN Reconstructor",
    confidence: 94, mitre: "T1657", status: "new",
    topIocs: ["+265 888 4xx xxx", "41.206.25.3", "simswap-mw.net"],
    firstSeen: "14m ago", lastSeen: "2m ago",
    description: "47 correlated alerts indicating a coordinated SIM swap campaign. GNN reconstructed 3-hop attack graph. 12 victim accounts identified.",
  },
  {
    id: "C-002", name: "Phishing Wave — Government Email Impersonation",
    alertCount: 83, severity: "Critical", model: "LSTM Autoencoder",
    confidence: 91, mitre: "T1566", status: "new",
    topIocs: ["malawi-gov.phish.cc", "185.220.101.x", "login@malawi-gov.co"],
    firstSeen: "1h ago", lastSeen: "8m ago",
    description: "LSTM model detected anomalous email pattern resembling past phishing campaigns. 83 alerts from email GW and DNS sinkhole.",
  },
  {
    id: "C-003", name: "Brute Force — AD Domain Controllers",
    alertCount: 312, severity: "High", model: "Isolation Forest",
    confidence: 88, mitre: "T1110", status: "reviewing",
    topIocs: ["192.168.1.45", "WKST-DEV-12", "admin_test"],
    firstSeen: "3h ago", lastSeen: "45m ago",
    description: "Isolation Forest flagged statistical anomaly: 312 failed logins from single source within 4 hours. Credential stuffing tool signature detected.",
  },
  {
    id: "C-004", name: "Ransomware Precursor Activity — SRV-DB-02",
    alertCount: 28, severity: "Critical", model: "Random Forest",
    confidence: 97, mitre: "T1486", status: "escalated",
    topIocs: ["SRV-DB-02", "mscrypt.exe", "shadow.bat"],
    firstSeen: "22m ago", lastSeen: "1m ago",
    description: "RF classifier matched 97% confidence ransomware precursor: shadow copy deletion + mass file enumeration + outbound C2 beacon.",
  },
  {
    id: "C-005", name: "DNS Tunneling — Data Exfiltration Attempt",
    alertCount: 156, severity: "High", model: "SVM Classifier",
    confidence: 86, mitre: "T1048", status: "new",
    topIocs: ["tunnel.exfil-out.xyz", "192.0.2.88", "cmd.exe"],
    firstSeen: "2h ago", lastSeen: "18m ago",
    description: "SVM model detected high-entropy DNS queries with subdomain length >50 chars — classic DNS tunneling indicator. 156 alerts from DNS layer.",
  },
  {
    id: "C-006", name: "Lateral Movement — DC Compromise Chain",
    alertCount: 19, severity: "High", model: "GNN Reconstructor",
    confidence: 89, mitre: "T1021", status: "new",
    topIocs: ["DC-PRIMARY", "PASS-THE-HASH", "mimikatz"],
    firstSeen: "40m ago", lastSeen: "5m ago",
    description: "GNN graph reconstruction shows attacker pivoting from WKST-045 → SRV-FILE-01 → DC-PRIMARY using pass-the-hash technique.",
  },
  {
    id: "C-007", name: "MoMo API Abuse — Automated Transactions",
    alertCount: 91, severity: "High", model: "Isolation Forest",
    confidence: 83, mitre: "T1657", status: "reviewing",
    topIocs: ["api-key-stolen-xxxx", "185.178.208.x", "MoMo-API-GW"],
    firstSeen: "1.5h ago", lastSeen: "12m ago",
    description: "Anomalous API call pattern: 91 micro-transactions averaging MWK 200 each from single API key. Automated fraud ring suspected.",
  },
  {
    id: "C-008", name: "Web Application Attacks — Government Portal",
    alertCount: 234, severity: "Medium", model: "SVM Classifier",
    confidence: 78, mitre: "T1190", status: "dismissed",
    topIocs: ["203.0.113.45", "SQLi payload", "/admin/login.php"],
    firstSeen: "5h ago", lastSeen: "2h ago",
    description: "WAF telemetry shows 234 SQL injection attempts against Gov portal login. Largely blocked but pattern warrants monitoring.",
  },
];

// ─── Helper ────────────────────────────────────────────────────────────────────
const SEV_COLORS: Record<string, { badge: string; dot: string; left: string }> = {
  Critical: { badge: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-500 animate-pulse", left: "bg-red-500" },
  High:     { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", dot: "bg-orange-500", left: "bg-orange-500" },
  Medium:   { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-400", left: "bg-yellow-400" },
  critical: { badge: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-500 animate-pulse", left: "" },
  high:     { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", dot: "bg-orange-500", left: "" },
  medium:   { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-400", left: "" },
  low:      { badge: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-400", left: "" },
  info:     { badge: "bg-white/5 text-slate-500 border-white/10", dot: "bg-slate-600", left: "" },
};

const MODEL_COLORS: Record<string, string> = {
  "GNN Reconstructor": "#6366f1",
  "LSTM Autoencoder":  "#8b5cf6",
  "Isolation Forest":  "#22c55e",
  "Random Forest":     "#f59e0b",
  "SVM Classifier":    "#06b6d4",
};

// ─── Raw Alert Row ─────────────────────────────────────────────────────────────
function AlertRow({ alert }: { alert: RawAlert }) {
  const sc = SEV_COLORS[alert.severity] ?? SEV_COLORS.info;
  return (
    <div className="flex items-center gap-2 py-1 border-b font-mono text-[9px]" style={{ borderColor: "#1e2d4230" }}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
      <span className="text-slate-600 w-14 shrink-0">{alert.timestamp.slice(11)}</span>
      <span className="text-slate-500 w-16 truncate shrink-0">{alert.source}</span>
      <span className="text-slate-300 flex-1 truncate">{alert.type}</span>
      <span className="text-slate-600 w-20 truncate shrink-0">{alert.host}</span>
      <span className={`text-[8px] font-bold px-1 py-0.5 rounded border shrink-0 ${sc.badge}`}>{alert.severity.toUpperCase()}</span>
    </div>
  );
}

// ─── Cluster Card ──────────────────────────────────────────────────────────────
function ClusterCard({
  cluster, selected, onClick, onAction
}: {
  cluster: MetaCluster; selected: boolean;
  onClick: () => void;
  onAction: (id: string, action: "escalate" | "dismiss" | "review") => void;
}) {
  const sc = SEV_COLORS[cluster.severity] ?? SEV_COLORS.Medium;
  const modelColor = MODEL_COLORS[cluster.model] ?? "#6366f1";
  const statusStyle: Record<string, string> = {
    new:       "bg-blue-500/15 text-blue-400 border-blue-500/25",
    reviewing: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25 animate-pulse",
    escalated: "bg-red-500/15 text-red-400 border-red-500/25",
    dismissed: "bg-white/5 text-slate-600 border-white/10 opacity-60",
  };

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border transition-all cursor-pointer ${selected ? "border-[#4a7aff]/50 shadow-[0_0_20px_rgba(74,122,255,0.1)]" : "border-white/5 hover:border-white/10"}`}
      style={{ background: selected ? "rgba(74,122,255,0.05)" : "#111927" }}
    >
      {/* Left accent */}
      <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r ${sc.left}`} />

      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${sc.badge}`}>{cluster.severity}</span>
            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${statusStyle[cluster.status]}`}>{cluster.status.toUpperCase()}</span>
            <span className="text-[8px] font-mono text-slate-600">{cluster.mitre}</span>
          </div>
          <div className="text-right shrink-0">
            <div className="font-orbitron text-lg font-bold text-white leading-none">{cluster.alertCount}</div>
            <div className="text-[7px] font-mono text-slate-600">alerts</div>
          </div>
        </div>

        <div className="text-[10px] font-bold text-white mb-1 leading-snug">{cluster.name}</div>

        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1 text-[8px] font-mono font-bold" style={{ color: modelColor }}>
            <Brain className="w-2.5 h-2.5" /> {cluster.model}
          </div>
          <div className="text-[8px] font-mono text-slate-600">
            <span className="text-slate-300">{cluster.confidence}%</span> confidence
          </div>
          <div className="text-[8px] font-mono text-slate-600 ml-auto">{cluster.lastSeen}</div>
        </div>

        {/* Confidence bar */}
        <div className="h-0.5 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full rounded-full" style={{ width: `${cluster.confidence}%`, background: modelColor }} />
        </div>

        <div className="flex flex-wrap gap-1 mb-2">
          {cluster.topIocs.slice(0, 2).map((ioc, i) => (
            <span key={i} className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5 truncate max-w-[120px]">{ioc}</span>
          ))}
        </div>

        {cluster.status !== "dismissed" && cluster.status !== "escalated" && (
          <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => onAction(cluster.id, "review")} className="flex-1 py-1 text-[8px] font-mono font-bold rounded border border-blue-500/25 text-blue-400 hover:bg-blue-500/10 transition">Investigate</button>
            <button onClick={() => onAction(cluster.id, "escalate")} className="flex-1 py-1 text-[8px] font-mono font-bold rounded border border-red-500/25 text-red-400 hover:bg-red-500/10 transition">Escalate</button>
            <button onClick={() => onAction(cluster.id, "dismiss")} className="flex-1 py-1 text-[8px] font-mono font-bold rounded border border-white/10 text-slate-500 hover:bg-white/5 transition">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AiTriageEngine() {
  const [alerts, setAlerts]     = useState<RawAlert[]>(() => Array.from({ length: 30 }, genAlert));
  const [clusters, setClusters] = useState<MetaCluster[]>(INITIAL_CLUSTERS);
  const [paused, setPaused]     = useState(false);
  const [selected, setSelected] = useState<MetaCluster | null>(null);
  const [totalProcessed, setTotal] = useState(487);
  const alertsRef               = useRef<HTMLDivElement>(null);
  const intervalRef             = useRef<ReturnType<typeof setInterval>>();

  // Alert firehose
  useEffect(() => {
    if (paused) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setAlerts(prev => [...prev.slice(-80), genAlert()]);
      setTotal(p => p + 1);
    }, 600);
    return () => clearInterval(intervalRef.current);
  }, [paused]);

  // Auto-scroll
  useEffect(() => {
    if (alertsRef.current) alertsRef.current.scrollTop = alertsRef.current.scrollHeight;
  }, [alerts]);

  const handleAction = useCallback((id: string, action: "escalate" | "dismiss" | "review") => {
    setClusters(prev => prev.map(c => c.id === id ? { ...c, status: action === "escalate" ? "escalated" : action === "dismiss" ? "dismissed" : "reviewing" } : c));
  }, []);

  const stats = useMemo(() => ({
    total:      totalProcessed,
    clusters:   clusters.length,
    critical:   clusters.filter(c => c.severity === "Critical" && c.status !== "dismissed").length,
    dismissed:  clusters.filter(c => c.status === "dismissed").length,
    reduction:  Math.round((1 - clusters.length / totalProcessed) * 100),
  }), [totalProcessed, clusters]);

  const analystQueue = useMemo(() =>
    clusters.filter(c => (c.severity === "Critical" || c.severity === "High") && c.status === "new")
             .sort((a, b) => b.alertCount - a.alertCount)
             .slice(0, 4),
  [clusters]);

  const models = [
    { name: "Isolation Forest",  accuracy: 94.2, predictions: 187, color: "#22c55e" },
    { name: "LSTM Autoencoder",  accuracy: 91.8, predictions: 134, color: "#8b5cf6" },
    { name: "GNN Reconstructor", accuracy: 89.3, predictions: 98,  color: "#6366f1" },
    { name: "Random Forest",     accuracy: 96.1, predictions: 68,  color: "#f59e0b" },
    { name: "SVM Classifier",    accuracy: 87.5, predictions: 156, color: "#06b6d4" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "#1e2d42", background: "linear-gradient(135deg,#0d1520,#111927)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(34,197,94,0.06) 0%, transparent 60%)" }} />
        <div className="relative p-5 flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <Brain className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">AI TRIAGE ENGINE</h2>
              <p className="text-[10px] text-slate-500 font-mono">Ensemble ML · Semantic Clustering · Alert Fusion · Real-time Reduction</p>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:ml-auto">
            {[
              { label: "Raw Alerts",    val: stats.total,      color: "text-slate-300" },
              { label: "Meta-Clusters", val: stats.clusters,   color: "text-[#4a7aff]" },
              { label: "Critical",      val: stats.critical,   color: "text-red-400" },
              { label: "Noise Reduced", val: `${stats.reduction}%`, color: "text-emerald-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className={`font-orbitron text-2xl font-bold ${color}`}>{val}</div>
                <div className="text-[8px] font-mono text-slate-600 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Reduction banner */}
        <div className="px-5 pb-4 flex items-center gap-3">
          <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="text-[10px] font-mono text-emerald-400 font-bold">
            Reduced <span className="text-white">{stats.total}</span> raw alerts → <span className="text-white">{stats.clusters}</span> actionable meta-events
            <span className="ml-3 text-slate-500">({stats.reduction}% noise reduction)</span>
          </div>
          <button
            onClick={() => setPaused(p => !p)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-mono font-bold rounded-lg border transition ${
              paused ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-yellow-500/15 border-yellow-500/30 text-yellow-400"
            }`}
          >
            {paused ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause Feed</>}
          </button>
        </div>
      </div>

      {/* Model Status Bar */}
      <div className="grid grid-cols-5 gap-3">
        {models.map(m => (
          <div key={m.name} className="p-3 rounded-xl border" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
            <div className="text-[8px] font-mono font-bold truncate mb-2" style={{ color: m.color }}>{m.name}</div>
            <div className="flex items-end justify-between gap-1">
              <div>
                <div className="text-sm font-orbitron font-bold text-white">{m.accuracy}%</div>
                <div className="text-[7px] font-mono text-slate-600">accuracy</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-orbitron font-bold text-slate-300">{m.predictions}</div>
                <div className="text-[7px] font-mono text-slate-600">predictions</div>
              </div>
            </div>
            <div className="mt-2 h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full" style={{ width: `${m.accuracy}%`, background: m.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr_1fr] gap-4 min-h-[560px]">

        {/* LEFT: Raw Alert Firehose */}
        <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "#1e2d42", background: "#111927" }}>
            <Activity className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[9px] font-mono font-bold text-white uppercase tracking-widest">Raw Alert Firehose</span>
            {!paused && <span className="ml-auto flex items-center gap-1 text-[8px] font-mono text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE</span>}
            {paused  && <span className="ml-auto text-[8px] font-mono text-yellow-400">PAUSED</span>}
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 py-1 text-[7px] font-mono text-slate-600 border-b" style={{ borderColor: "#1e2d4230" }}>
            <span className="w-2 shrink-0" />
            <span className="w-14 shrink-0">TIME</span>
            <span className="w-16 shrink-0">SOURCE</span>
            <span className="flex-1">TYPE</span>
            <span className="w-20 shrink-0">HOST</span>
            <span className="w-14 shrink-0">SEV</span>
          </div>
          <div ref={alertsRef} className="flex-1 overflow-y-auto px-3 py-1">
            {alerts.map(a => <React.Fragment key={a.id}><AlertRow alert={a} /></React.Fragment>)}
          </div>
        </div>

        {/* CENTER: Meta-Clusters */}
        <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#1e2d42", background: "#111927" }}>
            <Brain className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[9px] font-mono font-bold text-white uppercase tracking-widest">AI Meta-Event Clusters</span>
            <span className="ml-auto text-[8px] font-mono text-slate-500">{clusters.length} clusters</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {clusters.map(c => (
              <React.Fragment key={c.id}><ClusterCard
                cluster={c}
                selected={selected?.id === c.id}
                onClick={() => setSelected(prev => prev?.id === c.id ? null : c)}
                onAction={handleAction}
              /></React.Fragment>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail / Analyst Queue */}
        <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          {selected ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#1e2d42", background: "#111927" }}>
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[9px] font-mono font-bold text-white uppercase tracking-widest">Cluster Detail</span>
                <button onClick={() => setSelected(null)} className="ml-auto p-1 text-slate-600 hover:text-white transition"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1">Cluster ID</div>
                  <div className="text-[9px] font-mono text-slate-300">{selected.id}</div>
                </div>
                <div>
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1">Description</div>
                  <p className="text-[9px] text-slate-300 leading-relaxed">{selected.description}</p>
                </div>
                <div>
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-2">ML Model Used</div>
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5" style={{ color: MODEL_COLORS[selected.model] }} />
                    <span className="text-[10px] font-mono font-bold" style={{ color: MODEL_COLORS[selected.model] }}>{selected.model}</span>
                    <span className="ml-auto text-[9px] font-mono font-bold text-white">{selected.confidence}% conf.</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full rounded-full" style={{ width: `${selected.confidence}%`, background: MODEL_COLORS[selected.model] }} />
                  </div>
                </div>
                <div>
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-2">Top IOCs</div>
                  {selected.topIocs.map((ioc, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-white/5 text-[9px] font-mono">
                      <Crosshair className="w-2.5 h-2.5 text-red-400 shrink-0" />
                      <span className="text-slate-300">{ioc}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                  <div><div className="text-slate-600 mb-0.5">First Seen</div><div className="text-slate-300">{selected.firstSeen}</div></div>
                  <div><div className="text-slate-600 mb-0.5">Last Seen</div><div className="text-slate-300">{selected.lastSeen}</div></div>
                  <div><div className="text-slate-600 mb-0.5">Alert Count</div><div className="text-white font-bold">{selected.alertCount}</div></div>
                  <div><div className="text-slate-600 mb-0.5">MITRE TTP</div><div className="text-indigo-400">{selected.mitre}</div></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#1e2d42", background: "#111927" }}>
                <Zap className="w-3.5 h-3.5 text-[#FFD600]" />
                <span className="text-[9px] font-mono font-bold text-white uppercase tracking-widest">Priority Analyst Queue</span>
                <span className="ml-auto text-[8px] font-mono text-slate-500">{analystQueue.length} items</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {analystQueue.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                    <CheckCircle2 className="w-8 h-8 opacity-20" />
                    <p className="text-xs font-mono">Queue clear — no new critical clusters</p>
                  </div>
                )}
                {analystQueue.map((c, i) => (
                  <div key={c.id} onClick={() => setSelected(c)} className="p-3 rounded-xl border border-white/5 hover:border-[#4a7aff]/30 cursor-pointer transition" style={{ background: "#111927" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-orbitron text-lg font-bold text-white w-5">#{i+1}</span>
                      <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${SEV_COLORS[c.severity].badge}`}>{c.severity}</span>
                    </div>
                    <div className="text-[10px] font-bold text-white mb-1 leading-tight">{c.name}</div>
                    <div className="text-[8px] font-mono text-slate-500">{c.alertCount} alerts · {c.model} · {c.confidence}% conf.</div>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={e => { e.stopPropagation(); handleAction(c.id, "review"); }} className="flex-1 py-1 text-[8px] font-mono font-bold rounded border border-blue-500/25 text-blue-400 hover:bg-blue-500/10 transition">Investigate</button>
                      <button onClick={e => { e.stopPropagation(); handleAction(c.id, "escalate"); }} className="flex-1 py-1 text-[8px] font-mono font-bold rounded border border-red-500/25 text-red-400 hover:bg-red-500/10 transition">Escalate</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
