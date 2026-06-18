import React, { useState, useEffect, useCallback } from "react";
import {
  Activity, Terminal, BarChart3,
  Globe, RefreshCw, Video, Database,
  LogOut, User, Users, Search, X,
  ShieldCheck, AlertTriangle, Radio,
  Monitor, Code2, FileText, Settings, BookOpen,
  MapPin, Zap, TrendingUp, FolderLock, Wifi, Brain
} from "lucide-react";
import { Incident, NationalStats } from "./types";
import { useRealTimeStats } from "./hooks/useRealTimeStats";
import LiveKpiBar from "./components/LiveKpiBar";
import GlobalAiChat from "./components/GlobalAiChat";
import ReportForm from "./components/ReportForm";
import RoleConsole from "./components/RoleConsole";
import LiveFeed from "./components/LiveFeed";
import ThreatIntelDatabase from "./components/ThreatIntelDatabase";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import CctvSurveillance from "./components/CctvSurveillance";
import DatabaseConsole from "./components/DatabaseConsole";
import LoginPage from "./components/LoginPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { LitSecureIcon, LitSecureWordmark } from "./components/LitSecureLogo";
import AiThreatAnalysis from "./components/AiThreatAnalysis";
import SituationRoom from "./components/SituationRoom";
import EdrEndpointProtection from "./components/EdrEndpointProtection";
import SecurityRulesOrchestrator from "./components/SecurityRulesOrchestrator";
import ReportsRecommendations from "./components/ReportsRecommendations";
import IntegrationsSettings from "./components/IntegrationsSettings";
import CyberAwarenessHub from "./components/CyberAwarenessHub";
import MalawiRiskMap from "./components/MalawiRiskMap";
import CampaignCorrelation from "./components/CampaignCorrelation";
import SectorRiskScoring from "./components/SectorRiskScoring";
import NotificationCenter from "./components/NotificationCenter";
import EvidenceVault from "./components/EvidenceVault";
import CyberTerminal from "./components/CyberTerminal";
import UserManagement from "./components/UserManagement";
import SocialMediaMonitor from "./components/SocialMediaMonitor";
import CyberIntelligence  from "./components/CyberIntelligence";
import PortalDashboard from "./components/PortalDashboard";
import PublicPortal from "./components/PublicPortal";
import NetworkIntelligence from "./components/NetworkIntelligence";
import GlobalCyberMap from "./components/GlobalCyberMap";
import PolicyManagement from "./components/PolicyManagement";
import TakedownTracker from "./components/TakedownTracker";
import ReputationChecker from "./components/ReputationChecker";
import CyberAwarenessTraining from "./components/CyberAwarenessTraining";
import StixExportPanel from "./components/StixExportPanel";
import PublicReportPage from "./components/PublicReportPage";
import IncidentReportManager from "./components/IncidentReportManager";
import AiLearningPanel from "./components/AiLearningPanel";

// ─── Auth ─────────────────────────────────────────────────────────────────────
interface AuthUser { id: string; email: string; name: string; role: string; }

function getStoredAuth(): { token: string | null; user: AuthUser | null } {
  const token = sessionStorage.getItem("sentinel_token");
  const userStr = sessionStorage.getItem("sentinel_user");
  return { token, user: userStr ? JSON.parse(userStr) : null };
}

// ─── Tabs config ──────────────────────────────────────────────────────────────
// Role-based tab visibility
// allowedRoles: which roles can see this tab.
// ─── Role → visible tabs mapping ─────────────────────────────────────────────
// Each role sees ONLY the tabs listed in its allowedRoles array.
// admin / super_admin / gov_admin / soc_manager  → full system
// analyst      → intel-focused:  portal, intel, analytics, patterns, scoring, campaigns, riskmap, social, cyberintel, reports, awareness
// investigator → case-focused:   portal, command, situation, riskmap, campaigns, cctv, logs, evidence, cyberintel, netintel, reports, awareness
// auditor      → read-only view: portal, logs, intel, analytics, scoring, reports, awareness
const TABS = [
  { id: "portal",    icon: ShieldCheck, label: "Incident Portal",      short: "Portal",      allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator","auditor","org_user"] },
  { id: "command",   icon: Terminal,    label: "Threat Terminal",       short: "Terminal",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator"] },
  { id: "cyberterm", icon: Code2,       label: "Cyber Terminal",        short: "CyberTerm",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager"] },
  { id: "situation", icon: Radio,       label: "Situation Room",        short: "Situation",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator"] },
  { id: "riskmap",   icon: MapPin,      label: "National Risk Map",     short: "Risk Map",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator","auditor"] },
  { id: "campaigns", icon: Zap,         label: "Campaign Correlation",  short: "Campaigns",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator"] },
  { id: "scoring",   icon: TrendingUp,  label: "Sector Risk Scores",    short: "Scoring",     allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","auditor"] },
  { id: "edr",       icon: Monitor,     label: "EDR Endpoint",          short: "EDR",         allowedRoles: ["admin","super_admin","gov_admin","soc_manager"] },
  { id: "rules",     icon: Code2,       label: "Rules Orchestrator",    short: "Rules",       allowedRoles: ["admin","super_admin","gov_admin","soc_manager"] },
  { id: "cctv",      icon: Video,       label: "CCTV Surveillance",     short: "CCTV",        allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator"] },
  { id: "logs",      icon: Activity,    label: "Infrastructure Logs",   short: "Logs",        allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator","auditor"] },
  { id: "intel",     icon: Globe,       label: "Threat Intelligence",   short: "Intel",       allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","auditor"] },
  { id: "analytics", icon: BarChart3,   label: "National Analytics",    short: "Analytics",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","auditor"] },
  { id: "patterns",  icon: Activity,    label: "Pattern Intelligence",  short: "Patterns",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst"] },
  { id: "reports",   icon: FileText,    label: "Reports",               short: "Reports",     allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator","auditor"] },
  { id: "evidence",  icon: FolderLock,  label: "Evidence Vault",        short: "Evidence",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator"] },
  { id: "settings",  icon: Settings,    label: "Integrations",          short: "Settings",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager"] },
  { id: "awareness", icon: BookOpen,    label: "Awareness Hub",         short: "Awareness",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator","auditor","org_user"] },
  { id: "database",  icon: Database,    label: "Database Console",      short: "Database",    allowedRoles: ["admin","super_admin"] },
  { id: "users",     icon: Users,       label: "User Management",       short: "Users",       allowedRoles: ["admin","super_admin"] },
  { id: "social",    icon: Wifi,        label: "Social Monitor",        short: "Social",      allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst"] },
  { id: "cyberintel",icon: ShieldCheck, label: "Cyber Intel Hub",        short: "Cyber Intel", allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst"], badge: "NEW" },
  { id: "netintel",  icon: Wifi,        label: "Network Intelligence",   short: "Net Intel",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator"], badge: "NEW" },
  { id: "globalmap", icon: Globe,       label: "Global Threat Map",      short: "Global Map",  allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst"], badge: "P1" },
  { id: "policies",   icon: ShieldCheck,  label: "Policy Engine",          short: "Policies",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager"], badge: "P2" },
  { id: "takedown",   icon: Globe,        label: "Takedown Tracker",        short: "Takedowns",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","investigator"], badge: "P2" },
  { id: "reputation", icon: ShieldCheck,  label: "Reputation Checker",      short: "Reputation",  allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator"], badge: "P2" },
  { id: "training",   icon: BookOpen,     label: "Awareness Training",      short: "Training",    allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator","auditor","org_user"], badge: "P3" },
  { id: "stix",       icon: Globe,        label: "STIX/TAXII Export",        short: "STIX",        allowedRoles: ["admin","super_admin","gov_admin","soc_manager"], badge: "P3" },
  { id: "incidentmgr",icon: FileText,     label: "Incident Manager",          short: "Inc. Mgr",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator"], badge: "NEW" },
  { id: "ailearn",    icon: Brain,        label: "AI Learning Center",        short: "AI Learn",   allowedRoles: ["admin","super_admin","gov_admin","soc_manager","analyst","investigator"], badge: "ML" },
] as const;
type TabId = typeof TABS[number]["id"];

// Filter tabs visible for a given role
function getVisibleTabs(role: string) {
  return TABS.filter(t => (t as any).allowedRoles?.includes(role) ?? true);
}

// ─── LiveSectorNodes ─────────────────────────────────────────────────────────
type NodeStatus = "CONNECTED" | "CONNECTING" | "MONITORING" | "OFFLINE";
interface SectorNode {
  id: string; label: string; org: string;
  status: NodeStatus; latencyMs: number; uptime: string;
}

const SECTOR_NODES_CONFIG = [
  { id: "tnm",      label: "TNM Mpamba",       org: "Telecom / Mobile Money" },
  { id: "airtel",   label: "Airtel Money",      org: "Telecom / Mobile Money" },
  { id: "rbm",      label: "Reserve Bank MW",   org: "Central Banking"        },
  { id: "macra",    label: "MACRA Gateway",     org: "Regulator / MACERT"     },
  { id: "gov",      label: "Malawi Gov Portal", org: "e-Government Services"  },
  { id: "stdbank",  label: "Standard Bank MW",  org: "Commercial Banking"     },
  { id: "police",   label: "Police Cybercrime", org: "Law Enforcement"        },
  { id: "skyband",  label: "Skyband ISP",       org: "Internet Service"       },
];

function randomStatus(seed: number): NodeStatus {
  const r = (seed * 9301 + 49297) % 233280 / 233280;
  if (r > 0.85) return "MONITORING";
  if (r > 0.75) return "CONNECTING";
  if (r > 0.92) return "OFFLINE";
  return "CONNECTED";
}

function LiveSectorNodes() {
  const [nodes, setNodes] = React.useState<SectorNode[]>(() =>
    SECTOR_NODES_CONFIG.map((n, i) => ({
      ...n,
      status: randomStatus(i + Date.now() % 100) as NodeStatus,
      latencyMs: 18 + Math.floor(Math.random() * 120),
      uptime: `${99 + (i % 2 === 0 ? 0 : 0)}.${80 + Math.floor(Math.random() * 19)}%`,
    }))
  );
  const [lastChecked, setLastChecked] = React.useState<Date>(new Date());
  const [checking, setChecking] = React.useState(false);

  const runCheck = React.useCallback(async () => {
    setChecking(true);
    try {
      const start = Date.now();
      const res = await fetch("/api/health");
      const apiMs = Date.now() - start;
      const ok = res.ok;
      setNodes(prev => prev.map((n, i) => {
        const simMs = apiMs + Math.floor(Math.random() * 80) - 20;
        const simStatus: NodeStatus = !ok
          ? "OFFLINE"
          : n.id === "macra" ? "CONNECTED"
          : randomStatus(i + Date.now() % 999);
        return { ...n, status: simStatus, latencyMs: Math.max(8, simMs) };
      }));
    } catch {
      setNodes(prev => prev.map(n => ({ ...n, status: "OFFLINE" as NodeStatus })));
    } finally {
      setChecking(false);
      setLastChecked(new Date());
    }
  }, []);

  React.useEffect(() => {
    runCheck();
    const timer = setInterval(runCheck, 15000);
    return () => clearInterval(timer);
  }, [runCheck]);

  const statusStyle: Record<NodeStatus, { dot: string; text: string; badge: string }> = {
    CONNECTED:  { dot: "bg-emerald-400 animate-pulse", text: "text-emerald-400",  badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"  },
    CONNECTING: { dot: "bg-amber-400 animate-ping",    text: "text-amber-400",    badge: "border-amber-500/30 bg-amber-500/10 text-amber-400"         },
    MONITORING: { dot: "bg-blue-400 animate-pulse",    text: "text-blue-400",     badge: "border-blue-500/30 bg-blue-500/10 text-blue-400"            },
    OFFLINE:    { dot: "bg-rose-500",                  text: "text-rose-400",     badge: "border-rose-500/30 bg-rose-500/10 text-rose-400"            },
  };

  const connectedCount = nodes.filter(n => n.status === "CONNECTED").length;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
          <div className="w-1 h-4 bg-emerald-400 rounded" />
          Sector Integration Nodes
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-slate-500">{connectedCount}/{nodes.length} online</span>
          <button
            onClick={runCheck}
            disabled={checking}
            className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-[#FFD600] transition"
            title="Refresh node status"
          >
            <RefreshCw className={`w-3 h-3 ${checking ? "animate-spin text-[#FFD600]" : ""}`} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {nodes.map(node => {
          const s = statusStyle[node.status];
          return (
            <div key={node.id} className="flex items-center justify-between gap-2 group">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <div className="min-w-0">
                  <p className="text-[11px] font-mono font-semibold text-slate-300 truncate">{node.label}</p>
                  <p className="text-[9px] text-slate-600 truncate">{node.org}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] font-mono text-slate-600 hidden group-hover:inline">{node.latencyMs}ms</span>
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${s.badge}`}>
                  {node.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-slate-700 font-mono border-t border-white/5 pt-2">
        Last checked: {lastChecked.toLocaleTimeString()} · Auto-refresh: 15s
      </p>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth]           = useState(getStoredAuth);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats]         = useState<NationalStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("portal");
  // ── Reset active tab to first allowed tab when user role changes ──────────
  const prevUserIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const uid = auth.user?.id ?? null;
    if (uid !== prevUserIdRef.current) {
      prevUserIdRef.current = uid;
      if (uid) {
        const allowed = getVisibleTabs(auth.user!.role);
        if (!allowed.find(t => t.id === activeTab)) {
          setActiveTab((allowed[0]?.id ?? "portal") as TabId);
        }
      }
    }
  }, [auth.user?.id, auth.user?.role]);
  const [aiChatIncidentId, setAiChatIncidentId] = useState<string>("");
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  // ── Live real-time stats (Supabase or API polling) ────────────────────────
  const liveStats = useRealTimeStats();

  const handleLogin = (token: string, user: AuthUser) => {
    sessionStorage.setItem("sentinel_token", token);
    sessionStorage.setItem("sentinel_user", JSON.stringify(user));
    setAuth({ token, user });
  };

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    sessionStorage.removeItem("sentinel_token");
    sessionStorage.removeItem("sentinel_user");
    setAuth({ token: null, user: null });
  };

  const fetchAppData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const [incRes, statsRes] = await Promise.all([
        fetch("/api/incidents"),
        fetch("/api/incidents/meta/stats"),
      ]);
      if (incRes.ok && statsRes.ok) {
        setIncidents(await incRes.json());
        setStats(await statsRes.json());
      }
    } catch (err) {
      console.error("Sentinel data sync error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.token) { setLoading(false); return; }
    fetchAppData();
    const interval = setInterval(() => fetchAppData(false), 10000);
    return () => clearInterval(interval);
  }, [auth.token, fetchAppData]);

  const handleIncidentAdded = (newIncident: Incident) => {
    setIncidents(prev => [newIncident, ...prev]);
    fetchAppData(false);
  };

  // ─── Pre-login Public Citizen Portal (⁠?report=1 or #/report in URL) ─────────────
  // Citizens can report cyber crimes without creating an account.
  const isPublicReportURL =
    window.location.search.includes("report=1") ||
    window.location.hash.includes("/report") ||
    window.location.pathname === "/report";

  if (isPublicReportURL && (!auth.token || !auth.user)) {
    return (
      <ErrorBoundary>
        <PublicReportPage onGoToLogin={() => {
          // Strip the public=1 param and go to login
          const url = new URL(window.location.href);
          url.searchParams.delete("report");
          url.hash = "";
          window.history.replaceState({}, "", url.toString());
          window.location.reload();
        }} />
      </ErrorBoundary>
    );
  }

  // ─── Unauthenticated (normal login) ──────────────────────────────────────────────────
  if (!auth.token || !auth.user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // ─── Citizen / Public Portal (citizen + org_user roles) ─────────────────
  const isCitizenRole = auth.user.role === "citizen" || auth.user.role === "org_user";
  if (isCitizenRole) {
    return (
      <ErrorBoundary>
        <PublicPortal
          user={auth.user}
          token={auth.token}
          onLogout={handleLogout}
          onIncidentAdded={handleIncidentAdded}
        />
      </ErrorBoundary>
    );
  }

  // ─── Loading splash ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#05080F] hero-globe flex flex-col items-center justify-center relative">
        <div className="absolute inset-0 bg-[#05080F]/80" />
        <div className="relative z-10 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FFD600]/10 border border-[#FFD600]/30 mb-2 animate-pulse">
            <LitSecureIcon size={36} />
          </div>
          <div className="font-bebas text-4xl text-white tracking-widest">LITSECURE SENTINEL</div>
          <p className="text-slate-500 text-xs font-mono tracking-wider">Initializing secure connection...</p>
          <div className="w-48 h-0.5 bg-[#0A0E1A] rounded-full overflow-hidden mx-auto">
            <div className="bg-[#FFD600] h-full rounded-full" style={{ width: "60%", animation: "shimmer 1.5s infinite" }} />
          </div>
        </div>
      </div>
    );
  }

  const ROLE_COLORS: Record<string, string> = {
    admin:        "bg-[#FFD600]/10 text-[#FFD600]    border-[#FFD600]/30",
    super_admin:  "bg-[#FFD600]/10 text-[#FFD600]    border-[#FFD600]/30",
    gov_admin:    "bg-purple-500/10 text-purple-400  border-purple-500/30",
    soc_manager:  "bg-orange-500/10 text-orange-400  border-orange-500/30",
    analyst:      "bg-blue-500/10   text-blue-400    border-blue-500/30",
    investigator: "bg-purple-500/10 text-purple-400  border-purple-500/30",
    auditor:      "bg-slate-500/10  text-slate-400   border-slate-500/30",
    org_user:     "bg-green-500/10  text-green-400   border-green-500/30",
  };

  const isAuditor = auth.user?.role === "auditor";
  const role = auth.user.role;
  const visibleTabs = getVisibleTabs(role);

  const filteredIncidents = globalSearch
    ? incidents.filter(i =>
        i.title.toLowerCase().includes(globalSearch.toLowerCase()) ||
        i.id.toLowerCase().includes(globalSearch.toLowerCase()) ||
        i.reporterOrg.toLowerCase().includes(globalSearch.toLowerCase()) ||
        i.category.toLowerCase().includes(globalSearch.toLowerCase())
      )
    : incidents;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#05080F] text-slate-100 flex flex-col selection:bg-[#FFD600]/30 selection:text-[#FFD600]">

        {/* ── TOP NAV (AngelOne style) ──────────────────────────────────────── */}
        <header className="sticky top-0 z-50 border-b border-white/5 bg-[#05080F]/90 backdrop-blur-xl">
          <div className="max-w-[1600px] mx-auto flex items-center gap-6 px-6 h-[62px]">

            {/* Logo */}
            <LitSecureWordmark size="sm" showSubtitle={false} className="shrink-0 mr-4" />

            {/* ── Tabs — role-filtered horizontal scroll nav ── */}
            <nav className="tab-nav-scroll">
              {visibleTabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-btn-${tab.id}`}
                    onClick={() => setActiveTab(tab.id as TabId)}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded transition whitespace-nowrap border-b-2 ${
                      active
                        ? "text-[#FFD600] border-[#FFD600] bg-[#FFD600]/5"
                        : "text-slate-400 border-transparent hover:text-slate-200 hover:border-white/20"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-[#FFD600]" : ""}`} />
                    <span className="hidden lg:block">{tab.label}</span>
                    <span className="lg:hidden">{tab.short}</span>
                    {(tab as any).badge && (
                      <span className="ml-0.5 text-[8px] font-bold bg-[#FFD600] text-[#05080F] px-1.5 py-0.5 rounded-full leading-none">{(tab as any).badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* ── Right section ── */}
            <div className="flex items-center gap-3 shrink-0 ml-2">
              {/* Gemini AI status badge */}
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded border border-purple-500/30 bg-purple-500/5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-purple-400 text-[9px] font-mono font-bold">GEMINI</span>
              </div>

              {/* Threat index */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono">
                <AlertTriangle className="w-3 h-3 text-orange-400" />
                <span className="text-orange-400 font-bold">ELEVATED</span>
              </div>

              <div className="w-px h-5 bg-white/10 hidden md:block" />

              {/* Refresh */}
              <button
                onClick={() => fetchAppData(true)}
                disabled={refreshing}
                className="p-1.5 text-slate-500 hover:text-[#FFD600] transition rounded hover:bg-[#FFD600]/5"
                title="Refresh telemetry"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#FFD600]" : ""}`} />
              </button>

              {/* Notifications */}
              <NotificationCenter onNavigate={(tab) => setActiveTab(tab as any)} />

              {/* User badge */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-bold ${ROLE_COLORS[auth.user.role] || "text-slate-400 border-white/10"}`}>
                <User className="w-3 h-3" />
                <span className="hidden sm:inline">{auth.user.name.split(" ")[0]}</span>
                <span className="opacity-60 uppercase">({auth.user.role})</span>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                id="logout-btn"
                className="btn-accent px-3 py-1.5 rounded text-[11px] flex items-center gap-1.5"
              >
                <LogOut className="w-3 h-3" />
                <span className="hidden sm:inline">LOGOUT</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── LIVE KPI BAR — always visible ───────────────────────────────── */}
        <LiveKpiBar stats={liveStats} />

        {/* ── AUDITOR READ-ONLY BANNER ──────────────────────────────────────── */}
        {/* ── Role context banners ── */}
        {isAuditor && (
          <div className="border-b border-slate-500/30 bg-slate-500/5 px-6 py-2 text-center">
            <span className="text-[11px] font-mono text-slate-400">
              👁 <strong className="text-slate-300">Auditor View</strong> — Read-only access. All actions are logged.
            </span>
          </div>
        )}
        {role === "analyst" && (
          <div className="border-b border-blue-500/20 bg-blue-500/5 px-6 py-1.5 text-center">
            <span className="text-[11px] font-mono text-blue-400">
              🔍 <strong>Analyst View</strong> — Intel, analytics, pattern intelligence and reporting tabs are available to you.
            </span>
          </div>
        )}
        {role === "investigator" && (
          <div className="border-b border-purple-500/20 bg-purple-500/5 px-6 py-1.5 text-center">
            <span className="text-[11px] font-mono text-purple-400">
              🔬 <strong>Investigator View</strong> — Evidence Vault, CCTV, and forensic investigation tools are available.
            </span>
          </div>
        )}
        {role === "soc_manager" && (
          <div className="border-b border-orange-500/20 bg-orange-500/5 px-6 py-1.5 text-center">
            <span className="text-[11px] font-mono text-orange-400">
              🎯 <strong>SOC Manager View</strong> — Full operational control: Situation Room, Campaigns, Rules and Settings.
            </span>
          </div>
        )}

        {/* ── HERO SECTION ────────────────────────────────────────────────── */}
        {activeTab === "portal" && (
          <div className="relative hero-globe overflow-hidden" style={{ height: "280px" }}>
            {/* Overlays */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#05080F]/40 via-[#05080F]/20 to-[#05080F]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#05080F]/70 to-transparent" />

            {/* Hero content */}
            <div className="relative z-10 max-w-[1600px] mx-auto px-6 pt-8 pb-4">
              <div className="inline-flex items-center gap-2 bg-[#FFD600]/10 border border-[#FFD600]/25 rounded-full px-4 py-1.5 mb-5">
                <span className="w-2 h-2 rounded-full bg-[#FFD600] animate-pulse" />
                <span className="text-[#FFD600] text-[10px] font-mono font-bold tracking-widest uppercase">MACRA — MACERT — MALAWI DEFENSE CYBER-CELL</span>
              </div>
              <h1 className="font-orbitron text-[46px] md:text-[64px] leading-none text-white mb-4 tracking-wide">
                PROTECTING <span className="text-[#FFD600]">MALAWI'S</span><br />DIGITAL INFRASTRUCTURE
              </h1>
              <p className="text-slate-300 text-sm max-w-xl font-grotesk leading-relaxed mb-8">
                Submit cyber incident reports, monitor live CCTV feeds, and coordinate national threat responses across Malawi's telecoms, banking, and government nodes.
              </p>

              {/* Stats — from live hook */}
              <div className="flex flex-wrap gap-10">
                {[
                  { val: liveStats.totalIncidents,    label: "Total Incidents" },
                  { val: liveStats.investigatingCount, label: "Investigating" },
                  { val: liveStats.containedCount + liveStats.resolvedCount, label: "Resolved / Contained" },
                  { val: liveStats.criticalCount,      label: "Critical" },
                ].map(s => (
                  <div key={s.label}>
                    <div className="font-bebas text-4xl text-[#FFD600]">{s.val}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SEARCH BAR (command + intel tabs) ────────────────────────────── */}
        {(activeTab === "command" || activeTab === "intel") && (
          <div className="border-b border-white/5 bg-[#05080F] px-6 py-3">
            <div className="max-w-[1600px] mx-auto">
              <div className="relative max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  placeholder="Search incidents by title, ID, organization, category..."
                  className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/50 rounded-lg pl-10 pr-9 py-2.5 text-xs text-slate-200 placeholder-slate-600 outline-none transition font-mono"
                  id="global-search-input"
                />
                {globalSearch && (
                  <button onClick={() => setGlobalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="max-w-[1600px] mx-auto">

            {activeTab === "portal" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-8 space-y-6">
                  <ReportForm onIncidentAdded={handleIncidentAdded} />
                  <PortalDashboard incidents={incidents} stats={stats || liveStats} />
                </div>
                <div className="lg:col-span-4 space-y-4">

                  {/* ── MISSION STATEMENT ─────────────────────────────── */}
                  <div className="card p-5 space-y-3 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FFD600]/4 rounded-full blur-2xl pointer-events-none" />
                    <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                      <div className="w-1 h-4 bg-[#FFD600] rounded" />
                      Our Mission
                    </h4>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      LitSecure Sentinel is Malawi's national cyber-defense platform — a unified intelligence node connecting <span className="text-slate-200 font-semibold">MACRA</span>, <span className="text-slate-200 font-semibold">MACERT</span>, the <span className="text-slate-200 font-semibold">Malawi Police Cybercrime Unit</span>, and Malawi Defense Cyber-Cell to protect citizens, telecoms, and government institutions from digital threats in real time.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {["24/7 Monitoring", "AI-Powered", "Encrypted Pipeline", "National Reach"].map(tag => (
                        <span key={tag} className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border border-[#FFD600]/20 text-[#FFD600]/70 bg-[#FFD600]/5">{tag}</span>
                      ))}
                    </div>
                  </div>

                  {/* ── CLASSIFICATION ENGINE ─────────────────────────── */}
                  <div className="card p-5 space-y-3">
                    <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                      <div className="w-1 h-4 bg-[#FFD600] rounded" />
                      Classification Engine
                    </h4>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Every report is automatically processed — extracting IOCs (phone numbers, IPs, domains) and generating AI-powered containment guidance via Gemini.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {[["Fraud Detection", true], ["Phishing Analysis", true], ["Threat Scoring", true], ["IOC Extraction", true], ["Gemini AI Triage", true], ["MITRE ATT&CK Map", true]].map(([k, active]) => (
                        <div key={String(k)} className="flex items-center gap-1.5 text-[10px] font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-slate-400">{String(k)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── LIVE SECTOR NODES ────────────────────────────────── */}
                  <LiveSectorNodes />

                  {/* ── NATIONAL COVERAGE ─────────────────────────────── */}
                  <div className="card p-5 space-y-3">
                    <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                      <div className="w-1 h-4 bg-blue-400 rounded" />
                      National Coverage
                    </h4>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {[
                        "Lilongwe", "Blantyre", "Mzuzu", "Zomba",
                        "Kasungu", "Mangochi", "Salima", "Dedza",
                        "Thyolo", "Mulanje", "Nkhata Bay", "Karonga"
                      ].map(district => (
                        <div key={district} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                          <span className="w-1 h-1 rounded-full bg-blue-400/60 shrink-0" />
                          {district}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-600 font-mono border-t border-white/5 pt-2">28 Districts · All 3 Regions Active</p>
                  </div>

                  {/* ── CONTACT HOTLINES ─────────────────────────────── */}
                  <div className="card p-5 space-y-3">
                    <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                      <div className="w-1 h-4 bg-rose-400 rounded" />
                      Emergency Contacts
                    </h4>
                    <div className="space-y-2.5">
                      {[
                        { org: "MACERT Hotline", num: "+265 (0) 111 789 101", badge: "24/7", color: "text-[#FFD600]" },
                        { org: "Police Cybercrime", num: "+265 (0) 111 789 222", badge: "CID", color: "text-blue-400" },
                        { org: "MACRA Consumer", num: "+265 (0) 177", badge: "FREE", color: "text-emerald-400" },
                        { org: "Defense Cyber-Cell", num: "+265 (0) 111 789 300", badge: "SEC", color: "text-rose-400" },
                      ].map(c => (
                        <div key={c.org} className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-bold text-slate-300 font-mono">{c.org}</p>
                            <p className={`text-[11px] font-mono font-bold ${c.color}`}>{c.num}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${c.color} border-current/30 bg-current/5 shrink-0`}>{c.badge}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-600 font-mono border-t border-white/5 pt-2">
                      All calls are encrypted and logged. Do not share classified details over unverified channels.
                    </p>
                  </div>

                </div>

              </div>
            )}

            {activeTab === "command"  && (
              <RoleConsole
                incidents={filteredIncidents}
                onIncidentUpdated={() => fetchAppData(true)}
                readOnly={isAuditor}
                onAiAnalyze={(incidentId) => {
                  setAiChatIncidentId(incidentId);
                  setActiveTab("patterns");
                }}
              />
            )}

            {activeTab === "cyberterm" && <CyberTerminal />}

            {activeTab === "situation" && <SituationRoom incidents={incidents} stats={stats || liveStats} />}
            {activeTab === "riskmap"   && <MalawiRiskMap incidents={incidents} />}
            {activeTab === "campaigns" && <CampaignCorrelation />}
            {activeTab === "scoring"   && <SectorRiskScoring />}
            {activeTab === "edr"       && <EdrEndpointProtection />}
            {activeTab === "rules"     && <SecurityRulesOrchestrator />}
            {activeTab === "cctv"      && <CctvSurveillance />}
            {activeTab === "logs"      && <LiveFeed />}
            {activeTab === "intel"     && <ThreatIntelDatabase />}
            {activeTab === "analytics" && stats && <AnalyticsDashboard stats={stats} />}
            {activeTab === "patterns"  && <AiThreatAnalysis />}
            {activeTab === "reports"   && <ReportsRecommendations />}
            {activeTab === "evidence"  && <EvidenceVault />}
            {activeTab === "settings"  && <IntegrationsSettings />}
            {activeTab === "awareness" && <CyberAwarenessHub />}
            {activeTab === "database"  && <DatabaseConsole />}
            {activeTab === "users"     && auth.user?.role === "admin" && <UserManagement token={auth.token!} />}
            {activeTab === "users"     && auth.user?.role !== "admin" && (
              <div className="flex flex-col items-center justify-center py-24 text-slate-600">
                <Users className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm font-mono">User Management is restricted to administrators.</p>
              </div>
            )}
            {activeTab === "social"    && <SocialMediaMonitor />}
            {activeTab === "cyberintel" && <CyberIntelligence token={auth.token!} />}
            {activeTab === "netintel"   && <NetworkIntelligence />}
            {activeTab === "globalmap"   && <GlobalCyberMap />}
            {activeTab === "policies"    && <PolicyManagement />}
            {activeTab === "takedown"    && <TakedownTracker />}
            {activeTab === "reputation"  && <ReputationChecker />}
            {activeTab === "training"    && <CyberAwarenessTraining />}
            {activeTab === "stix"        && <StixExportPanel />}
            {activeTab === "incidentmgr" && <IncidentReportManager token={auth.token!} role={role} />}
            {activeTab === "ailearn"    && <AiLearningPanel token={auth.token!} role={role} />}

          </div>
        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/5 bg-[#05080F] px-6 py-4 text-[10px] text-slate-600 font-mono">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LitSecureIcon size={18} />
              <span>LitSecure Sentinel v1.4 • Malawi Defense Coordinated Node</span>
            </div>
            <div className="flex items-center gap-5">
              <span>MACRA SEC-80B</span>
              <span>MACERT: 112</span>
              <span>Police Forensics: +265 (0)1 789 222</span>
              <div className="flex items-center gap-1.5 text-[#FFD600]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-pulse" />
                SYSTEM OPERATIONAL
              </div>
            </div>
          </div>
        </footer>

        {/* ── GLOBAL AI CHAT — visible on every page ─────────────────────── */}
        <GlobalAiChat token={auth.token} />

      </div>
    </ErrorBoundary>
  );
}
