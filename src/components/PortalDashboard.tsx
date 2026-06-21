import React, { useState, useEffect, useMemo } from "react";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { 
  ShieldAlert, Clock, Activity, Shield, CheckCircle2,
  AlertTriangle, Server, ArrowUpRight, TrendingDown,
  Globe, Calendar, MapPin, X, Info, Layers, Cpu
} from "lucide-react";
import { Incident, NationalStats } from "../types";

interface PortalDashboardProps {
  incidents: Incident[];
  stats: NationalStats;
}

// Recharts colors
const COLORS = {
  Fraud: "#f43f5e",               // Rose
  Phishing: "#ec4899",            // Pink
  Malware: "#a855f7",             // Purple
  "Unauthorized Access": "#3b82f6",// Blue
  "System Breach": "#ef4444",      // Crimson Red
  "Network Intrusion": "#06b6d4",  // Cyan
  Unknown: "#64748b",             // Slate
};

const SEV_COLORS = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#FFD600"
};

// SVG coordinates for Malawi districts (viewBox: 0 0 240 660)
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

const riskColor = (score: number) => {
  if (score >= 80) return { fill: "#ef4444", stroke: "#dc2626", label: "CRITICAL", text: "text-red-400" };
  if (score >= 60) return { fill: "#f97316", stroke: "#ea580c", label: "HIGH",     text: "text-orange-400" };
  if (score >= 40) return { fill: "#eab308", stroke: "#ca8a04", label: "ELEVATED", text: "text-yellow-400" };
  if (score >= 20) return { fill: "#3b82f6", stroke: "#2563eb", label: "FAIR",     text: "text-blue-400" };
  return             { fill: "#22c55e", stroke: "#16a34a", label: "GOOD",     text: "text-green-400" };
};

export default function PortalDashboard({ incidents, stats }: PortalDashboardProps) {
  const [detailModal, setDetailModal] = useState<"incidents" | "assets" | "sla" | "uptime" | "containment" | null>(null);

  // Compute stats reactively from the incidents list
  const activeIncidents = useMemo(() => {
    return incidents.filter(i => i.status !== "Resolved" && i.status !== "Contained");
  }, [incidents]);

  const severityData = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    incidents.forEach(i => {
      if (counts[i.severity as keyof typeof counts] !== undefined) {
        counts[i.severity as keyof typeof counts]++;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  const categoryData = useMemo(() => {
    const catMap: Record<string, number> = {};
    incidents.forEach(i => {
      catMap[i.category] = (catMap[i.category] || 0) + 1;
    });
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [incidents]);

  // Compute district risk based on live incident descriptions or locations
  const computedDistricts = useMemo(() => {
    return DISTRICT_CONFIGS.map(d => {
      const activeCount = incidents.filter(i => {
        if (i.status === "Resolved" || i.status === "Contained") return false;
        const text = (i.title + " " + i.description + " " + i.reporterOrg).toLowerCase();
        
        // Match district names
        if (d.id === "lilongwe" && text.includes("lilongwe")) return true;
        if (d.id === "blantyre" && text.includes("blantyre")) return true;
        if (d.id === "zomba" && text.includes("zomba")) return true;
        if (d.id === "mzimba" && (text.includes("mzimba") || text.includes("mzuzu"))) return true;
        
        return text.includes(d.name.toLowerCase());
      }).length;

      // Base score plus scale per active incident
      const baseScore = d.id === "zomba" ? 65 : d.id === "lilongwe" ? 55 : d.id === "blantyre" ? 50 : 15;
      const riskScore = Math.min(100, baseScore + activeCount * 20);

      return {
        ...d,
        activeIncidents: activeCount,
        riskScore
      };
    });
  }, [incidents]);

  const topHotspots = useMemo(() => {
    return computedDistricts
      .filter(d => d.activeIncidents > 0 || d.riskScore > 40)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 4);
  }, [computedDistricts]);

  // Calculate severity percentage distribution for the meter
  const severityDistribution = useMemo(() => {
    const total = activeIncidents.length || 1;
    const critical = activeIncidents.filter(i => i.severity === "Critical").length;
    const high = activeIncidents.filter(i => i.severity === "High").length;
    const medium = activeIncidents.filter(i => i.severity === "Medium").length;
    const low = activeIncidents.filter(i => i.severity === "Low").length;

    return {
      Critical: Math.round((critical / total) * 100),
      High: Math.round((high / total) * 100),
      Medium: Math.round((medium / total) * 100),
      Low: Math.round((low / total) * 100),
      counts: { Critical: critical, High: high, Medium: medium, Low: low }
    };
  }, [activeIncidents]);

  // Recent incidents timeline feed
  const recentIncidents = useMemo(() => {
    return incidents.slice(0, 4);
  }, [incidents]);

  return (
    <div className="space-y-6" id="portal-dashboard">
      
      {/* ─── LIVE THREAT STATUS HEADER ─────────────────────────────────────── */}
      <div className="card p-5 relative overflow-hidden bg-gradient-to-r from-[#0A0E1A] via-[#0b1224] to-[#0A0E1A] border-l-4 border-l-[#FFD600]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFD600]/3 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase">LitSecure Security Operations Center</span>
            </div>
            <h3 className="text-lg font-grotesk font-bold text-white">National Telemetry & Threat Monitor</h3>
            <p className="text-xs text-slate-500">Live monitoring of network intrusions, mobile financial fraud, and system breaches</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="space-y-1.5 w-40">
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-slate-500 uppercase">Live Alert Priority</span>
                <span className="text-rose-400 font-bold">{severityDistribution.counts.Critical} Critical</span>
              </div>
              <div className="h-2.5 bg-white/5 rounded-full overflow-hidden flex">
                <div style={{ width: `${severityDistribution.Critical}%` }} className="bg-red-500 h-full transition-all duration-500" title="Critical" />
                <div style={{ width: `${severityDistribution.High}%` }} className="bg-orange-500 h-full transition-all duration-500" title="High" />
                <div style={{ width: `${severityDistribution.Medium}%` }} className="bg-yellow-500 h-full transition-all duration-500" title="Medium" />
                <div style={{ width: `${severityDistribution.Low}%` }} className="bg-blue-500 h-full transition-all duration-500" title="Low" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BENTO KEY STATS GRID ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { 
            id: "incidents",
            label: "Total Incidents", 
            val: incidents.length, 
            sub: "+14.8% vs last month", 
            subColor: "text-red-400",
            icon: ShieldAlert, 
            bg: "bg-red-500/5 border-red-500/10 hover:border-red-500/25" 
          },
          { 
            id: "assets",
            label: "Protected Systems", 
            val: "1,450", 
            sub: "Active nodes", 
            subColor: "text-emerald-400 font-bold",
            icon: Server, 
            bg: "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/25" 
          },
          { 
            id: "sla",
            label: "Avg Response Time", 
            val: "14.2 min", 
            sub: "Under SLA threshold", 
            subColor: "text-green-400",
            icon: Clock, 
            bg: "bg-blue-500/5 border-blue-500/10 hover:border-blue-500/25" 
          },
          { 
            id: "uptime",
            label: "Uptime (MACRA)", 
            val: "99.98%", 
            sub: "Stable connection", 
            subColor: "text-emerald-400",
            icon: Activity, 
            bg: "bg-amber-500/5 border-amber-500/10 hover:border-amber-500/25" 
          },
          { 
            id: "containment",
            label: "Containment Rate", 
            val: "94.2%", 
            sub: "Active routing", 
            subColor: "text-[#FFD600]",
            icon: Shield, 
            bg: "bg-purple-500/5 border-purple-500/10 hover:border-purple-500/25" 
          }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <button 
              key={idx} 
              onClick={() => setDetailModal(item.id as any)}
              className={`card p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 text-left w-full cursor-pointer ${item.bg}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">{item.label}</span>
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold font-mono text-slate-100">{item.val}</div>
                <div className={`text-[9px] font-mono mt-1 ${item.subColor}`}>{item.sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── CHARTS & MAP (MIDDLE SECTION) ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Malawi Risk Hotspots Map Card (5 cols) */}
        <div className="md:col-span-5 card p-5 flex flex-col justify-between">
          <div>
            <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-1 h-4 bg-orange-400 rounded" />
              Active Incident Hotspots
              <span className="ml-auto text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded animate-pulse">MAP ON</span>
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">Geographic risk based on active containment reports</p>
          </div>

          <div className="flex items-center gap-5 mt-4">
            {/* SVG MINI MAP OF MALAWI */}
            <div className="w-1/2 flex justify-center">
              <svg viewBox="0 0 240 660" className="h-[210px] w-auto drop-shadow-2xl">
                {/* Background lake */}
                <path d="M 175,95 C 185,90 195,85 208,85 C 215,90 220,120 222,150 C 224,180 222,210 218,240 C 214,270 210,300 205,330 C 200,350 194,370 192,390 C 188,410 182,425 180,425 C 178,415 182,400 185,385 C 188,370 194,340 196,310 C 198,280 200,240 198,200 C 196,160 192,130 178,110 Z"
                  fill="#2563eb" fillOpacity="0.15" stroke="#3b82f6" strokeWidth="0.4" strokeOpacity="0.4" />
                
                {/* District boundaries colored by dynamic risk */}
                {computedDistricts.map(d => {
                  const rc = riskColor(d.riskScore);
                  const hasActive = d.activeIncidents > 0;
                  return (
                    <g key={d.id}>
                      <path
                        d={d.svgPath}
                        fill={rc.fill}
                        fillOpacity={hasActive ? 0.9 : 0.4}
                        stroke={hasActive ? "#FFD600" : rc.stroke}
                        strokeWidth={hasActive ? 1.2 : 0.4}
                        className="transition-all duration-300"
                      />
                      {hasActive && (
                        <circle
                          cx={(() => {
                            const m = d.svgPath.match(/M (\d+),(\d+)/);
                            return m ? (parseInt(m[1]) + 20) : 100;
                          })()}
                          cy={(() => {
                            const m = d.svgPath.match(/M \d+,(\d+)/);
                            return m ? (parseInt(m[1]) + 15) : 200;
                          })()}
                          r="5"
                          fill="#ef4444"
                          stroke="#ffffff"
                          strokeWidth="0.8"
                          className="animate-ping"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Hotspots Info list */}
            <div className="w-1/2 space-y-2.5">
              <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Top Risk Coordinates</div>
              <div className="space-y-2">
                {topHotspots.length > 0 ? (
                  topHotspots.map(h => {
                    const rc = riskColor(h.riskScore);
                    return (
                      <div key={h.id} className="border border-white/5 bg-[#05080F]/40 rounded-lg p-2 flex items-center justify-between gap-1">
                        <div>
                          <div className="text-xs font-bold text-slate-200 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            {h.name}
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono">{h.region} region</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-bold font-mono ${rc.text}`}>{h.riskScore}</span>
                          <span className="text-[8px] text-orange-400 block font-mono">
                            {h.activeIncidents > 0 ? `${h.activeIncidents} Active` : "Base Risk"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[10px] text-slate-600 font-mono italic">All regions at baseline status.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Threat Type Donut Chart & Severity Breakdown (7 cols) */}
        <div className="md:col-span-7 card p-5 flex flex-col justify-between">
          <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
            <div className="w-1 h-4 bg-[#FFD600] rounded" />
            Threat Landscape Analytics
            <span className="ml-auto text-[9px] font-mono text-slate-500">Live Breakdown</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {/* Category Donut */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Threat Vectors</span>
              <div className="h-[140px] w-full relative">
                <ResponsiveContainer width="100%" height={140} minWidth={0}>
                  <PieChart>
                    <Pie
                      data={categoryData.slice(0, 5)}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryData.slice(0, 5).map((entry, index) => (
                        <Cell 
                           key={`cell-${index}`} 
                           fill={(COLORS as any)[entry.name] || COLORS.Unknown} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px", fontSize: "10px" }}
                      itemStyle={{ color: "#cbd5e1" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="text-lg font-bold text-slate-100 font-mono">{incidents.length}</span>
                    <span className="text-[8px] text-slate-500 block uppercase font-mono">Reports</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center mt-2 text-[9px] font-mono text-slate-500">
                {categoryData.slice(0, 3).map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (COLORS as any)[entry.name] || COLORS.Unknown }} />
                    <span className="truncate max-w-[70px]">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Severity Bars */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Severity Distribution</span>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height={140} minWidth={0}>
                  <BarChart
                    data={severityData}
                    margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '9px', fontFamily: 'monospace' }} />
                    <YAxis stroke="#64748b" style={{ fontSize: '9px', fontFamily: 'monospace' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px", fontSize: "10px" }}
                      itemStyle={{ color: "#cbd5e1" }}
                    />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                      {severityData.map((entry, index) => (
                        <Cell 
                           key={`cell-${index}`} 
                           fill={(SEV_COLORS as any)[entry.name] || "#3b82f6"} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-3 text-[9px] font-mono text-slate-500 mt-2">
                <span>Critical: <strong className="text-red-400">{severityDistribution.counts.Critical}</strong></span>
                <span>High: <strong className="text-orange-400">{severityDistribution.counts.High}</strong></span>
                <span>Med: <strong className="text-yellow-400">{severityDistribution.counts.Medium}</strong></span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ─── DYNAMIC INCIDENT TIMELINE FEED ────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
            <div className="w-1 h-4 bg-[#FFD600] rounded" />
            Recent Cyber Incident Timeline
          </h4>
          <span className="text-[9px] font-mono text-slate-500 uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-ping" />
            Live Ingestion Pipeline
          </span>
        </div>

        <div className="relative border-l border-white/10 pl-5 ml-2.5 space-y-5 py-1">
          {recentIncidents.length > 0 ? (
            recentIncidents.map((inc, index) => {
              const dateVal = new Date(inc.incidentDate);
              const formattedDate = isNaN(dateVal.getTime()) 
                ? inc.incidentDate 
                : dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " — " + dateVal.toLocaleDateString([], { month: 'short', day: 'numeric' });

              return (
                <div key={inc.id} className="relative group">
                  {/* Glowing connector node */}
                  <span className={`absolute -left-[26px] top-1 w-3 h-3 rounded-full border-2 border-[#05080F] transition duration-200 group-hover:scale-125 ${
                    inc.severity === "Critical" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                    inc.severity === "High" ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" :
                    inc.severity === "Medium" ? "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" :
                    "bg-blue-500"
                  }`} />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100 group-hover:text-[#FFD600] transition duration-150">
                          {inc.title}
                        </span>
                        <span className="text-[9px] font-mono font-bold bg-[#05080F]/60 text-slate-400 px-1.5 py-0.5 rounded border border-white/5 shrink-0">
                          {inc.id}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-slate-600" />
                          {inc.category}
                        </span>
                        <span className="text-slate-700">•</span>
                        <span>Reporter: <strong className="text-slate-400 font-semibold">{inc.reporterOrg}</strong></span>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2">
                      <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
                        inc.severity === "Critical" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        inc.severity === "High" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                        inc.severity === "Medium" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                        "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      }`}>
                        {inc.severity} Severity
                      </span>
                      <span className="text-[9px] font-mono text-slate-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formattedDate}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 text-slate-600 text-xs font-mono">
              Waiting for live incident feed packets...
            </div>
          )}
        </div>
      </div>

      {/* ─── Detail Modals (For Bento Cards Clicked) ─── */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[#080c17] border border-[#FFD600]/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
                  <Info className="w-4 h-4 text-[#FFD600]" />
                </div>
                <div>
                  <h3 className="font-bebas text-lg text-white tracking-widest uppercase">
                    {detailModal === "incidents" && "Incidents Summary Register"}
                    {detailModal === "assets" && "Critical Protected Infrastructure Assets"}
                    {detailModal === "sla" && "Service Level Agreement (SLA) Matrix"}
                    {detailModal === "uptime" && "MACRA National Node Telemetry Status"}
                    {detailModal === "containment" && "Active Incident Containment Playbook"}
                  </h3>
                  <p className="text-[9px] text-slate-500 font-mono">MACRA OPERATIONAL PORTAL Telemetry</p>
                </div>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-3 font-mono text-xs text-slate-300">
              
              {/* 1. Incidents Detail */}
              {detailModal === "incidents" && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500">List of all telemetry security alarms categorized by priority status.</p>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400">
                        <th className="py-2">ID</th>
                        <th className="py-2">Title</th>
                        <th className="py-2">Category</th>
                        <th className="py-2">Severity</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map(i => (
                        <tr key={i.id} className="border-b border-white/5 hover:bg-white/2">
                          <td className="py-2 text-[#FFD600] font-bold">{i.id}</td>
                          <td className="py-2 truncate max-w-xs">{i.title}</td>
                          <td className="py-2">{i.category}</td>
                          <td className="py-2 text-rose-400">{i.severity}</td>
                          <td className="py-2">{i.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 2. Protected Assets Detail */}
              {detailModal === "assets" && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500">Live health monitor of critical national infrastructure databases (SQLite database telemetry).</p>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400">
                        <th className="py-2">Asset ID</th>
                        <th className="py-2">Name</th>
                        <th className="py-2">Sector</th>
                        <th className="py-2">Location</th>
                        <th className="py-2">Risk</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { id: "AST-001", name: "Capital Hill HRMS Portal", sector: "government", loc: "Lilongwe", risk: 65, status: "ONLINE" },
                        { id: "AST-002", name: "Standard Bank core mainframe", sector: "banking", loc: "Blantyre", risk: 30, status: "ONLINE" },
                        { id: "AST-003", name: "TNM Mpamba Gateway API", sector: "telecom", loc: "Mzuzu", risk: 55, status: "ONLINE" },
                        { id: "AST-004", name: "Zomba payroll directory server", sector: "government", loc: "Zomba", risk: 95, status: "DEGRADED" },
                        { id: "AST-005", name: "SCADA node water supply", sector: "utility", loc: "Lilongwe", risk: 40, status: "ONLINE" }
                      ].map(a => (
                        <tr key={a.id} className="border-b border-white/5 hover:bg-white/2">
                          <td className="py-2 text-[#FFD600] font-bold">{a.id}</td>
                          <td className="py-2">{a.name}</td>
                          <td className="py-2 uppercase text-[10px]">{a.sector}</td>
                          <td className="py-2 text-slate-400">{a.loc}</td>
                          <td className={`py-2 font-bold ${a.risk > 70 ? "text-red-400" : "text-green-400"}`}>{a.risk}%</td>
                          <td className={`py-2 font-bold ${a.status === "ONLINE" ? "text-emerald-400" : "text-orange-400 animate-pulse"}`}>{a.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 3. Avg Response Time Detail */}
              {detailModal === "sla" && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500">Incident resolution latency metrics compared against MACRA national response SLAs.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/3 border border-white/5 text-center">
                      <div className="text-slate-500 uppercase text-[9px]">Average Detection (MTTD)</div>
                      <div className="text-2xl font-bold text-emerald-400 font-bebas my-1">2.4 MINUTES</div>
                      <div className="text-[9px] text-slate-500">Target SLA: Under 5 minutes</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/3 border border-white/5 text-center">
                      <div className="text-slate-500 uppercase text-[9px]">Average Containment (MTTC)</div>
                      <div className="text-2xl font-bold text-yellow-400 font-bebas my-1">11.8 MINUTES</div>
                      <div className="text-[9px] text-slate-500">Target SLA: Under 20 minutes</div>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-[10px] text-center">
                    Response teams are meeting SLAs on 98.4% of reported campaigns in the current audit cycle.
                  </div>
                </div>
              )}

              {/* 4. Uptime Detail */}
              {detailModal === "uptime" && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500">National security data pipeline sync logs (Lilongwe Primary Node to regional collectors).</p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span>Standard Bank Blantyre Collector</span><span className="text-emerald-400 font-bold">CONNECTED (99.99%)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span>Capital Hill Lilongwe Collector</span><span className="text-emerald-400 font-bold">CONNECTED (99.98%)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span>TNM Mpamba Mzuzu Collector</span><span className="text-emerald-400 font-bold">CONNECTED (99.96%)</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Zomba local server node agent</span><span className="text-yellow-400 font-bold">SYNC LAG / DEGRADED (99.11%)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. Containment Rate Detail */}
              {detailModal === "containment" && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500">Containment ratios and action playbook metrics deployed in past 30 days.</p>
                  <div className="p-4 rounded-xl bg-white/3 border border-white/5 space-y-2 text-[10px]">
                    <div className="flex justify-between">
                      <span>Firewall automated IP blocks</span><span className="font-bold text-slate-200">114 rules active</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Compromised merchant account lockouts</span><span className="font-bold text-slate-200">42 wallets frozen</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Malicious URL filters registered with MACRA</span><span className="font-bold text-slate-200">6 domains suspended</span>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono font-bold transition"
              >
                CLOSE WINDOW
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
