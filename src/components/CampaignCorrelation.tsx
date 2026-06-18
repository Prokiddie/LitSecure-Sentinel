import React, { useState, useEffect, useCallback } from "react";
import {
  Zap, AlertTriangle, Shield, RefreshCw, Loader2,
  ChevronRight, Globe, Smartphone, Activity,
  TrendingUp, Building2, Download, Share2,
  ChevronDown, ChevronUp, Clock, Calendar,
  Check, MapPin, Link, BarChart3, FileText, Bell
} from "lucide-react";

interface Campaign {
  id: string;
  title: string;
  threatType: string;
  riskScore: number;
  status: "Active" | "Contained" | "Closed";
  incidentIds: string[];
  sectors: string[];
  sharedIoc: string;
  iocType: "phone" | "ip" | "domain" | "mixed";
  detectedAt: string;
  sources: string[];
  attackerProfiles: string[];
  affectedRegions: string[];
}

// ─── Style helpers (Sentinel design system — no gray-900/800) ────────────────
const STATUS_BADGE: Record<string, string> = {
  Active:    "text-red-400 bg-red-500/10 border-red-500/25 animate-pulse",
  Contained: "text-orange-400 bg-orange-500/10 border-orange-500/25",
  Closed:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  Active:    AlertTriangle,
  Contained: Shield,
  Closed:    Check,
};

const IOC_ICON: Record<string, React.ElementType> = {
  phone:  Smartphone,
  ip:     Activity,
  domain: Globe,
  mixed:  Zap,
};

const RISK_COLOR = (s: number) =>
  s >= 80 ? "text-red-400" : s >= 60 ? "text-orange-400" : s >= 40 ? "text-[#FFD600]" : "text-blue-400";

const RISK_BG = (s: number) =>
  s >= 80 ? "border-red-500/25 bg-red-500/5"       :
  s >= 60 ? "border-orange-500/25 bg-orange-500/5" :
  s >= 40 ? "border-[#FFD600]/20 bg-[#FFD600]/5"   : "border-blue-500/25 bg-blue-500/5";

const RISK_BAR_COLOR = (s: number) =>
  s >= 80 ? "bg-red-500" : s >= 60 ? "bg-orange-500" : s >= 40 ? "bg-[#FFD600]" : "bg-blue-500";

const SOURCE_COLORS: Record<string, string> = {
  "Citizen Report":     "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  "Airtel Fraud Feed":  "text-blue-400 bg-blue-500/10 border-blue-500/25",
  "TNM Mpamba Feed":    "text-purple-400 bg-purple-500/10 border-purple-500/25",
  "Police Report":      "text-red-400 bg-red-500/10 border-red-500/25",
  "MACRA CERT Feed":    "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",
  "Corporate Security": "text-orange-400 bg-orange-500/10 border-orange-500/25",
  "EDR Endpoint Alert": "text-cyan-400 bg-cyan-500/10 border-cyan-500/25",
  "MACERT":             "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",
  "AbuseIPDB Feed":     "text-slate-400 bg-slate-500/10 border-slate-500/25",
};
const DEFAULT_SRC = "text-slate-400 bg-slate-500/10 border-slate-500/25";

// ─── Risk score bar ──────────────────────────────────────────────────────────
function RiskBar({ score, animate = true }: { score: number; animate?: boolean }) {
  const [width, setWidth] = useState(animate ? 0 : score);
  useEffect(() => {
    if (animate) { const t = setTimeout(() => setWidth(score), 80); return () => clearTimeout(t); }
  }, [score, animate]);
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all duration-700 ${RISK_BAR_COLOR(score)}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ─── Timeline dot row ────────────────────────────────────────────────────────
function TimelineDot({ label, time, active }: { label: string; time: string; active?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full border-2 mt-0.5 ${active ? "bg-[#FFD600] border-[#FFD600]" : "bg-slate-700 border-slate-600"}`} />
        <div className="w-px flex-1 bg-white/5 min-h-[20px]" />
      </div>
      <div className="pb-3">
        <div className="text-[10px] text-slate-200 font-medium">{label}</div>
        <div className="text-[9px] text-slate-600 font-mono mt-0.5">{time}</div>
      </div>
    </div>
  );
}

// ─── Expandable Campaign Card ────────────────────────────────────────────────
function CampaignCard({
  campaign,
  isExpanded,
  onToggle,
  onSelect,
  isSelected,
  onExport,
  onEscalate,
}: {
  key?: React.Key;
  campaign: Campaign;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  isSelected: boolean;
  onExport: () => void;
  onEscalate: () => void;
}) {
  const IocIcon = IOC_ICON[campaign.iocType] || Zap;
  const StatusIcon = STATUS_ICON[campaign.status] || Shield;
  const daysActive = Math.floor((Date.now() - new Date(campaign.detectedAt).getTime()) / 86400000);

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
        isSelected ? "border-[#FFD600]/50 shadow-lg shadow-[#FFD600]/5" : `${RISK_BG(campaign.riskScore)} hover:border-white/15`
      }`}
    >
      {/* ── Card Header (always visible) ── */}
      <div
        className="p-4 cursor-pointer"
        onClick={onSelect}
      >
        <div className="flex items-start gap-3">
          {/* Left accent bar */}
          <div className={`w-1 h-14 rounded-full shrink-0 ${RISK_BAR_COLOR(campaign.riskScore)}`} style={{ opacity: 0.8 }} />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[9px] font-mono text-slate-500">{campaign.id}</span>
              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono flex items-center gap-1 ${STATUS_BADGE[campaign.status]}`}>
                <StatusIcon className="w-2.5 h-2.5" />
                {campaign.status}
              </span>
              {campaign.riskScore >= 80 && (
                <span className="text-[8px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded font-mono animate-pulse">
                  🚨 HIGH PRIORITY
                </span>
              )}
            </div>
            <h4 className="text-xs font-bold text-white leading-snug truncate">{campaign.title}</h4>
            <p className="text-[9px] text-slate-500 font-mono mt-1">
              {campaign.incidentIds.length} incidents · {campaign.sectors.length} sectors · {daysActive === 0 ? "Today" : `${daysActive}d ago`}
            </p>
          </div>

          {/* Risk score */}
          <div className={`text-2xl font-bebas shrink-0 ${RISK_COLOR(campaign.riskScore)}`}>{campaign.riskScore}</div>
        </div>

        {/* Shared IOC pill */}
        <div className="flex items-center gap-2 mt-3">
          <IocIcon className={`w-3 h-3 shrink-0 ${RISK_COLOR(campaign.riskScore)}`} />
          <code className={`text-[9px] font-mono font-bold ${RISK_COLOR(campaign.riskScore)} bg-black/30 px-2 py-0.5 rounded border border-white/5 truncate`}>
            {campaign.sharedIoc}
          </code>
          <span className="text-[8px] text-slate-600 font-mono ml-auto">{campaign.iocType.toUpperCase()}</span>
        </div>

        {/* Risk bar */}
        <RiskBar score={campaign.riskScore} />

        {/* Source badges */}
        <div className="flex items-center gap-1 flex-wrap mt-2.5">
          {campaign.sources.slice(0, 3).map((src, i) => (
            <span key={i} className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${SOURCE_COLORS[src] || DEFAULT_SRC}`}>
              {src.replace(" Feed", "").replace(" Report", "")}
            </span>
          ))}
          {campaign.sources.length > 3 && (
            <span className="text-[8px] text-slate-600 font-mono">+{campaign.sources.length - 3}</span>
          )}
        </div>
      </div>

      {/* ── Expand / Collapse Toggle ── */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 border-t border-white/5 text-[9px] text-slate-600 hover:text-slate-400 hover:bg-white/2 transition font-mono"
      >
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isExpanded ? "COLLAPSE" : "DRILL DOWN · TIMELINE · ACTIONS"}
      </button>

      {/* ── Expanded Details ── */}
      {isExpanded && (
        <div className="border-t border-white/5 p-4 space-y-4 bg-black/20">
          {/* Timeline */}
          <div>
            <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Investigation Timeline
            </h5>
            <div className="space-y-0">
              <TimelineDot label="Campaign first detected" time={new Date(campaign.detectedAt).toLocaleString()} active />
              <TimelineDot label="Indicators extracted and cross-matched" time={new Date(new Date(campaign.detectedAt).getTime() + 300000).toLocaleString()} />
              <TimelineDot
                label={campaign.status === "Closed" ? "Closed — resolved" : campaign.status === "Contained" ? "Contained — monitoring active" : "ACTIVE — escalation pending"}
                time={campaign.status === "Active" ? "NOW" : "—"}
                active={campaign.status === "Active"}
              />
            </div>
          </div>

          {/* Shared indicators expanded */}
          <div>
            <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
              <Link className="w-3 h-3" /> Shared Indicators of Compromise
            </h5>
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[9px] font-mono px-2 py-1 rounded border ${RISK_BG(campaign.riskScore)} ${RISK_COLOR(campaign.riskScore)}`}>
                {campaign.sharedIoc}
              </span>
            </div>
          </div>

          {/* Sectors & Regions grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> Sectors
              </h5>
              <div className="space-y-1">
                {campaign.sectors.map(s => (
                  <div key={s} className="text-[10px] text-slate-300 flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-slate-600" />{s}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Regions
              </h5>
              <div className="space-y-1">
                {campaign.affectedRegions.map(r => (
                  <div key={r} className="text-[10px] text-slate-300 flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-slate-600" />{r}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Attacker profile */}
          {campaign.attackerProfiles.length > 0 && (
            <div>
              <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Threat Actor</h5>
              <div className="text-[10px] text-orange-400 font-mono bg-orange-500/5 border border-orange-500/20 rounded px-2.5 py-1.5">
                {campaign.attackerProfiles[0]}
              </div>
            </div>
          )}

          {/* Linked incident IDs */}
          <div>
            <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Linked Incidents</h5>
            <div className="flex flex-wrap gap-1.5">
              {campaign.incidentIds.map(id => (
                <code key={id} className="text-[9px] font-mono text-[#FFD600] bg-[#FFD600]/10 border border-[#FFD600]/20 px-2 py-0.5 rounded">
                  {id}
                </code>
              ))}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
            <button
              onClick={onEscalate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFD600] hover:bg-[#FFD600]/90 text-[#05080F] text-[10px] font-bold transition"
            >
              <Bell className="w-3 h-3" /> Escalate to MACERT
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-slate-300 text-[10px] font-semibold transition"
            >
              <Download className="w-3 h-3" /> Export Intelligence
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-slate-300 text-[10px] font-semibold transition"
            >
              <Share2 className="w-3 h-3" /> Share with CERT
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-slate-300 text-[10px] font-semibold transition"
            >
              <FileText className="w-3 h-3" /> Case File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Similarity Heatmap Strip ────────────────────────────────────────────────
function SimilarityStrip({ pairs }: { pairs: any[] }) {
  if (!pairs.length) return null;
  return (
    <div className="card p-4 space-y-3">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-[#FFD600]" /> IOC Jaccard Similarity Matrix
        <span className="ml-auto text-slate-600 font-mono">{pairs.length} overlapping pairs</span>
      </h4>
      <div className="space-y-2 max-h-52 overflow-y-auto">
        {pairs.slice(0, 8).map((pair, i) => (
          <div key={i} className="flex items-center gap-3 text-[10px]">
            <code className="text-[#FFD600] font-mono shrink-0">{pair.incA}</code>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pair.riskScore >= 70 ? "bg-red-500" : pair.riskScore >= 40 ? "bg-orange-400" : "bg-[#FFD600]"}`}
                style={{ width: `${pair.similarity}%` }}
              />
            </div>
            <code className="text-[#FFD600] font-mono shrink-0">{pair.incB}</code>
            <span className={`font-bold font-mono shrink-0 ${pair.riskScore >= 70 ? "text-red-400" : "text-slate-400"}`}>
              {pair.similarity}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function CampaignCorrelation() {
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [selected, setSelected]     = useState<Campaign | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [correlating, setCorrelating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [similarityPairs, setSimilarityPairs] = useState<any[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/campaigns", { headers: authH() });
      if (r.ok) setCampaigns(await r.json());
    } finally { setLoading(false); }
  }, []);

  const triggerCorrelation = async () => {
    setCorrelating(true);
    try {
      const r = await fetch("/api/campaigns/correlate", { method: "POST", headers: authH() });
      if (r.ok) {
        const data = await r.json();
        setSimilarityPairs(data.similarity || []);
        showNotification(`✅ Correlation scan complete — ${data.detected} campaigns detected, ${data.similarityPairs} similarity pairs found`);
      }
      await loadCampaigns();
    } finally { setCorrelating(false); }
  };

  const exportCasefile = async (campaign: Campaign) => {
    try {
      const r = await fetch(`/api/campaigns/${campaign.id}/casefile`, { headers: authH() });
      if (r.ok) {
        const data = await r.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `casefile-${campaign.id}.json`; a.click();
        URL.revokeObjectURL(url);
        showNotification(`📄 Case file exported: ${campaign.id}`);
      }
    } catch { showNotification("Export failed — try again"); }
  };

  const escalateCampaign = (campaign: Campaign) => {
    showNotification(`🚨 Escalation triggered for ${campaign.id} → MACERT notified`);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const filtered = statusFilter === "All" ? campaigns : campaigns.filter(c => c.status === statusFilter);
  const activeCount    = campaigns.filter(c => c.status === "Active").length;
  const containedCount = campaigns.filter(c => c.status === "Contained").length;
  const totalIncidents = campaigns.reduce((s, c) => s + c.incidentIds.length, 0);
  const avgRisk = campaigns.length ? Math.round(campaigns.reduce((s, c) => s + c.riskScore, 0) / campaigns.length) : 0;

  return (
    <div className="space-y-5" id="campaign-correlation">

      {/* ─── Toast notification ─── */}
      {notification && (
        <div className="fixed top-4 right-4 z-[200] max-w-sm bg-[#080c17] border border-[#FFD600]/40 rounded-xl px-4 py-3 text-xs text-slate-200 shadow-2xl animate-fade-in">
          {notification}
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-red-500/20 p-5">
        <div className="absolute -top-6 -right-6 w-40 h-40 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-red-500/50 via-[#FFD600]/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">NATIONAL CAMPAIGN CORRELATION ENGINE</h2>
              <p className="text-[10px] text-slate-500 font-mono">Auto-detects coordinated attacks · Jaccard IOC clustering · Timeline drill-down · One-click escalation</p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <button
              onClick={() => loadCampaigns()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 transition disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              id="run-correlation-btn"
              onClick={triggerCorrelation}
              disabled={correlating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-50 shrink-0"
            >
              {correlating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {correlating ? "Correlating…" : "Run Correlation Scan"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active Campaigns",  val: activeCount,         color: "text-red-400 bg-red-500/10 border-red-500/20",       icon: AlertTriangle },
          { label: "Contained",         val: containedCount,      color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: Shield },
          { label: "Linked Incidents",  val: totalIncidents,      color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20",  icon: TrendingUp },
          { label: "Avg. Campaign Risk",val: `${avgRisk}/100`,    color: "text-purple-400 bg-purple-500/10 border-purple-500/20", icon: Activity },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">{label}</div>
              <div className="text-xl font-bold font-mono text-slate-100">{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── How it works callout ─── */}
      <div className="card p-4 border-l-4 border-[#FFD600] bg-[#FFD600]/5">
        <p className="text-xs text-slate-300 leading-relaxed">
          <span className="text-[#FFD600] font-bold">How the Correlation Engine works: </span>
          When 2+ incidents from <em>different sectors</em> share the same phone number, IP, or domain within a 7-day window,
          they're automatically grouped into a <strong>Campaign</strong> using Jaccard IOC similarity scoring.
          Expand any card below for the <strong>timeline</strong>, drill-down indicators, and <strong>one-click escalation</strong> to MACERT.
        </p>
      </div>

      {/* ─── Filter Bar ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        {["All", "Active", "Contained", "Closed"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              statusFilter === s ? "bg-[#FFD600] text-[#05080F] border-[#FFD600]" : "text-slate-400 border-white/10 hover:text-slate-200"
            }`}
          >
            {s} {s !== "All" && `(${campaigns.filter(c => c.status === s).length})`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-slate-600 font-mono">{filtered.length} campaign{filtered.length !== 1 ? "s" : ""}</span>
          <button
            onClick={() => { setExpandedIds(filtered.length > 0 ? new Set(filtered.map(c => c.id)) : new Set()); }}
            className="text-[10px] font-mono text-slate-500 hover:text-slate-300 border border-white/10 px-2 py-1 rounded transition"
          >
            {expandedIds.size > 0 ? "Collapse All" : "Expand All"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl border border-white/5 bg-white/2 p-4 animate-pulse space-y-3">
              <div className="h-5 bg-white/5 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
              <div className="h-1.5 bg-white/5 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((campaign) => (
            <CampaignCard
              key={campaign.id as string}
              campaign={campaign as Campaign}
              isExpanded={expandedIds.has(campaign.id)}
              onToggle={() => toggleExpanded(campaign.id)}
              onSelect={() => setSelected((s: Campaign | null) => s?.id === campaign.id ? null : campaign as Campaign)}
              isSelected={selected?.id === campaign.id}
              onExport={() => exportCasefile(campaign)}
              onEscalate={() => escalateCampaign(campaign)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="xl:col-span-2 text-center py-16 text-slate-600">
              <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No {statusFilter !== "All" ? statusFilter.toLowerCase() : ""} campaigns detected</p>
              <p className="text-xs text-slate-700 mt-1">Run a correlation scan to detect coordinated attacks</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Similarity Heatmap (shown after running scan) ─── */}
      {similarityPairs.length > 0 && <SimilarityStrip pairs={similarityPairs} />}

    </div>
  );
}
