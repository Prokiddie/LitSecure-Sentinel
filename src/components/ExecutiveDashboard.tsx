import React, { useMemo } from "react";
import {
  Shield, AlertTriangle, Activity, TrendingUp,
  Building2, Zap, Hospital, GraduationCap, Users, Clock,
  DollarSign, CheckCircle2, ChevronRight, BarChart3
} from "lucide-react";
import { Incident } from "../types";

interface ExecutiveDashboardProps {
  incidents: Incident[];
  stats: any;
}

const SECTOR_ICONS: Record<string, React.ElementType> = {
  government: Building2,
  banking: Shield,
  telecom: Activity,
  utility: Zap,
  healthcare: Hospital,
  education: GraduationCap,
};

const DISTRICT_CONFIGS = [
  // NORTHERN
  { id: "chitipa",    name: "Chitipa",    region: "Northern", svgPath: "M 80,20 C 90,16 110,24 125,20 C 130,35 138,45 145,55 C 130,58 110,60 95,60 C 85,50 82,35 80,20 Z" },
  { id: "karonga",    name: "Karonga",    region: "Northern", svgPath: "M 125,20 C 145,18 165,15 190,18 C 195,30 200,45 200,65 C 180,62 160,58 145,55 C 138,45 130,35 125,20 Z" },
  { id: "likoma",     name: "Likoma",     region: "Northern", svgPath: "M 215,80 C 217,78 220,80 220,83 C 219,86 216,88 213,86 C 212,84 213,82 215,80 Z" },
  { id: "rumphi",     name: "Rumphi",     region: "Northern", svgPath: "M 95,60 C 110,60 130,58 145,55 C 152,70 160,85 160,105 C 140,108 120,110 100,110 C 98,95 96,80 95,60 Z" },
  { id: "mzimba",     name: "Mzimba",     region: "Northern", svgPath: "M 100,110 C 120,110 140,108 160,105 C 165,125 170,145 170,170 C 145,172 120,174 95,175 C 96,155 98,130 100,110 Z" },
  { id: "nkhatabay",  name: "Nkhata Bay", region: "Northern", svgPath: "M 160,105 C 175,102 195,98 205,98 C 205,115 202,135 198,155 C 188,160 180,165 170,170 C 170,145 165,125 160,105 Z" },
  // CENTRAL
  { id: "kasungu",    name: "Kasungu",    region: "Central",  svgPath: "M 95,175 C 120,174 145,172 170,170 C 170,195 168,220 168,240 C 140,242 110,244 85,245 C 88,220 92,195 95,175 Z" },
  { id: "nkhotakota", name: "Nkhotakota", region: "Central",  svgPath: "M 170,170 C 185,168 205,164 215,162 C 212,185 208,210 205,235 C 190,237 180,239 168,240 C 168,220 170,195 170,170 Z" },
  { id: "ntchisi",    name: "Ntchisi",    region: "Central",  svgPath: "M 120,240 C 135,240 150,239 168,240 C 168,252 165,265 165,275 C 150,277 135,278 120,278 C 120,265 120,252 120,240 Z" },
  { id: "dowa",       name: "Dowa",       region: "Central",  svgPath: "M 85,245 C 100,243 110,241 120,240 C 120,252 120,265 120,278 C 105,280 90,281 75,282 C 78,270 81,258 85,245 Z" },
  { id: "salima",     name: "Salima",     region: "Central",  svgPath: "M 168,240 C 180,239 190,237 205,235 C 202,250 200,265 200,278 C 185,278 175,277 165,275 C 165,265 168,252 168,240 Z" },
  { id: "lilongwe",   name: "Lilongwe",   region: "Central",  svgPath: "M 75,282 C 105,280 135,278 165,275 C 165,295 162,315 160,335 C 130,336 100,338 72,338 C 72,318 73,298 75,282 Z" },
  { id: "mchinji",    name: "Mchinji",    region: "Central",  svgPath: "M 30,282 C 48,282 62,282 75,282 C 73,298 72,318 72,338 C 58,338 42,338 28,338 C 28,318 29,298 30,282 Z" },
  { id: "dedza",      name: "Dedza",      region: "Central",  svgPath: "M 100,338 C 120,336 140,335 160,335 C 160,352 161,370 162,385 C 140,387 120,388 100,388 C 100,370 100,352 100,338 Z" },
  { id: "ntcheu",     name: "Ntcheu",     region: "Central",  svgPath: "M 72,338 C 85,338 92,338 100,338 C 100,352 100,370 100,388 C 88,389 75,390 65,390 C 65,372 68,355 72,338 Z" },
  // SOUTHERN
  { id: "mangochi",   name: "Mangochi",   region: "Southern", svgPath: "M 160,335 C 180,332 200,328 215,325 C 212,348 208,372 205,435 C 190,437 172,438 160,438 C 161,370 160,352 160,335 Z" },
  { id: "machinga",   name: "Machinga",   region: "Southern", svgPath: "M 110,388 C 130,387 145,385 160,438 C 160,452 158,468 158,485 C 140,488 122,488 107,488 C 108,455 109,422 110,388 Z" },
  { id: "balaka",     name: "Balaka",     region: "Southern", svgPath: "M 65,390 C 80,389 95,388 110,388 C 109,422 108,455 107,488 C 92,489 80,490 70,488 C 68,455 66,422 65,390 Z" },
  { id: "zomba",      name: "Zomba",      region: "Southern", svgPath: "M 107,488 C 122,488 140,488 158,485 C 155,502 152,518 150,518 C 132,520 118,520 100,520 C 102,510 105,500 107,488 Z" },
  { id: "chiradzulu", name: "Chiradzulu", region: "Southern", svgPath: "M 75,488 C 88,488 95,488 100,520 C 90,522 80,522 75,522 C 73,510 74,500 75,488 Z" },
  { id: "blantyre",   name: "Blantyre",   region: "Southern", svgPath: "M 40,488 C 55,488 68,488 75,488 C 75,522 68,525 55,530 L 40,532 Z" },
  { id: "mwanza",     name: "Mwanza",     region: "Southern", svgPath: "M 25,530 C 35,530 45,530 55,530 C 53,542 52,552 53,560 C 42,562 32,562 25,562 C 24,550 24,540 25,530 Z" },
  { id: "thyolo",     name: "Thyolo",     region: "Southern", svgPath: "M 55,522 C 70,520 85,520 100,520 C 98,532 98,545 98,555 C 85,558 70,558 55,558 C 54,546 54,534 55,522 Z" },
  { id: "mulanje",    name: "Mulanje",    region: "Southern", svgPath: "M 100,520 C 118,518 135,516 150,518 C 148,532 148,546 148,558 C 132,560 115,560 100,560 C 100,546 100,532 100,520 Z" },
  { id: "phalombe",   name: "Phalombe",   region: "Southern", svgPath: "M 150,518 C 162,516 175,514 185,515 C 182,528 182,540 182,552 C 170,554 160,554 150,555 C 150,542 150,530 150,518 Z" },
  { id: "chikwawa",   name: "Chikwawa",   region: "Southern", svgPath: "M 22,560 C 38,558 54,558 70,558 C 68,572 68,586 68,600 C 52,602 36,602 22,602 C 22,588 22,575 22,560 Z" },
  { id: "nsanje",     name: "Nsanje",     region: "Southern", svgPath: "M 32,600 C 46,598 58,596 72,598 C 70,612 70,626 70,640 C 56,642 42,642 32,642 C 31,628 31,614 32,600 Z" },
  { id: "neno",       name: "Neno",       region: "Southern", svgPath: "M 22,555 C 32,553 44,553 55,553 C 53,565 53,575 53,580 C 42,582 32,582 22,582 C 21,572 21,562 22,555 Z" },
];

export default function ExecutiveDashboard({ incidents, stats }: ExecutiveDashboardProps) {
  // ── Calculate dynamic non-technical metrics ──────────────────────────────
  const { activeCount, criticalCount, totalCount, fraudLoss } = useMemo(() => {
    const active = incidents.filter(i => !["Resolved", "Contained", "Closed"].includes(i.status));
    const critical = active.filter(i => i.severity === "Critical");
    const total = incidents.length;

    // Calculate Fraud Loss Prevented from Contained/Resolved fraud cases
    const fraud = incidents.filter(
      i => ["Resolved", "Contained"].includes(i.status) &&
      (i.category?.toLowerCase() === "fraud" || i.category?.toLowerCase() === "sim_swap")
    );
    const loss = fraud.reduce((sum, i) => sum + (i.estimatedLoss || 0), 0);

    return {
      activeCount: active.length,
      criticalCount: critical.length,
      totalCount: total,
      fraudLoss: loss,
    };
  }, [incidents]);

  const nationalThreatLevel = useMemo(() => {
    if (criticalCount > 0) return { label: "CRITICAL", cls: "text-red-400 border-red-500/30 bg-red-500/5", desc: "Active high-severity threat clusters detected. Coordination cells are deployed." };
    if (activeCount > 2) return { label: "ELEVATED", cls: "text-orange-400 border-orange-500/30 bg-orange-500/5", desc: "Multiple active intrusions being handled by incident response units." };
    return { label: "NORMAL", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5", desc: "Digital infrastructure is stable. General cyber hygiene alerts apply." };
  }, [activeCount, criticalCount]);

  // Compute region risk scores for heatmap coloring
  const districtRisks = useMemo(() => {
    return DISTRICT_CONFIGS.map(d => {
      const activeIncs = incidents.filter(i => {
        if (i.status === "Resolved" || i.status === "Contained" || i.status === "Closed") return false;
        const text = (i.title + " " + i.description).toLowerCase();
        return text.includes(d.name.toLowerCase()) || text.includes(d.id.toLowerCase());
      }).length;

      const baseRisk = d.id === "lilongwe" ? 55 : d.id === "blantyre" ? 50 : d.id === "zomba" ? 45 : 15;
      const riskScore = Math.min(100, baseRisk + activeIncs * 25);
      return { id: d.id, riskScore };
    });
  }, [incidents]);

  const riskColor = (score: number) => {
    if (score >= 85) return { fill: "rgba(239, 68, 68, 0.8)", stroke: "#ef4444" }; // Red
    if (score >= 60) return { fill: "rgba(249, 115, 22, 0.7)", stroke: "#f97316" }; // Orange
    if (score >= 40) return { fill: "rgba(234, 179, 8, 0.6)", stroke: "#eab308" }; // Yellow
    return { fill: "rgba(34, 197, 94, 0.2)", stroke: "rgba(34, 197, 94, 0.4)" }; // Green
  };

  return (
    <div className="space-y-6" id="executive-dashboard">
      
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="font-bebas text-2xl text-white tracking-widest">EXECUTIVE BRIEFING DASHBOARD</h2>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">MACRA — National Cybersecurity Overview Dashboard</p>
        </div>
        <div className="ml-auto text-right text-[10px] font-mono text-slate-500 hidden sm:block">
          <div>Report Generated: {new Date().toLocaleDateString("en-MW")}</div>
          <div className="text-emerald-400">Classified: PUBLIC BRIEF</div>
        </div>
      </div>

      {/* ─── Top Level Banners (No Jargon) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* National Threat Banner */}
        <div className={`col-span-1 md:col-span-2 rounded-2xl border p-5 flex flex-col justify-between ${nationalThreatLevel.cls}`}>
          <div>
            <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 block mb-1">National Security Index</span>
            <span className="font-bebas text-4xl tracking-widest block leading-none">{nationalThreatLevel.label}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mt-2">{nationalThreatLevel.desc}</p>
        </div>

        {/* Financial Loss Prevented */}
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Fraud Losses Mitigated</span>
            <span className="font-bebas text-3xl text-emerald-400 leading-none block">
              MWK {fraudLoss ? (fraudLoss / 1000000).toFixed(1) + "M" : "0.0M"}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-mono mt-2">Saved through rapid wallet freezing and containment advice.</p>
        </div>

        {/* Incidents this month */}
        <div className="rounded-2xl border border-white/5 bg-[#0A0E1A] p-5 flex flex-col justify-between">
          <div>
            <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Reports Triage Queue</span>
            <span className="font-bebas text-3xl text-[#FFD600] leading-none block">{activeCount} Cases Active</span>
          </div>
          <p className="text-[10px] text-slate-500 font-mono mt-2">Unresolved incidents in the operational queue.</p>
        </div>

      </div>

      {/* ─── Grid: Heatmap + Sector Health ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Geographic Heatmap */}
        <div className="lg:col-span-5 card p-5 flex flex-col h-[520px]">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 mb-4">
            <div className="w-1 h-4 bg-blue-500 rounded" />
            National Threat Distribution
          </h3>
          
          <div className="flex-1 flex justify-center items-center relative">
            <svg viewBox="0 0 240 660" className="h-[400px] w-auto">
              {DISTRICT_CONFIGS.map(d => {
                const riskObj = districtRisks.find(r => r.id === d.id);
                const score = riskObj ? riskObj.riskScore : 15;
                const colors = riskColor(score);
                return (
                  <path
                    key={d.id}
                    d={d.svgPath}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth="1.2"
                    className="transition-all duration-300 hover:opacity-85"
                  >
                    <title>{d.name} District - Risk: {score}%</title>
                  </path>
                );
              })}
            </svg>
            
            {/* Legend */}
            <div className="absolute bottom-2 left-2 space-y-1 font-mono text-[9px]">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500/80" /> Critical Risk (80+)</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-orange-500/70" /> High Alerts (60-79)</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-yellow-500/60" /> Elevated Risk (40-59)</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-green-500/20 border border-green-500/40" /> Stable (0-39)</div>
            </div>
          </div>
        </div>

        {/* Sector Integrity index */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Critical Sectors Grid */}
          <div className="card p-5 space-y-4">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-1 h-4 bg-emerald-500 rounded" />
              Critical Infrastructure Sectors
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: "Banking & Financials", id: "banking", desc: "Commercial banks & payment interfaces", val: 92 },
                { name: "Telecommunications", id: "telecom", desc: "Mobile carriers, GSM & wallet nodes", val: 68 },
                { name: "Government Systems", id: "government", desc: "State portals and administrative clouds", val: 81 },
                { name: "Utilities & Services", id: "utility", desc: "Water grids, ESCOM telemetry, ISPs", val: 94 },
              ].map(s => {
                const Icon = SECTOR_ICONS[s.id] || Shield;
                const statusCls = s.val >= 80 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-orange-400 bg-orange-500/10 border-orange-500/20";
                return (
                  <div key={s.id} className="p-3 bg-[#0A0E1A] border border-white/5 rounded-xl flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${statusCls}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="text-xs font-bold text-white truncate">{s.name}</span>
                        <span className={`text-[10px] font-mono font-bold ${s.val >= 80 ? "text-emerald-400" : "text-orange-400"}`}>{s.val}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-1">
                        <div className={`h-full rounded-full ${s.val >= 80 ? "bg-emerald-500" : "bg-orange-500"}`} style={{ width: `${s.val}%` }} />
                      </div>
                      <span className="text-[9px] text-slate-500 truncate block">{s.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agency Performance Matrix */}
          <div className="card p-5 space-y-4">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-1 h-4 bg-[#FFD600] rounded" />
              Agency Operations Performance
            </h3>

            <div className="space-y-3">
              {[
                { agency: "MACERT Team", task: "Incident Intake, Classification & Advisories", score: 98, time: "12 mins", status: "Active" },
                { agency: "MACRA Cyber Unit", task: "SIM-Freeze Coordination & Carrier Blocks", score: 85, time: "25 mins", status: "Active" },
                { agency: "Police Cybercrime Unit", task: "Forensic Investigation & Suspect Arrests", score: 62, time: "4.5 hrs", status: "Support" },
              ].map(a => (
                <div key={a.agency} className="p-3 bg-[#0A0E1A] border border-white/5 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-slate-200">{a.agency}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">{a.task}</p>
                    <div className="flex gap-4 mt-2 text-[9px] font-mono text-slate-400">
                      <span>Mitigation Rate: <strong className="text-slate-200">{a.score}%</strong></span>
                      <span>Avg Reaction: <strong className="text-slate-200">{a.time}</strong></span>
                    </div>
                  </div>
                  <span className={`font-mono text-[9px] font-bold border rounded px-2 py-0.5 shrink-0 ${
                    a.status === "Active" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                  }`}>{a.status}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
