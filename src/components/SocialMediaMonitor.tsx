import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Twitter, Facebook, Youtube, Instagram, Globe,
  AlertTriangle, Shield, Search, RefreshCw, Plus, Trash2,
  ChevronRight, MessageSquare, UserX, Phone, ExternalLink,
  CheckCircle, XCircle, Eye, Zap, Filter, Clock,
  Bot, Sparkles, Loader2, Radio, Copy, Bell,
  TrendingUp, Activity, Users, Hash, Send,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "twitter" | "facebook" | "tiktok" | "instagram" | "youtube" | "simulated" | "all";
type SignalType = "account_theft" | "cyberbullying" | "impersonation" | "harassment" | "hate_speech" | "scam" | "all";
type Severity  = "Critical" | "High" | "Medium" | "Low";
type SignalStatus = "New" | "Reviewing" | "Escalated" | "Resolved" | "FalsePositive";

interface Signal {
  id:             string;
  platform:       Platform;
  signal_type:    SignalType;
  post_id:        string;
  post_url:       string;
  author_handle:  string;
  author_url:     string;
  content_preview:string;
  victim_handle:  string;
  keywords_hit:   string[];
  ai_severity:    Severity;
  ai_summary:     string;
  ai_action:      string;
  status:         SignalStatus;
  incident_id:    string | null;
  reviewed_by:    string;
  notes:          string;
  detected_at:    string;
}

interface Keyword {
  id:        string;
  keyword:   string;
  category:  string;
  severity:  string;
  is_active: number;
}

interface PlatformConfig {
  id:           string;
  platform:     string;
  display_name: string;
  is_enabled:   number;
  api_key_set:  number;
  last_scan_at: string;
  total_signals:number;
}

interface Stats {
  total:          number;
  todayCount:     number;
  newCount:       number;
  criticalCount:  number;
  highCount:      number;
  escalatedCount: number;
  resolvedCount:  number;
  twitter:        number;
  facebook:       number;
  tiktok:         number;
  instagram:      number;
  youtube:        number;
  simulated:      number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: any }> = {
  twitter:   { label: "Twitter/X",  color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30",   Icon: Twitter },
  facebook:  { label: "Facebook",   color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30",  Icon: Facebook },
  tiktok:    { label: "TikTok",     color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/30",  Icon: Music2 },
  instagram: { label: "Instagram",  color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30",Icon: Instagram },
  youtube:   { label: "YouTube",    color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",   Icon: Youtube },
  simulated: { label: "Simulated",  color: "text-[#FFD600]",  bg: "bg-[#FFD600]/10",  border: "border-[#FFD600]/30", Icon: Bot },
};

const TYPE_META: Record<string, { label: string; color: string }> = {
  account_theft: { label: "Account Theft",  color: "text-red-400"    },
  cyberbullying: { label: "Cyberbullying",  color: "text-orange-400" },
  impersonation: { label: "Impersonation",  color: "text-yellow-400" },
  harassment:    { label: "Harassment",     color: "text-pink-400"   },
  hate_speech:   { label: "Hate Speech",    color: "text-purple-400" },
  scam:          { label: "Scam / Fraud",   color: "text-blue-400"   },
};

const SEV_COLOR: Record<Severity, { text: string; bg: string; border: string; dot: string }> = {
  Critical: { text: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/30",    dot: "bg-red-500"    },
  High:     { text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30", dot: "bg-orange-500" },
  Medium:   { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30", dot: "bg-yellow-500" },
  Low:      { text: "text-slate-400",  bg: "bg-slate-500/15",  border: "border-slate-500/30",  dot: "bg-slate-500"  },
};

const STATUS_META: Record<SignalStatus, { label: string; color: string; bg: string }> = {
  New:          { label: "New",          color: "text-blue-400",   bg: "bg-blue-500/15"   },
  Reviewing:    { label: "Reviewing",    color: "text-yellow-400", bg: "bg-yellow-500/15" },
  Escalated:    { label: "Escalated",    color: "text-red-400",    bg: "bg-red-500/15"    },
  Resolved:     { label: "Resolved",     color: "text-green-400",  bg: "bg-green-500/15"  },
  FalsePositive:{ label: "False Pos",   color: "text-slate-400",  bg: "bg-slate-500/15"  },
};

// Placeholder Music2 icon for TikTok
function Music2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SocialMediaMonitor() {
  const [signals,   setSignals]   = useState<Signal[]>([]);
  const [keywords,  setKeywords]  = useState<Keyword[]>([]);
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [selected,  setSelected]  = useState<Signal | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [scanning,  setScanning]  = useState(false);
  const [escalating,setEscalating]= useState(false);
  const [smsPhone,  setSmsPhone]  = useState("");
  const [smsMsg,    setSmsMsg]    = useState("");
  const [smsSending,setSmsSending]= useState(false);
  const [smsSuccess,setSmsSuccess]= useState("");
  const [notes,     setNotes]     = useState("");
  const [tab,       setTab]       = useState<"feed" | "keywords" | "platforms">("feed");
  const [newKeyword,setNewKeyword]= useState({ keyword: "", category: "account_theft", severity: "High" });
  const [addingKw,  setAddingKw]  = useState(false);

  // Filters
  const [filterPlatform, setFilterPlatform] = useState<Platform>("all");
  const [filterType,     setFilterType]     = useState<SignalType>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus,   setFilterStatus]   = useState<string>("all");
  const [search,         setSearch]         = useState("");

  const token = () => sessionStorage.getItem("sentinel_token") || "";

  const fetchAll = useCallback(async () => {
    try {
      const [sigRes, kwRes, platRes, statRes] = await Promise.all([
        fetch(`/api/social/signals?platform=${filterPlatform}&type=${filterType}&severity=${filterSeverity}&status=${filterStatus}&limit=100`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch("/api/social/keywords",  { headers: { Authorization: `Bearer ${token()}` } }),
        fetch("/api/social/platforms", { headers: { Authorization: `Bearer ${token()}` } }),
        fetch("/api/social/stats",     { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      if (sigRes.ok)  { const d = await sigRes.json();  setSignals(d.signals || []); }
      if (kwRes.ok)   { const d = await kwRes.json();   setKeywords(d); }
      if (platRes.ok) { const d = await platRes.json(); setPlatforms(d); }
      if (statRes.ok) { const d = await statRes.json(); setStats(d); }
    } catch {}
    setLoading(false);
  }, [filterPlatform, filterType, filterSeverity, filterStatus]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/social/scan", { method: "POST", headers: { Authorization: `Bearer ${token()}` } });
      const d   = await res.json();
      await fetchAll();
    } catch {}
    setScanning(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/social/signals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ status, notes }),
    });
    await fetchAll();
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: status as SignalStatus, notes } : prev);
  };

  const escalateToIncident = async () => {
    if (!selected) return;
    setEscalating(true);
    try {
      const res = await fetch(`/api/social/signals/${selected.id}/escalate`, { method: "POST", headers: { Authorization: `Bearer ${token()}` } });
      const d   = await res.json();
      if (res.ok) {
        await fetchAll();
        setSelected(prev => prev ? { ...prev, status: "Escalated", incident_id: d.incident_id } : prev);
      }
    } catch {}
    setEscalating(false);
  };

  const sendVictimSms = async () => {
    if (!selected || !smsPhone) return;
    setSmsSending(true);
    try {
      const res = await fetch(`/api/social/signals/${selected.id}/sms-victim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ phone: smsPhone, customMessage: smsMsg || undefined }),
      });
      const d = await res.json();
      setSmsSuccess(d.mode === "sms" ? "✅ SMS sent via Africa's Talking" : "✅ SMS logged (add AT_API_KEY for live sending)");
      setTimeout(() => setSmsSuccess(""), 5000);
    } catch {}
    setSmsSending(false);
  };

  const addKeyword = async () => {
    if (!newKeyword.keyword) return;
    setAddingKw(true);
    try {
      await fetch("/api/social/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(newKeyword),
      });
      setNewKeyword({ keyword: "", category: "account_theft", severity: "High" });
      await fetchAll();
    } catch {}
    setAddingKw(false);
  };

  const deleteKeyword = async (id: string) => {
    await fetch(`/api/social/keywords/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    await fetchAll();
  };

  const filteredSignals = signals.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.content_preview.toLowerCase().includes(q) || s.author_handle.toLowerCase().includes(q) || s.victim_handle?.toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-[#FFD600] animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5" id="social-media-monitor">

      {/* ─── Page Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-[#FFD600]/20 p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center">
              <Globe className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bebas text-2xl text-white tracking-widest">SOCIAL MEDIA MONITOR</h2>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">MACERT — Account Theft · Cyberbullying · Impersonation · Scams</p>
            </div>
          </div>
          <div className="md:ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              MONITORING ACTIVE
            </div>
            <button
              onClick={runScan}
              disabled={scanning}
              id="social-scan-btn"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD600] text-[#05080F] text-xs font-bold hover:bg-[#FFD600]/90 transition disabled:opacity-50"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {scanning ? "Scanning..." : "Scan Now"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI Row ─── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Total Signals", value: stats.total,          icon: Activity,      color: "text-slate-400" },
            { label: "Today",          value: stats.todayCount,     icon: Clock,         color: "text-blue-400"  },
            { label: "New",            value: stats.newCount,       icon: Bell,          color: "text-sky-400"   },
            { label: "Critical",       value: stats.criticalCount,  icon: AlertTriangle, color: "text-red-400"   },
            { label: "High",           value: stats.highCount,      icon: Zap,           color: "text-orange-400"},
            { label: "Escalated",      value: stats.escalatedCount, icon: Shield,        color: "text-purple-400"},
            { label: "Resolved",       value: stats.resolvedCount,  icon: CheckCircle,   color: "text-green-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-3 text-center">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Platform Status Bar ─── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Platform Status</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {platforms.map(p => {
            const meta = PLATFORM_META[p.platform] || PLATFORM_META.simulated;
            const PIcon = meta.Icon;
            return (
              <div key={p.platform} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.border} ${meta.bg}`}>
                <PIcon className={`w-3.5 h-3.5 ${meta.color}`} />
                <span className={`text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
                <span className="text-[9px] font-mono text-slate-500">{p.total_signals} signals</span>
                <span className={`w-1.5 h-1.5 rounded-full ${p.api_key_set ? "bg-green-400" : "bg-[#FFD600]"} animate-pulse`} />
                <span className="text-[8px] font-mono text-slate-600">{p.api_key_set ? "LIVE" : "SIM"}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[9px] font-mono text-slate-600">
          🟡 SIM = simulation mode (realistic data) · 🟢 LIVE = real API connected · Add API keys to .env.local to activate live feeds
        </p>
      </div>

      {/* ─── Sub-tabs ─── */}
      <div className="flex gap-1 bg-white/3 rounded-xl p-1 w-fit">
        {(["feed", "keywords", "platforms"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            {t === "feed" ? "Signal Feed" : t === "keywords" ? "Keywords" : "Platform Config"}
          </button>
        ))}
      </div>

      {/* ═══ SIGNAL FEED TAB ════════════════════════════════════════════════════ */}
      {tab === "feed" && (
        <div className="flex gap-4 h-[680px]">

          {/* Signal List */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">

            {/* Filters */}
            <div className="card p-3 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  className="glass-form w-full pl-8 pr-3 py-1.5 text-xs rounded-lg"
                  placeholder="Search signals..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {[
                { label: "Platform", value: filterPlatform, set: setFilterPlatform, options: [["all","All Platforms"],["twitter","Twitter/X"],["facebook","Facebook"],["tiktok","TikTok"],["instagram","Instagram"],["youtube","YouTube"],["simulated","Simulated"]] },
                { label: "Type",     value: filterType,     set: setFilterType,     options: [["all","All Types"],["account_theft","Account Theft"],["cyberbullying","Cyberbullying"],["impersonation","Impersonation"],["harassment","Harassment"],["scam","Scam"]] },
                { label: "Severity", value: filterSeverity, set: setFilterSeverity, options: [["all","All Severity"],["Critical","Critical"],["High","High"],["Medium","Medium"],["Low","Low"]] },
                { label: "Status",   value: filterStatus,   set: setFilterStatus,   options: [["all","All Status"],["New","New"],["Reviewing","Reviewing"],["Escalated","Escalated"],["Resolved","Resolved"],["FalsePositive","False Positive"]] },
              ].map(({ label, value, set, options }) => (
                <select
                  key={label}
                  value={value}
                  onChange={e => (set as any)(e.target.value)}
                  className="glass-form px-2 py-1.5 text-xs rounded-lg"
                >
                  {options.map(([v, l]) => <option key={v} value={v} className="bg-[#0A0E1A]">{l}</option>)}
                </select>
              ))}
            </div>

            {/* Signal Cards */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredSignals.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                  <Globe className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-mono">No signals yet — click Scan Now to fetch the latest</p>
                </div>
              )}
              {filteredSignals.map(signal => {
                const pMeta  = PLATFORM_META[signal.platform] || PLATFORM_META.simulated;
                const PIcon  = pMeta.Icon;
                const tMeta  = TYPE_META[signal.signal_type] || { label: signal.signal_type, color: "text-slate-400" };
                const sev    = SEV_COLOR[signal.ai_severity] || SEV_COLOR.Low;
                const sMeta  = STATUS_META[signal.status as SignalStatus] || STATUS_META.New;
                const active = selected?.id === signal.id;

                return (
                  <button
                    key={signal.id}
                    onClick={() => { setSelected(signal); setNotes(signal.notes || ""); setSmsPhone(""); setSmsMsg(""); setSmsSuccess(""); }}
                    className={`w-full text-left card p-3 hover:border-white/15 transition cursor-pointer ${active ? "border-[#FFD600]/40 bg-[#FFD600]/5" : ""}`}
                    id={`signal-${signal.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`shrink-0 w-8 h-8 rounded-lg ${pMeta.bg} border ${pMeta.border} flex items-center justify-center`}>
                        <PIcon className={`w-4 h-4 ${pMeta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sev.bg} ${sev.text} border ${sev.border}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${sev.dot} mr-1`} />
                            {signal.ai_severity}
                          </span>
                          <span className={`text-[9px] font-semibold ${tMeta.color}`}>{tMeta.label}</span>
                          <span className={`text-[9px] font-semibold ml-auto px-1.5 py-0.5 rounded ${sMeta.bg} ${sMeta.color}`}>{sMeta.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-relaxed line-clamp-2">{signal.content_preview}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-slate-600">
                          <span className={pMeta.color}>{signal.author_handle}</span>
                          {signal.victim_handle && <span>→ {signal.victim_handle}</span>}
                          <span className="ml-auto">{new Date(signal.detected_at).toLocaleTimeString("en-MW", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Detail Panel ─── */}
          <div className="w-[380px] shrink-0">
            {!selected ? (
              <div className="card h-full flex flex-col items-center justify-center text-slate-600">
                <Eye className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-xs font-mono text-center">Select a signal<br/>to review and take action</p>
              </div>
            ) : (() => {
              const pMeta = PLATFORM_META[selected.platform] || PLATFORM_META.simulated;
              const PIcon = pMeta.Icon;
              const sev   = SEV_COLOR[selected.ai_severity] || SEV_COLOR.Low;
              const sMeta = STATUS_META[selected.status as SignalStatus] || STATUS_META.New;
              return (
                <div className="card h-full flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className={`p-4 border-b border-white/5 ${sev.bg}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-lg ${pMeta.bg} border ${pMeta.border} flex items-center justify-center`}>
                        <PIcon className={`w-3.5 h-3.5 ${pMeta.color}`} />
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${pMeta.color}`}>{pMeta.label}</span>
                      <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border ${sev.bg} ${sev.text} ${sev.border}`}>
                        {selected.ai_severity}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300 leading-relaxed">{selected.content_preview}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selected.keywords_hit.map(k => (
                        <span key={k} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">#{k}</span>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable body */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* Author / Victim */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-white/3 rounded-lg p-2">
                        <div className="text-slate-600 text-[8px] uppercase mb-1">Offender</div>
                        <div className={`font-bold ${pMeta.color}`}>{selected.author_handle || "Unknown"}</div>
                        {selected.post_url && (
                          <a href={selected.post_url} target="_blank" rel="noopener noreferrer" className="text-[8px] text-slate-500 hover:text-slate-300 flex items-center gap-1 mt-0.5">
                            <ExternalLink className="w-2.5 h-2.5" /> Open post
                          </a>
                        )}
                      </div>
                      <div className="bg-white/3 rounded-lg p-2">
                        <div className="text-slate-600 text-[8px] uppercase mb-1">Victim Mentions</div>
                        <div className="font-bold text-slate-300">{selected.victim_handle || "Not identified"}</div>
                      </div>
                    </div>

                    {/* AI Summary */}
                    {selected.ai_summary && (
                      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-purple-400 uppercase">
                          <Bot className="w-3 h-3" /> Gemini AI Analysis
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{selected.ai_summary}</p>
                        {selected.ai_action && (
                          <div className="mt-2 pt-2 border-t border-purple-500/10">
                            <div className="text-[8px] text-purple-500 uppercase mb-1">Recommended Action</div>
                            <p className="text-[10px] text-slate-300">{selected.ai_action}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status changer */}
                    <div>
                      <div className="text-[8px] text-slate-600 uppercase mb-1.5">Update Status</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(["Reviewing", "Resolved", "FalsePositive"] as SignalStatus[]).map(s => (
                          <button
                            key={s}
                            onClick={() => updateStatus(selected.id, s)}
                            className={`text-[9px] font-semibold px-2 py-1 rounded-lg border transition ${
                              selected.status === s ? `${STATUS_META[s].bg} ${STATUS_META[s].color} border-transparent` : "border-white/10 text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {STATUS_META[s].label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <div className="text-[8px] text-slate-600 uppercase mb-1.5">Analyst Notes</div>
                      <textarea
                        className="glass-form w-full rounded-lg px-2.5 py-2 text-[10px] resize-none"
                        rows={2}
                        placeholder="Add notes..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                      />
                      <button
                        onClick={() => updateStatus(selected.id, selected.status)}
                        className="mt-1 text-[9px] text-[#FFD600] hover:underline"
                      >Save notes</button>
                    </div>

                    {/* ─── Action Buttons ─── */}
                    <div className="space-y-2">
                      <div className="text-[8px] text-slate-600 uppercase mb-1.5">Response Actions</div>

                      {/* Escalate */}
                      {selected.status !== "Escalated" ? (
                        <button
                          onClick={escalateToIncident}
                          disabled={escalating}
                          id="escalate-btn"
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/25 transition disabled:opacity-50"
                        >
                          {escalating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          Escalate → Create Incident
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Escalated to Incident {selected.incident_id?.slice(-8).toUpperCase()}
                        </div>
                      )}

                      {/* SMS Victim */}
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-blue-400 uppercase">
                          <Phone className="w-3 h-3" /> Send Victim Support SMS
                        </div>
                        <input
                          className="glass-form w-full rounded-lg px-2.5 py-1.5 text-[10px]"
                          placeholder="+265 8X XXX XXXX (victim's number)"
                          value={smsPhone}
                          onChange={e => setSmsPhone(e.target.value)}
                        />
                        <textarea
                          className="glass-form w-full rounded-lg px-2.5 py-1.5 text-[10px] resize-none"
                          rows={2}
                          placeholder="Custom message (optional — default is auto-generated)"
                          value={smsMsg}
                          onChange={e => setSmsMsg(e.target.value)}
                        />
                        {smsSuccess && <p className="text-[9px] text-green-400 font-mono">{smsSuccess}</p>}
                        <button
                          onClick={sendVictimSms}
                          disabled={!smsPhone || smsSending}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-bold hover:bg-blue-500/30 transition disabled:opacity-40"
                        >
                          {smsSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Send Support SMS
                        </button>
                      </div>

                      {/* Open post */}
                      {selected.post_url && (
                        <a
                          href={selected.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 text-slate-400 text-[10px] font-semibold hover:text-white hover:border-white/20 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Original Post on {PLATFORM_META[selected.platform]?.label || selected.platform}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══ KEYWORDS TAB ════════════════════════════════════════════════════════ */}
      {tab === "keywords" && (
        <div className="card p-5 space-y-4">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
            <Hash className="w-4 h-4 text-[#FFD600]" />
            Monitoring Keywords ({keywords.length})
            <span className="text-[9px] font-mono text-slate-600 font-normal ml-2">
              Content matching these keywords is automatically ingested as a signal
            </span>
          </h3>

          {/* Add Keyword Form */}
          <div className="flex flex-wrap gap-2 items-end p-4 rounded-xl bg-white/3 border border-white/5">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[9px] text-slate-600 uppercase mb-1 block">New Keyword</label>
              <input
                className="glass-form w-full rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. account hacked malawi"
                value={newKeyword.keyword}
                onChange={e => setNewKeyword(p => ({ ...p, keyword: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addKeyword()}
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-600 uppercase mb-1 block">Category</label>
              <select
                className="glass-form rounded-lg px-3 py-2 text-sm"
                value={newKeyword.category}
                onChange={e => setNewKeyword(p => ({ ...p, category: e.target.value }))}
              >
                {["account_theft","cyberbullying","impersonation","harassment","hate_speech","scam","general"].map(c => (
                  <option key={c} value={c} className="bg-[#0A0E1A]">{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-600 uppercase mb-1 block">Severity</label>
              <select
                className="glass-form rounded-lg px-3 py-2 text-sm"
                value={newKeyword.severity}
                onChange={e => setNewKeyword(p => ({ ...p, severity: e.target.value }))}
              >
                {["Critical","High","Medium","Low"].map(s => <option key={s} value={s} className="bg-[#0A0E1A]">{s}</option>)}
              </select>
            </div>
            <button
              onClick={addKeyword}
              disabled={addingKw || !newKeyword.keyword}
              className="btn-accent px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {addingKw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>

          {/* Keyword List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {keywords.map(kw => {
              const sev = SEV_COLOR[kw.severity as Severity] || SEV_COLOR.Low;
              return (
                <div key={kw.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/3 border border-white/5 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${sev.bg} ${sev.text} border ${sev.border}`}>{kw.severity}</span>
                      <span className="text-[9px] text-slate-500">{kw.category.replace(/_/g," ")}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono mt-0.5 truncate">{kw.keyword}</p>
                  </div>
                  <button
                    onClick={() => deleteKeyword(kw.id)}
                    className="ml-2 p-1 text-slate-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ PLATFORMS TAB ═══════════════════════════════════════════════════════ */}
      {tab === "platforms" && (
        <div className="card p-5 space-y-4">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#FFD600]" /> Platform API Configuration
          </h3>
          <p className="text-xs text-slate-500">Add API keys to <code className="bg-white/5 px-1 rounded">.env.local</code> to enable live feeds. Simulation mode provides realistic signals without keys.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {([
              { key: "twitter",   label: "Twitter / X",  envVar: "TWITTER_BEARER_TOKEN",    doc: "developer.twitter.com",  cost: "$100/mo Basic API" },
              { key: "facebook",  label: "Facebook",      envVar: "FACEBOOK_ACCESS_TOKEN",   doc: "developers.facebook.com", cost: "Free (App Review needed)" },
              { key: "tiktok",    label: "TikTok",        envVar: "TIKTOK_CLIENT_KEY",       doc: "developers.tiktok.com",  cost: "Free Research API" },
              { key: "instagram", label: "Instagram",     envVar: "FACEBOOK_ACCESS_TOKEN",   doc: "developers.facebook.com", cost: "Same as Facebook" },
              { key: "youtube",   label: "YouTube",       envVar: "YOUTUBE_API_KEY",         doc: "console.cloud.google.com",cost: "Free (10k units/day)" },
            ]).map(p => {
              const config = platforms.find(pc => pc.platform === p.key);
              const live   = config?.api_key_set;
              const meta   = PLATFORM_META[p.key] || PLATFORM_META.simulated;
              const PIcon  = meta.Icon;
              return (
                <div key={p.key} className={`p-4 rounded-xl border ${live ? "border-green-500/20 bg-green-500/5" : "border-white/8 bg-white/2"} space-y-3`}>
                  <div className="flex items-center gap-2">
                    <PIcon className={`w-5 h-5 ${meta.color}`} />
                    <span className="font-bold text-sm text-white">{p.label}</span>
                    <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full ${live ? "bg-green-500/20 text-green-400" : "bg-[#FFD600]/15 text-[#FFD600]"}`}>
                      {live ? "LIVE" : "SIMULATED"}
                    </span>
                  </div>
                  <div className="text-[9px] font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Env Variable</span>
                      <code className="text-[#FFD600] bg-[#FFD600]/5 px-1.5 py-0.5 rounded">{p.envVar}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Pricing</span>
                      <span className="text-slate-400">{p.cost}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Total Signals</span>
                      <span className="text-white font-bold">{config?.total_signals || 0}</span>
                    </div>
                    {config?.last_scan_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Last Scan</span>
                        <span className="text-slate-400">{new Date(config.last_scan_at).toLocaleTimeString("en-MW")}</span>
                      </div>
                    )}
                  </div>
                  <div className={`text-[9px] p-2 rounded-lg ${live ? "bg-green-500/10 text-green-400" : "bg-white/3 text-slate-500"}`}>
                    {live
                      ? `✅ API key detected — live scanning enabled`
                      : `Add ${p.envVar}=your_key to .env.local`
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
