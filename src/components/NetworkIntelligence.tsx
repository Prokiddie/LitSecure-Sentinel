import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, Wifi, Network, AlertTriangle, CheckCircle,
  XCircle, Eye, EyeOff, Globe, Server, Cpu,
  Activity, Zap, ChevronDown, ChevronRight, RefreshCw,
  Play, Lock, Unlock, Info, TrendingUp, Target,
  Monitor, Radio, LayoutGrid, Layers
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OSFingerprint {
  ip: string;
  os: string;
  family: string;
  version: string;
  confidence: number;
  ttl: number;
  windowSize: number;
  tcpOptions: string[];
  behaviorPatterns: string[];
  dnsPatterns: string[];
  detectedAt: string;
  source: string;
}

interface VPNResult {
  ip: string;
  isVPN: boolean;
  isTOR: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  confidence: number;
  provider?: string;
  asnOrg?: string;
  country?: string;
  distanceKm?: number;
  methods: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  cveTunnelvision: boolean;
  checkedAt: string;
}

interface VLANAlert {
  id: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sourceIP: string;
  sourceMAC?: string;
  targetVLAN: number;
  originalVLAN: number;
  confidence: number;
  evidence: string[];
  mitigations: string[];
  timestamp: string;
  resolved: boolean;
}

interface AnalyzeResult {
  ip: string;
  osFingerprint?: OSFingerprint;
  vpnDetection?: VPNResult;
  vlanAlerts: VLANAlert[];
  riskScore: number;
  riskLevel: string;
  flags: string[];
  recommendations: string[];
  analyzedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const severityColor = (s: string) => {
  if (s === "CRITICAL") return { text: "#ff4757", bg: "rgba(255,71,87,0.12)", border: "rgba(255,71,87,0.3)" };
  if (s === "HIGH")     return { text: "#ffa502", bg: "rgba(255,165,2,0.12)",  border: "rgba(255,165,2,0.3)" };
  if (s === "MEDIUM")   return { text: "#eccc68", bg: "rgba(236,204,104,0.12)",border: "rgba(236,204,104,0.3)" };
  return { text: "#2ed573", bg: "rgba(46,213,115,0.10)", border: "rgba(46,213,115,0.25)" };
};

const osFamilyIcon = (family: string) => {
  if (family === "Windows") return "🪟";
  if (family === "Linux")   return "🐧";
  if (family === "MacOS")   return "🍎";
  if (family === "Android") return "🤖";
  if (family === "iOS")     return "📱";
  if (family === "Network Device") return "🌐";
  return "❓";
};

const vlanTypeLabel: Record<string, string> = {
  DOUBLE_TAGGING:           "Double Tagging (802.1Q)",
  VLAN_SCAN:                "VLAN ID Scanning",
  SWITCH_SPOOF:             "Switch Spoofing (DTP)",
  VLAN_HOP_ATTEMPT:         "VLAN Hop Attempt",
  DHCP_ROUTE_INJECTION:     "DHCP Option 121 Injection (CVE-2024-3661)",
  UNAUTHORIZED_VLAN_ACCESS: "Unauthorized VLAN Access",
  INTER_VLAN_ANOMALY:       "Inter-VLAN Traffic Anomaly",
};

const VLAN_SIM_TYPES = [
  "DOUBLE_TAGGING","VLAN_SCAN","SWITCH_SPOOF","VLAN_HOP_ATTEMPT",
  "DHCP_ROUTE_INJECTION","UNAUTHORIZED_VLAN_ACCESS","INTER_VLAN_ANOMALY",
];

// ─── Alert Row component (must be outside main component to avoid key prop TS error) ──
interface AlertRowProps { alert: VLANAlert; onResolve: (id: string) => void; expandedAlert: string | null; setExpandedAlert: (id: string | null) => void; }
const AlertRow: React.FC<AlertRowProps> = ({ alert, onResolve, expandedAlert, setExpandedAlert }) => {
  const col  = severityColor(alert.severity);
  const open = expandedAlert === alert.id;
  return (
    <div style={{
      border: `1px solid ${col.border}`,
      borderRadius: 10,
      overflow: "hidden",
      opacity: alert.resolved ? 0.5 : 1,
      transition: "opacity 0.3s",
    }}>
      <div
        onClick={() => setExpandedAlert(open ? null : alert.id)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", cursor: "pointer",
          background: open ? col.bg : "transparent",
        }}
      >
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: col.bg, color: col.text, border: `1px solid ${col.border}`,
          whiteSpace: "nowrap",
        }}>{alert.severity}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {vlanTypeLabel[alert.type] || alert.type}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{alert.sourceIP}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>VLAN {alert.targetVLAN}</span>
        <span style={{
          fontSize: 10, padding: "2px 6px", borderRadius: 4,
          background: alert.resolved ? "rgba(46,213,115,0.12)" : "rgba(255,255,255,0.05)",
          color: alert.resolved ? "#2ed573" : "var(--text-muted)",
        }}>{alert.resolved ? "Resolved" : "Active"}</span>
        {open ? <ChevronDown size={14} color="var(--text-muted)"/> : <ChevronRight size={14} color="var(--text-muted)"/>}
      </div>
      {open && (
        <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderTop: `1px solid ${col.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Evidence</div>
              {alert.evidence.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span style={{ color: col.text, flexShrink: 0 }}>▸</span> {e}
                </div>
              ))}
              {alert.sourceMAC && (
                <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>MAC: {alert.sourceMAC}</div>
              )}
              <div style={{ marginTop: 4, fontSize: 10, color: "var(--text-muted)" }}>
                Confidence: {Math.round(alert.confidence * 100)}% · {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2ed573", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Mitigations</div>
              {alert.mitigations.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                  <CheckCircle size={11} style={{ color: "#2ed573", flexShrink: 0, marginTop: 1 }}/> {m}
                </div>
              ))}
            </div>
          </div>
          {!alert.resolved && (
            <button
              onClick={() => onResolve(alert.id)}
              style={{
                marginTop: 12, padding: "5px 14px", borderRadius: 6, border: "1px solid #2ed573",
                background: "rgba(46,213,115,0.1)", color: "#2ed573", cursor: "pointer", fontSize: 11,
              }}
            >
              ✓ Mark Resolved
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const NetworkIntelligence: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "osfingerprint" | "vpn" | "vlan">("overview");
  const [loading,   setLoading]   = useState(false);
  const [analyzeIP, setAnalyzeIP] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [fingerprints,  setFingerprints]  = useState<OSFingerprint[]>([]);
  const [vpnResult,     setVpnResult]     = useState<VPNResult | null>(null);
  const [vpnIP,         setVpnIP]         = useState("");
  const [vlanAlerts,    setVlanAlerts]    = useState<VLANAlert[]>([]);
  const [vlanStats,     setVlanStats]     = useState<Record<string, number>>({});
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [simType,       setSimType]       = useState("DOUBLE_TAGGING");
  const [simLoading,    setSimLoading]    = useState(false);
  const [error,         setError]         = useState("");
  const [autoRefresh,   setAutoRefresh]   = useState(false);

  const token = () => sessionStorage.getItem("sentinel_token") || "";

  const api = useCallback(async (path: string, method = "GET", body?: any) => {
    const res = await fetch(`/api/netintel${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
    return res.json();
  }, []);

  const loadFingerprints = useCallback(async () => {
    try {
      const data = await api("/fingerprints");
      setFingerprints(data.fingerprints || []);
    } catch { /* silent */ }
  }, [api]);

  const loadVLANAlerts = useCallback(async () => {
    try {
      const [alerts, stats] = await Promise.all([
        api("/vlan/alerts?minutes=120"),
        api("/vlan/stats"),
      ]);
      setVlanAlerts(alerts.alerts || []);
      setVlanStats(stats);
    } catch { /* silent */ }
  }, [api]);

  useEffect(() => { loadFingerprints(); loadVLANAlerts(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { loadFingerprints(); loadVLANAlerts(); }, 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, loadFingerprints, loadVLANAlerts]);

  const runAnalysis = async () => {
    if (!analyzeIP.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await api("/analyze", "POST", { ip: analyzeIP.trim(), checkVLAN: true });
      setAnalyzeResult(res);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const runVPNCheck = async () => {
    if (!vpnIP.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await api("/vpn", "POST", { ip: vpnIP.trim() });
      setVpnResult(res);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const runSimulation = async () => {
    setSimLoading(true);
    try {
      await api("/vlan/simulate", "POST", { type: simType });
      await loadVLANAlerts();
    } catch { /* silent */ }
    setSimLoading(false);
  };

  const resolveAlert = async (id: string) => {
    try {
      await api(`/vlan/resolve/${id}`, "POST");
      setVlanAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    } catch { /* silent */ }
  };

  // ─── Risk gauge (defined inside to access RiskGauge scope) ───────────────────
  const RiskGauge = ({ score, level }: { score: number; level: string }) => {
    const col = severityColor(level);
    const arc = (score / 100) * 251; // circumference ~= 251
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <svg width="100" height="60" viewBox="0 0 100 55">
          <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round"/>
          <path
            d="M10 50 A40 40 0 0 1 90 50" fill="none"
            stroke={col.text} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 125.6} 125.6`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
          <text x="50" y="46" textAnchor="middle" fill={col.text} fontSize="14" fontWeight="700">{score}</text>
        </svg>
        <span style={{ color: col.text, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{level}</span>
      </div>
    );
  };


  // ─── Tab styles ────────────────────────────────────────────────────────────
  // (AlertRow is now a top-level component above)
  const tabs = [
    { id: "overview",     label: "Overview",         icon: <LayoutGrid size={14}/> },
    { id: "osfingerprint",label: "OS Fingerprinting", icon: <Cpu size={14}/> },
    { id: "vpn",          label: "VPN Detection",     icon: <Eye size={14}/> },
    { id: "vlan",         label: "VLAN Hopping",      icon: <Layers size={14}/> },
  ] as const;

  const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--border)",
      borderRadius: 12, padding: 18, ...extra,
    }}>{children}</div>
  );

  const cardTitle = (icon: React.ReactNode, title: string, sub?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ color: "var(--accent)", opacity: 0.85 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: "linear-gradient(135deg, #6c5ce7, #a855f7)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={20} color="#fff"/>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              Network Intelligence
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
              Stealth OS Fingerprinting · VPN/TOR Detection · VLAN Hopping Analysis
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
              background: autoRefresh ? "rgba(108,92,231,0.15)" : "transparent",
              color: autoRefresh ? "#a855f7" : "var(--text-muted)", cursor: "pointer", fontSize: 11,
            }}
          >
            <RefreshCw size={13} style={{ animation: autoRefresh ? "spin 2s linear infinite" : "none" }}/> 
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh"}
          </button>
          <button
            onClick={() => { loadFingerprints(); loadVLANAlerts(); }}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid var(--accent)",
              background: "rgba(108,92,231,0.12)", color: "var(--accent)", cursor: "pointer", fontSize: 11,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: "transparent",
              color: activeTab === t.id ? "var(--accent)" : "var(--text-muted)",
              borderBottom: activeTab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.3)",
          color: "#ff4757", fontSize: 12,
        }}>⚠ {error}</div>
      )}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Analyze IP Card */}
          {card(<>
            {cardTitle(<Target size={16}/>, "Threat Analysis", "Combined OS + VPN + VLAN check")}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                value={analyzeIP}
                onChange={e => setAnalyzeIP(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runAnalysis()}
                placeholder="Enter IP address…"
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.04)", color: "var(--text-primary)", fontSize: 12,
                  outline: "none",
                }}
              />
              <button
                onClick={runAnalysis} disabled={loading}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: loading ? "rgba(108,92,231,0.3)" : "var(--accent)",
                  color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 12,
                }}
              >{loading ? "Analyzing…" : "Analyze"}</button>
            </div>
            {analyzeResult && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
                  <RiskGauge score={analyzeResult.riskScore} level={analyzeResult.riskLevel}/>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                      {analyzeResult.ip}
                    </div>
                    {analyzeResult.flags.slice(0, 4).map((f, i) => (
                      <div key={i} style={{
                        display: "inline-block", marginRight: 4, marginBottom: 4,
                        padding: "2px 7px", borderRadius: 4, fontSize: 9,
                        background: "rgba(255,71,87,0.12)", color: "#ff4757",
                        border: "1px solid rgba(255,71,87,0.25)",
                      }}>{f}</div>
                    ))}
                  </div>
                </div>
                {analyzeResult.recommendations.length > 0 && (
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(46,213,115,0.07)", border: "1px solid rgba(46,213,115,0.2)" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#2ed573", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Recommendations</div>
                    {analyzeResult.recommendations.map((r, i) => (
                      <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>→ {r}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>, { gridColumn: "span 2" })}

          {/* Quick stats */}
          {card(<>
            {cardTitle(<Activity size={16}/>, "System Status", "Live detection counters")}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "OS Fingerprints",   value: fingerprints.length,                     icon: <Cpu size={14}/>,     col: "#6c5ce7" },
                { label: "VLAN Alerts",        value: vlanAlerts.filter(a=>!a.resolved).length, icon: <Layers size={14}/>,  col: "#ff4757" },
                { label: "Critical Alerts",    value: vlanAlerts.filter(a=>a.severity==="CRITICAL"&&!a.resolved).length, icon: <Zap size={14}/>, col: "#ff6b81" },
              ].map(item => (
                <div key={item.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: item.col }}>
                    {item.icon}
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: item.col }}>{item.value}</span>
                </div>
              ))}
            </div>
          </>)}

          {/* VLAN alert types */}
          {card(<>
            {cardTitle(<Network size={16}/>, "VLAN Attack Distribution")}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(vlanStats).length === 0
                ? <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No VLAN alerts yet — use Simulate to test.</div>
                : Object.entries(vlanStats).map(([type, count]) => {
                    const c = count as number;
                    const max = Math.max(...(Object.values(vlanStats) as number[]));
                    return (
                      <div key={type}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{vlanTypeLabel[type] || type}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{count}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(c/max)*100}%`, background: "var(--accent)", borderRadius: 2 }}/>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </>, { gridColumn: "span 2" })}

          {/* OS families */}
          {card(<>
            {cardTitle(<Monitor size={16}/>, "Detected OS Families")}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fingerprints.length === 0
                ? <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No fingerprints yet.</div>
                : (() => {
                    const counts: Record<string, number> = {};
                    fingerprints.forEach(f => { counts[f.family] = (counts[f.family]||0)+1; });
                    return Object.entries(counts).map(([family, n]) => (
                      <div key={family} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12 }}>{osFamilyIcon(family)} {family}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{n}</span>
                      </div>
                    ));
                  })()
              }
            </div>
          </>)}
        </div>
      )}

      {/* ── OS FINGERPRINTING ─────────────────────────────────────────────── */}
      {activeTab === "osfingerprint" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {card(<>
            {cardTitle(<Cpu size={16}/>, "Passive OS Fingerprint Engine",
              "Identifies OS via TTL, TCP window size, User-Agent, DNS patterns, and TLS cipher analysis")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "TTL Analysis",         desc: "Windows=128, Linux=64, Cisco=255",      icon: "🎯" },
                { label: "TCP Window Size",       desc: "Win10=64240, Ubuntu=29200, iOS=65535",  icon: "📐" },
                { label: "User-Agent Parsing",    desc: "HTTP-layer OS + browser detection",     icon: "🌐" },
                { label: "DNS Query Patterns",    desc: "update.microsoft.com → Windows",        icon: "🔍" },
                { label: "TLS Cipher Suites",     desc: "JA3-style fingerprinting",              icon: "🔐" },
                { label: "Behavioral Analysis",   desc: "SYN floods, RST storms, port scans",    icon: "📊" },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "10px 12px", borderRadius: 8,
                  background: "rgba(108,92,231,0.07)", border: "1px solid rgba(108,92,231,0.2)",
                }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </>)}

          {/* Manual fingerprint */}
          {card(<>
            {cardTitle(<Zap size={16}/>, "Manual Fingerprint",
              "Supply TCP parameters to fingerprint an IP")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              {[
                { placeholder: "Target IP", key: "ip"         },
                { placeholder: "TTL (e.g. 128)", key: "ttl"   },
                { placeholder: "Window Size", key: "ws"       },
              ].map(f => (
                <input
                  key={f.key} placeholder={f.placeholder}
                  id={`fp-${f.key}`}
                  style={{
                    flex: "1 1 160px", padding: "8px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)",
                    color: "var(--text-primary)", fontSize: 12, outline: "none",
                  }}
                />
              ))}
              <button
                onClick={async () => {
                  const ip = (document.getElementById("fp-ip") as HTMLInputElement)?.value;
                  const ttl = (document.getElementById("fp-ttl") as HTMLInputElement)?.value;
                  const ws  = (document.getElementById("fp-ws")  as HTMLInputElement)?.value;
                  if (!ip) return;
                  setLoading(true);
                  try {
                    await api("/fingerprint", "POST", {
                      ip, ttl: ttl ? Number(ttl) : undefined,
                      windowSize: ws ? Number(ws) : undefined,
                    });
                    await loadFingerprints();
                  } catch { /* */ }
                  setLoading(false);
                }}
                disabled={loading}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12,
                }}
              >{loading ? "…" : "Fingerprint"}</button>
            </div>
          </>)}

          {/* Results table */}
          {card(<>
            {cardTitle(<TrendingUp size={16}/>, `Fingerprint Cache (${fingerprints.length})`)}
            {fingerprints.length === 0
              ? <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  No fingerprints in cache. Analyze an IP or make requests through the proxy.
                </div>
              : <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["IP","OS","Family","Version","Confidence","TTL","Window","Source","Time"].map(h=>(
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fingerprints.map((fp, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "8px 10px", color: "var(--accent)", fontFamily: "monospace" }}>{fp.ip}</td>
                          <td style={{ padding: "8px 10px", color: "var(--text-primary)", fontWeight: 600 }}>{osFamilyIcon(fp.family)} {fp.os}</td>
                          <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{fp.family}</td>
                          <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{fp.version}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{
                                width: 40, height: 5, borderRadius: 3, overflow: "hidden",
                                background: "rgba(255,255,255,0.08)"
                              }}>
                                <div style={{
                                  height: "100%", width: `${fp.confidence*100}%`,
                                  background: fp.confidence > 0.8 ? "#2ed573" : fp.confidence > 0.6 ? "#ffa502" : "#ff4757",
                                  borderRadius: 3,
                                }}/>
                              </div>
                              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{Math.round(fp.confidence*100)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "8px 10px", color: "var(--text-secondary)", fontFamily: "monospace" }}>{fp.ttl || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "var(--text-secondary)", fontFamily: "monospace" }}>{fp.windowSize || "—"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, background: "rgba(108,92,231,0.15)", color: "#a855f7" }}>
                              {fp.source}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", color: "var(--text-muted)" }}>{new Date(fp.detectedAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </>)}
        </div>
      )}

      {/* ── VPN DETECTION ─────────────────────────────────────────────────── */}
      {activeTab === "vpn" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {card(<>
            {cardTitle(<Eye size={16}/>, "VPN / TOR / Proxy Detection Engine",
              "7-method pipeline with CVE-2024-3661 TunnelVision detection")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 0 }}>
              {[
                { label: "Provider Database",     desc: "NordVPN, ExpressVPN, Mullvad, ProtonVPN, +6 more", icon: "📋" },
                { label: "TOR Exit Nodes",         desc: "Live list from torproject.org (6h refresh)",        icon: "🧅" },
                { label: "Datacenter ASN",         desc: "AWS, Azure, GCP, DigitalOcean, Hetzner, OVH",      icon: "🏢" },
                { label: "DNS PTR Keywords",        desc: "Reverse lookup: vpn, proxy, tor, relay, tunnel",    icon: "🔍" },
                { label: "Geo-Distance",           desc: ">5,000km from Malawi = suspicious",                icon: "🌍" },
                { label: "ip-api Proxy Flag",      desc: "Commercial IP intelligence feed",                   icon: "⚡" },
                { label: "CVE-2024-3661",           desc: "TunnelVision DHCP opt-121 route injection",        icon: "🚨" },
                { label: "Compound Scoring",       desc: "3+ methods = +8% confidence boost",                icon: "📊" },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "10px 12px", borderRadius: 8,
                  background: "rgba(255,71,87,0.05)", border: "1px solid rgba(255,71,87,0.15)",
                }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </>)}

          {card(<>
            {cardTitle(<Globe size={16}/>, "Check an IP Address")}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input
                value={vpnIP}
                onChange={e => setVpnIP(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runVPNCheck()}
                placeholder="Enter IP address to check (e.g. 185.220.101.42)…"
                style={{
                  flex: 1, padding: "9px 14px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.04)", color: "var(--text-primary)", fontSize: 12, outline: "none",
                }}
              />
              <button
                onClick={runVPNCheck} disabled={loading}
                style={{
                  padding: "9px 20px", borderRadius: 8, border: "none",
                  background: loading ? "rgba(255,71,87,0.3)" : "#ff4757",
                  color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700,
                }}
              >{loading ? "Scanning…" : "Check IP"}</button>
            </div>

            {vpnResult && (() => {
              const col = severityColor(vpnResult.riskLevel);
              return (
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start" }}>
                  <div style={{
                    padding: "20px 24px", borderRadius: 12, textAlign: "center",
                    background: col.bg, border: `1px solid ${col.border}`, minWidth: 160,
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>
                      {vpnResult.isTOR ? "🧅" : vpnResult.isVPN ? "🔴" : "🟢"}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: col.text }}>{vpnResult.riskLevel}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Risk Level</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: col.text }}>{Math.round(vpnResult.confidence*100)}%</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Confidence</div>
                  </div>
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        { label: "VPN Detected",    val: vpnResult.isVPN    ? "YES" : "No", warn: vpnResult.isVPN },
                        { label: "TOR Node",         val: vpnResult.isTOR    ? "YES" : "No", warn: vpnResult.isTOR },
                        { label: "Proxy/Anonymizer", val: vpnResult.isProxy  ? "YES" : "No", warn: vpnResult.isProxy },
                        { label: "Datacenter IP",    val: vpnResult.isDatacenter ? "YES" : "No", warn: vpnResult.isDatacenter },
                        { label: "Provider",         val: vpnResult.provider || "Unknown", warn: false },
                        { label: "ASN / Org",        val: vpnResult.asnOrg   || "Unknown", warn: false },
                        { label: "Location",         val: vpnResult.country  || "Unknown", warn: false },
                        { label: "Distance from MW", val: vpnResult.distanceKm ? `${vpnResult.distanceKm} km` : "Unknown", warn: (vpnResult.distanceKm||0) > 5000 },
                      ].map(item => (
                        <div key={item.label} style={{
                          padding: "7px 10px", borderRadius: 7,
                          background: item.warn ? "rgba(255,71,87,0.08)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${item.warn ? "rgba(255,71,87,0.25)" : "var(--border)"}`,
                        }}>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>{item.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: item.warn ? "#ff4757" : "var(--text-primary)" }}>
                            {item.val}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Detection Methods</div>
                    {vpnResult.methods.map((m, i) => (
                      <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>
                        <span style={{ color: "#ff4757" }}>▸</span> {m}
                      </div>
                    ))}
                    {vpnResult.cveTunnelvision && (
                      <div style={{
                        marginTop: 10, padding: "8px 12px", borderRadius: 8,
                        background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.35)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#ff4757", marginBottom: 3 }}>⚠ CVE-2024-3661 TunnelVision Indicator</div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                          This IP exhibits characteristics consistent with the TunnelVision attack — a technique that routes VPN traffic
                          outside the encrypted tunnel via rogue DHCP option 121, de-anonymising VPN users.
                          Enable DHCP snooping and enforce RFC 3442 on edge routers.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>)}
        </div>
      )}

      {/* ── VLAN HOPPING ──────────────────────────────────────────────────── */}
      {activeTab === "vlan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Info + Simulate */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16 }}>
            {card(<>
              {cardTitle(<Layers size={16}/>, "VLAN Hopping Detection Engine",
                "802.1Q double-tagging · DTP switch spoof · DHCP option-121 injection (CVE-2024-3661)")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                  { label: "Double Tagging",    desc: "802.1Q QinQ frame with outer + inner VLAN tag — classic hop attack",             col: "#ff4757" },
                  { label: "VLAN Scanning",     desc: "Source IP probing 3+ VLANs in 5-minute window — active reconnaissance",         col: "#ffa502" },
                  { label: "Switch Spoofing",   desc: "Same MAC on different VLANs — possible DTP trunk negotiation attack",            col: "#ff6b81" },
                  { label: "DHCP Injection",    desc: "CVE-2024-3661: rogue DHCP opt-121 re-routes traffic outside VPN tunnel",         col: "#ff4757" },
                  { label: "Unauthorized Access",desc: "Unknown device accessing critical VLAN (Banking, Govt, Telecom, Utility)",       col: "#ffa502" },
                  { label: "Protocol Anomaly",  desc: "Single protocol dominates VLAN > 80% — possible covert channel or C2 traffic",   col: "#eccc68" },
                ].map(item => (
                  <div key={item.label} style={{ padding: "9px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.col, marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </>)}

            {card(<>
              {cardTitle(<Play size={16}/>, "Simulate Attack", "Test detection engine")}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select
                  value={simType}
                  onChange={e => setSimType(e.target.value)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontSize: 11,
                    cursor: "pointer", outline: "none",
                  }}
                >
                  {VLAN_SIM_TYPES.map(t => (
                    <option key={t} value={t} style={{ background: "#1a1a2e" }}>
                      {vlanTypeLabel[t] || t}
                    </option>
                  ))}
                </select>
                <button
                  onClick={runSimulation} disabled={simLoading}
                  style={{
                    padding: "9px 0", borderRadius: 8, border: "none",
                    background: simLoading ? "rgba(255,71,87,0.3)" : "#ff4757",
                    color: "#fff", cursor: simLoading ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 700,
                  }}
                >{simLoading ? "Simulating…" : "▶ Run Simulation"}</button>
                <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>
                  Injects a synthetic attack event into the detection engine
                </div>
              </div>
            </>, { minWidth: 220 })}
          </div>

          {/* Active alerts */}
          {card(<>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={16} style={{ color: "#ff4757" }}/>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    VLAN Alerts ({vlanAlerts.filter(a=>!a.resolved).length} active)
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Last 2 hours — click to expand evidence &amp; mitigations</div>
                </div>
              </div>
              <button onClick={loadVLANAlerts} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>
                <RefreshCw size={12} style={{ display: "inline", marginRight: 4 }}/>Refresh
              </button>
            </div>
            {vlanAlerts.length === 0
              ? <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  No VLAN alerts detected. Use the Simulate panel above to test.
                </div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {vlanAlerts.map(alert => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      onResolve={resolveAlert}
                      expandedAlert={expandedAlert}
                      setExpandedAlert={setExpandedAlert}
                    />
                  ))}
                </div>
            }
          </>)}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        select option { background: #1a1a2e !important; }
      `}</style>
    </div>
  );
};

export default NetworkIntelligence;
