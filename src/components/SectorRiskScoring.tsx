import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Minus,
  Shield, AlertTriangle, RefreshCw, Loader2,
  Building2, Wifi, GraduationCap, Zap, Globe, Landmark,
  ChevronRight, Clock, Target, ExternalLink
} from "lucide-react";

interface OrgScore {
  id: string;
  name: string;
  sector: string;
  riskScore: number;
  riskLevel: "Critical" | "High" | "Elevated" | "Fair" | "Good";
  trend: "improving" | "worsening" | "stable";
  breakdown: { incidentFrequency: number; severity: number; resolutionSpeed: number; openIncidents: number; };
  incidentCount: number;
  openCount: number;
  resolvedCount: number;
  lastIncident?: string;
  recommendation: string;
}

interface SectorSummary {
  sector: string;
  avgRisk: number;
  orgCount: number;
  totalIncidents: number;
  criticalOrgs: number;
  orgs: OrgScore[];
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const RISK_STYLE: Record<string, { badge: string; bar: string; text: string; glow: string }> = {
  Critical: { badge: "text-red-400 bg-red-500/10 border-red-500/25",       bar: "bg-red-500",     text: "text-red-400",    glow: "shadow-red-500/20" },
  High:     { badge: "text-orange-400 bg-orange-500/10 border-orange-500/25", bar: "bg-orange-400",  text: "text-orange-400", glow: "shadow-orange-500/20" },
  Elevated: { badge: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",  bar: "bg-[#FFD600]",   text: "text-[#FFD600]",  glow: "shadow-yellow-500/20" },
  Fair:     { badge: "text-blue-400 bg-blue-500/10 border-blue-500/25",     bar: "bg-blue-400",    text: "text-blue-400",   glow: "shadow-blue-500/20" },
  Good:     { badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", bar: "bg-emerald-400", text: "text-emerald-400", glow: "shadow-emerald-500/20" },
};

const SECTOR_ICONS: Record<string, React.ElementType> = {
  Banking: Landmark, Telecom: Wifi, Government: Building2,
  Education: GraduationCap, Utility: Zap, ISP: Globe,
};

const SECTOR_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  Banking:    { border: "border-[#FFD600]/30", text: "text-[#FFD600]",  bg: "bg-[#FFD600]/10" },
  Telecom:    { border: "border-blue-500/30",   text: "text-blue-400",   bg: "bg-blue-500/10" },
  Government: { border: "border-purple-500/30", text: "text-purple-400", bg: "bg-purple-500/10" },
  Education:  { border: "border-emerald-500/30",text: "text-emerald-400",bg: "bg-emerald-500/10" },
  Utility:    { border: "border-orange-500/30", text: "text-orange-400", bg: "bg-orange-500/10" },
  ISP:        { border: "border-cyan-500/30",   text: "text-cyan-400",   bg: "bg-cyan-500/10" },
};
const DEFAULT_SC = { border: "border-white/10", text: "text-slate-400", bg: "bg-white/5" };

const TrendIcon = ({ trend }: { trend: string }) =>
  trend === "improving" ? <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> :
  trend === "worsening" ? <TrendingUp   className="w-3.5 h-3.5 text-red-400"     /> :
                          <Minus        className="w-3.5 h-3.5 text-slate-500"   />;

// ─── Animated risk bar ────────────────────────────────────────────────────────
function AnimatedBar({ score, level }: { score: number; level: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), 120); return () => clearTimeout(t); }, [score]);
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${RISK_STYLE[level]?.bar ?? "bg-slate-500"}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// ─── Sparkline dots (mini 7-point trend) ─────────────────────────────────────
function SparkLine({ score, trend }: { score: number; trend: string }) {
  // Simulate a 7-point sparkline based on trend
  const base = score;
  const delta = trend === "improving" ? -2 : trend === "worsening" ? +2 : 0.5;
  const points = Array.from({ length: 7 }, (_, i) =>
    Math.max(5, Math.min(95, base - (6 - i) * delta + (Math.sin(i * 1.3) * 2)))
  );
  const max = Math.max(...points); const min = Math.min(...points);
  const h = 18; const w = 42;
  const normalize = (v: number) => ((v - min) / (max - min || 1)) * h;
  const path = points.map((v, i) => `${(i / 6) * w},${h - normalize(v)}`).join(" L ");

  return (
    <svg width={w} height={h + 2} className="shrink-0">
      <polyline
        points={path}
        fill="none"
        stroke={trend === "improving" ? "#34d399" : trend === "worsening" ? "#f87171" : "#64748b"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Sector Risk "Gauge" mini card ───────────────────────────────────────────
function SectorGauge({ sec, active, onClick }: { key?: React.Key; sec: SectorSummary; active: boolean; onClick: () => void }) {
  const Icon = SECTOR_ICONS[sec.sector] || Building2;
  const sc = SECTOR_COLORS[sec.sector] || DEFAULT_SC;
  const riskColor = sec.avgRisk >= 60 ? "text-red-400" : sec.avgRisk >= 40 ? "text-[#FFD600]" : "text-emerald-400";

  return (
    <button
      id={`sector-tab-${sec.sector.toLowerCase()}`}
      onClick={onClick}
      className={`rounded-xl border p-3 text-center space-y-1.5 transition-all duration-200 ${
        active
          ? `${sc.border} ${sc.bg} shadow-md`
          : "border-white/8 hover:border-white/15 bg-[#05080F]/40"
      }`}
    >
      <div className={`p-2 rounded-lg border w-fit mx-auto ${sc.border} ${sc.bg}`}>
        <Icon className={`w-4 h-4 ${sc.text}`} />
      </div>
      <div className="text-[10px] font-bold text-white">{sec.sector}</div>
      <div className={`text-xl font-bebas ${riskColor}`}>{sec.avgRisk}</div>
      <div className="text-[8px] text-slate-600 font-mono">{sec.orgCount} orgs</div>
      {/* Mini trend dots */}
      <div className="flex justify-center gap-0.5">
        {sec.orgs.slice(0, 5).map((o, i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full ${o.riskLevel === "Critical" ? "bg-red-500" : o.riskLevel === "High" ? "bg-orange-400" : o.riskLevel === "Elevated" ? "bg-yellow-400" : "bg-emerald-400"}`}
          />
        ))}
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SectorRiskScoring() {
  const [sectors, setSectors]           = useState<SectorSummary[]>([]);
  const [loading, setLoading]           = useState(true);
  const [recalculating, setRecalc]      = useState(false);
  const [activeSector, setActiveSector] = useState<string>("Banking");
  const [selectedOrg, setSelectedOrg]   = useState<OrgScore | null>(null);
  const [sortBy, setSortBy]             = useState<"score" | "incidents" | "name">("score");
  const [showOnlyHighRisk, setShowOnlyHighRisk] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = () => ({ Authorization: `Bearer ${token()}` });

  const loadScores = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/risk/sectors", { headers: authH() });
      if (r.ok) {
        const data: SectorSummary[] = await r.json();
        setSectors(data);
        setLastUpdated(new Date());
        if (data.length > 0 && !data.find(s => s.sector === activeSector)) {
          setActiveSector(data[0].sector);
        }
      }
    } finally { if (!silent) setLoading(false); }
  }, [activeSector]);

  const recalculate = async () => {
    setRecalc(true);
    try {
      await fetch("/api/risk/recalculate", { method: "POST", headers: authH() });
      await loadScores();
    } finally { setRecalc(false); }
  };

  // Initial load + 60-second auto-refresh
  useEffect(() => {
    loadScores();
    refreshRef.current = setInterval(() => loadScores(true), 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, []);

  const currentSector = sectors.find(s => s.sector === activeSector);
  const nationalAvg   = sectors.length ? Math.round(sectors.reduce((s, x) => s + x.avgRisk, 0) / sectors.length) : 0;
  const criticalTotal = sectors.reduce((s, x) => s + x.criticalOrgs, 0);

  // Sorted + filtered org list
  const sortedOrgs = (currentSector?.orgs ?? [])
    .filter(o => !showOnlyHighRisk || ["Critical", "High"].includes(o.riskLevel))
    .sort((a, b) =>
      sortBy === "score" ? b.riskScore - a.riskScore :
      sortBy === "incidents" ? b.incidentCount - a.incidentCount :
      a.name.localeCompare(b.name)
    );

  // National leaderboard: top orgs across all sectors sorted by risk
  const allOrgs = sectors.flatMap(s => s.orgs).sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="space-y-5" id="sector-risk-scoring">

      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-[#FFD600]/20 p-5">
        <div className="absolute -bottom-4 -right-4 w-40 h-40 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-[#FFD600]/50 via-orange-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#FFD600]" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">NATIONAL SECTOR RISK LEADERBOARD</h2>
              <p className="text-[10px] text-slate-500 font-mono">
                Dynamic cybersecurity health scores · Trend tracking · MACRA recommendations
              </p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-3 shrink-0">
            {/* Live feed indicator */}
            {lastUpdated && (
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                LIVE · {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            )}
            <button
              id="recalculate-scores-btn"
              onClick={recalculate}
              disabled={recalculating || loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border border-[#FFD600]/30 text-[#FFD600] hover:bg-[#FFD600]/10 transition disabled:opacity-50"
            >
              {recalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Recalculate
            </button>
          </div>
        </div>
      </div>

      {/* ─── National KPI Strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "National Avg. Risk",  val: `${nationalAvg}/100`,                                    icon: BarChart3,    color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20" },
          { label: "High-Risk Orgs",      val: criticalTotal,                                            icon: AlertTriangle,color: "text-red-400 bg-red-500/10 border-red-500/20" },
          { label: "Sectors Scored",      val: sectors.length,                                           icon: Shield,       color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
          { label: "Orgs Monitored",      val: sectors.reduce((s, x) => s + x.orgCount, 0),              icon: Building2,   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">{label}</div>
              <div className="text-xl font-bold font-mono text-slate-100">{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── National Top-5 Risk Bar (quick visual) ─── */}
      <div className="card p-4 space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-red-400" /> Top Risk Organizations (National)
        </h4>
        <div className="space-y-2.5">
          {allOrgs.slice(0, 5).map((org, i) => {
            const rs = RISK_STYLE[org.riskLevel];
            const sc = SECTOR_COLORS[org.sector] || DEFAULT_SC;
            return (
              <div key={org.id} className="flex items-center gap-3">
                <span className="text-[10px] font-bebas text-slate-600 w-4 shrink-0">#{i + 1}</span>
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${sc.border} ${sc.text} ${sc.bg}`}>{org.sector}</span>
                <span className="text-[10px] text-slate-300 flex-1 truncate">{org.name}</span>
                <SparkLine score={org.riskScore} trend={org.trend} />
                <TrendIcon trend={org.trend} />
                <span className={`text-sm font-bebas w-8 text-right shrink-0 ${rs.text}`}>{org.riskScore}</span>
                <div className="w-20 shrink-0">
                  <AnimatedBar score={org.riskScore} level={org.riskLevel} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Sector Gauge Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {sectors.map((sec) => (
          <SectorGauge
            key={sec.sector as string}
            sec={sec as SectorSummary}
            active={activeSector === sec.sector}
            onClick={() => { setActiveSector(sec.sector); setSelectedOrg(null); }}
          />
        ))}
      </div>

      {/* ─── Org Leaderboard + Detail ─── */}
      {loading ? (
        <div className="text-center py-10 text-slate-600 font-mono text-xs">Calculating risk scores…</div>
      ) : currentSector && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* ── Org Leaderboard ── */}
          <div className="xl:col-span-2 card p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              {React.createElement(SECTOR_ICONS[currentSector.sector] || Building2, {
                className: `w-4 h-4 ${SECTOR_COLORS[currentSector.sector]?.text ?? "text-slate-400"}`
              })}
              <h3 className="font-grotesk font-bold text-sm text-white">
                {currentSector.sector} Sector — Risk Leaderboard
              </h3>
              <span className="ml-auto text-[10px] font-mono text-slate-500">Avg: {currentSector.avgRisk}/100</span>
            </div>

            {/* Sort + filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-slate-600 font-mono mr-1">Sort:</span>
              {(["score", "incidents", "name"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2.5 py-1 rounded text-[9px] font-mono border transition ${
                    sortBy === s ? "bg-[#FFD600]/15 border-[#FFD600]/30 text-[#FFD600]" : "border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {s === "score" ? "Risk Score" : s === "incidents" ? "Incidents" : "A–Z"}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyHighRisk}
                  onChange={e => setShowOnlyHighRisk(e.target.checked)}
                  className="w-3 h-3 rounded accent-red-500"
                />
                High-risk only
              </label>
            </div>

            <div className="space-y-2">
              {sortedOrgs.map((org, i) => {
                const rs = RISK_STYLE[org.riskLevel];
                return (
                  <button
                    key={org.id}
                    id={`org-score-${org.id}`}
                    onClick={() => setSelectedOrg(selectedOrg?.id === org.id ? null : org)}
                    className={`w-full flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                      selectedOrg?.id === org.id
                        ? "border-[#FFD600]/40 bg-[#FFD600]/5"
                        : "border-white/5 hover:border-white/10 bg-[#05080F]/40"
                    }`}
                  >
                    {/* Rank */}
                    <span className="text-lg font-bebas text-slate-600 w-5 shrink-0">#{i + 1}</span>

                    {/* Name + trend sparkline */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">{org.name}</span>
                        <TrendIcon trend={org.trend} />
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono">
                        {org.incidentCount} incidents · {org.openCount} open · {org.resolvedCount} resolved
                      </div>
                    </div>

                    {/* Sparkline */}
                    <div className="hidden sm:block">
                      <SparkLine score={org.riskScore} trend={org.trend} />
                    </div>

                    {/* Risk bar */}
                    <div className="hidden sm:flex flex-col items-end gap-1 w-24 shrink-0">
                      <div className="flex justify-between w-full text-[9px] font-mono text-slate-500">
                        <span>Risk</span><span>{org.riskScore}/100</span>
                      </div>
                      <AnimatedBar score={org.riskScore} level={org.riskLevel} />
                    </div>

                    {/* Badge */}
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${rs.badge}`}>
                      {org.riskLevel}
                    </span>

                    <ChevronRight className={`w-4 h-4 shrink-0 transition ${selectedOrg?.id === org.id ? "text-[#FFD600] rotate-90" : "text-slate-700"}`} />
                  </button>
                );
              })}

              {sortedOrgs.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-xs">
                  {showOnlyHighRisk ? "No high-risk organizations in this sector" : "No organizations found"}
                </div>
              )}
            </div>
          </div>

          {/* ── Org Detail Panel ── */}
          <div className="xl:col-span-1">
            {selectedOrg ? (
              <div className={`card p-5 space-y-4 border ${RISK_STYLE[selectedOrg.riskLevel].badge.split(" ").slice(1).join(" ")} shadow-xl ${RISK_STYLE[selectedOrg.riskLevel].glow}`}>
                {/* Header */}
                <div className="border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${RISK_STYLE[selectedOrg.riskLevel].badge}`}>
                      {selectedOrg.riskLevel}
                    </span>
                    <TrendIcon trend={selectedOrg.trend} />
                    <span className="text-[9px] text-slate-500 font-mono">
                      {selectedOrg.trend === "improving" ? "↓ Improving" : selectedOrg.trend === "worsening" ? "↑ Worsening" : "Stable"}
                    </span>
                    <button onClick={() => setSelectedOrg(null)} className="ml-auto text-slate-700 hover:text-slate-400 text-xs transition">✕</button>
                  </div>
                  <h3 className="font-grotesk font-bold text-white text-sm">{selectedOrg.name}</h3>
                  <div className={`font-bebas text-5xl mt-1 ${RISK_STYLE[selectedOrg.riskLevel].text}`}>
                    {selectedOrg.riskScore}<span className="text-base font-mono text-slate-600">/100</span>
                  </div>
                  {/* Large animated bar */}
                  <div className="mt-2">
                    <AnimatedBar score={selectedOrg.riskScore} level={selectedOrg.riskLevel} />
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score Breakdown</h4>
                  {[
                    { label: "Incident Frequency", val: selectedOrg.breakdown.incidentFrequency, max: 30 },
                    { label: "Severity Weight",    val: selectedOrg.breakdown.severity,           max: 30 },
                    { label: "Resolution Speed",   val: selectedOrg.breakdown.resolutionSpeed,    max: 20 },
                    { label: "Open Incidents",     val: selectedOrg.breakdown.openIncidents,      max: 20 },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                        <span>{item.label}</span><span>{item.val}/{item.max}</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${RISK_STYLE[selectedOrg.riskLevel].bar}`}
                          style={{ width: `${(item.val / item.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Total",    val: selectedOrg.incidentCount, color: "text-white" },
                    { label: "Open",     val: selectedOrg.openCount,     color: "text-orange-400" },
                    { label: "Resolved", val: selectedOrg.resolvedCount, color: "text-emerald-400" },
                  ].map(s => (
                    <div key={s.label} className="bg-[#05080F]/60 rounded-xl p-3 text-center border border-white/5">
                      <div className={`text-xl font-bebas ${s.color}`}>{s.val}</div>
                      <div className="text-[8px] font-mono text-slate-600 uppercase">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* MACRA Recommendation */}
                <div className="bg-[#FFD600]/5 border border-[#FFD600]/20 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-[#FFD600] shrink-0" />
                    <p className="text-[9px] font-bold text-[#FFD600] uppercase tracking-wider">MACRA Recommendation</p>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">{selectedOrg.recommendation}</p>
                </div>

                {/* Last incident */}
                {selectedOrg.lastIncident && (
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-600 font-mono">
                    <Clock className="w-3 h-3 shrink-0" />
                    Last incident: {new Date(selectedOrg.lastIncident).toLocaleDateString()}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-white/5">
                  <button className="flex-1 btn-accent py-1.5 rounded-lg text-[10px] font-bold">
                    Open Investigation
                  </button>
                  <button className="flex items-center gap-1 border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-slate-400 transition">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="card p-10 border border-dashed border-white/10 text-center text-slate-600">
                <BarChart3 className="w-7 h-7 mx-auto mb-3 opacity-20" />
                <p className="text-xs">Select an organization to view risk breakdown and MACRA recommendations</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
