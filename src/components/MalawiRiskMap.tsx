import React, { useState, useEffect, useMemo } from "react";
import { MapPin, AlertTriangle, Shield, TrendingUp, Info, RefreshCw, X, ShieldAlert, Cpu, Layers } from "lucide-react";
import { Incident } from "../types";
import DistrictMapModal, { DistrictModalData } from "./DistrictMapModal";

interface DistrictData {
  id: string;
  name: string;
  region: "Northern" | "Central" | "Southern";
  riskScore: number;
  activeIncidents: number;
  primaryThreat: string;
  population: string;
}

interface MalawiRiskMapProps {
  incidents?: Incident[];
}

// Risk color scale
const riskColor = (score: number) => {
  if (score >= 80) return { fill: "#ef4444", stroke: "#dc2626", label: "CRITICAL",  text: "text-red-400",    bg: "bg-red-500/10 border-red-500/25" };
  if (score >= 60) return { fill: "#f97316", stroke: "#ea580c", label: "HIGH",      text: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25" };
  if (score >= 40) return { fill: "#eab308", stroke: "#ca8a04", label: "ELEVATED",  text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25" };
  if (score >= 20) return { fill: "#3b82f6", stroke: "#2563eb", label: "FAIR",      text: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/25" };
  return             { fill: "#22c55e", stroke: "#16a34a", label: "GOOD",      text: "text-green-400",  bg: "bg-green-500/10 border-green-500/25" };
};

// Smooth, curved SVG paths for Malawi districts (viewBox: 0 0 240 660)
const DISTRICTS_CONFIG = [
  // NORTHERN REGION
  { id: "chitipa",    name: "Chitipa",    region: "Northern", svgPath: "M 80,20 C 90,16 110,24 125,20 C 130,35 138,45 145,55 C 130,58 110,60 95,60 C 85,50 82,35 80,20 Z" },
  { id: "karonga",    name: "Karonga",    region: "Northern", svgPath: "M 125,20 C 145,18 165,15 190,18 C 195,30 200,45 200,65 C 180,62 160,58 145,55 C 138,45 130,35 125,20 Z" },
  { id: "likoma",     name: "Likoma",     region: "Northern", svgPath: "M 215,80 C 217,78 220,80 220,83 C 219,86 216,88 213,86 C 212,84 213,82 215,80 Z" },
  { id: "rumphi",     name: "Rumphi",     region: "Northern", svgPath: "M 95,60 C 110,60 130,58 145,55 C 152,70 160,85 160,105 C 140,108 120,110 100,110 C 98,95 96,80 95,60 Z" },
  { id: "mzimba",     name: "Mzimba",     region: "Northern", svgPath: "M 100,110 C 120,110 140,108 160,105 C 165,125 170,145 170,170 C 145,172 120,174 95,175 C 96,155 98,130 100,110 Z" },
  { id: "nkhatabay",  name: "Nkhata Bay", region: "Northern", svgPath: "M 160,105 C 175,102 195,98 205,98 C 205,115 202,135 198,155 C 188,160 180,165 170,170 C 170,145 165,125 160,105 Z" },
  // CENTRAL REGION
  { id: "kasungu",    name: "Kasungu",    region: "Central",  svgPath: "M 95,175 C 120,174 145,172 170,170 C 170,195 168,220 168,240 C 140,242 110,244 85,245 C 88,220 92,195 95,175 Z" },
  { id: "nkhotakota", name: "Nkhotakota", region: "Central",  svgPath: "M 170,170 C 185,168 205,164 215,162 C 212,185 208,210 205,235 C 190,237 180,239 168,240 C 168,220 170,195 170,170 Z" },
  { id: "ntchisi",    name: "Ntchisi",    region: "Central",  svgPath: "M 120,240 C 135,240 150,239 168,240 C 168,252 165,265 165,275 C 150,277 135,278 120,278 C 120,265 120,252 120,240 Z" },
  { id: "dowa",       name: "Dowa",       region: "Central",  svgPath: "M 85,245 C 100,243 110,241 120,240 C 120,252 120,265 120,278 C 105,280 90,281 75,282 C 78,270 81,258 85,245 Z" },
  { id: "salima",     name: "Salima",     region: "Central",  svgPath: "M 168,240 C 180,239 190,237 205,235 C 202,250 200,265 200,278 C 185,278 175,277 165,275 C 165,265 168,252 168,240 Z" },
  { id: "lilongwe",   name: "Lilongwe",   region: "Central",  svgPath: "M 75,282 C 105,280 135,278 165,275 C 165,295 162,315 160,335 C 130,336 100,338 72,338 C 72,318 73,298 75,282 Z" },
  { id: "mchinji",    name: "Mchinji",    region: "Central",  svgPath: "M 30,282 C 48,282 62,282 75,282 C 73,298 72,318 72,338 C 58,338 42,338 28,338 C 28,318 29,298 30,282 Z" },
  { id: "dedza",      name: "Dedza",      region: "Central",  svgPath: "M 100,338 C 120,336 140,335 160,335 C 160,352 161,370 162,385 C 140,387 120,388 100,388 C 100,370 100,352 100,338 Z" },
  { id: "ntcheu",     name: "Ntcheu",     region: "Central",  svgPath: "M 72,338 C 85,338 92,338 100,338 C 100,352 100,370 100,388 C 88,389 75,390 65,390 C 65,372 68,355 72,338 Z" },
  // SOUTHERN REGION
  { id: "mangochi",   name: "Mangochi",   region: "Southern", svgPath: "M 160,335 C 180,332 200,328 215,325 C 212,348 208,372 205,435 C 190,437 172,438 160,438 C 161,370 160,352 160,335 Z" },
  { id: "machinga",   name: "Machinga",   region: "Southern", svgPath: "M 110,388 C 130,387 145,385 160,438 C 160,452 158,468 158,485 C 140,488 122,488 107,488 C 108,455 109,422 110,388 Z" },
  { id: "balaka",     name: "Balaka",     region: "Southern", svgPath: "M 65,390 C 80,389 95,388 110,388 C 109,422 108,455 107,488 C 92,489 80,490 70,488 C 68,455 66,422 65,390 Z" },
  { id: "zomba",      name: "Zomba",      region: "Southern", svgPath: "M 107,488 C 122,488 140,488 158,485 C 155,502 152,518 150,518 C 132,520 118,520 100,520 C 102,510 105,500 107,488 Z" },
  { id: "chiradzulu", name: "Chiradzulu", region: "Southern", svgPath: "M 75,488 C 88,488 95,488 100,520 C 90,522 80,522 75,522 C 73,510 74,500 75,488 Z" },
  { id: "blantyre",   name: "Blantyre",   region: "Southern", svgPath: "M 40,488 C 55,488 68,488 75,488 C 75,522 68,525 55,530 40,532 Z" },
  { id: "mwanza",     name: "Mwanza",     region: "Southern", svgPath: "M 25,530 C 35,530 45,530 55,530 C 53,542 52,552 53,560 C 42,562 32,562 25,562 C 24,550 24,540 25,530 Z" },
  { id: "thyolo",     name: "Thyolo",     region: "Southern", svgPath: "M 55,522 C 70,520 85,520 100,520 C 98,532 98,545 98,555 C 85,558 70,558 55,558 C 54,546 54,534 55,522 Z" },
  { id: "mulanje",    name: "Mulanje",    region: "Southern", svgPath: "M 100,520 C 118,518 135,516 150,518 C 148,532 148,546 148,558 C 132,560 115,560 100,560 C 100,546 100,532 100,520 Z" },
  { id: "phalombe",   name: "Phalombe",   region: "Southern", svgPath: "M 150,518 C 162,516 175,514 185,515 C 182,528 182,540 182,552 C 170,554 160,554 150,555 C 150,542 150,530 150,518 Z" },
  { id: "chikwawa",   name: "Chikwawa",   region: "Southern", svgPath: "M 22,560 C 38,558 54,558 70,558 C 68,572 68,586 68,600 C 52,602 36,602 22,602 C 22,588 22,575 22,560 Z" },
  { id: "nsanje",     name: "Nsanje",     region: "Southern", svgPath: "M 32,600 C 46,598 58,596 72,598 C 70,612 70,626 70,640 C 56,642 42,642 32,642 C 31,628 31,614 32,600 Z" },
  { id: "neno",       name: "Neno",       region: "Southern", svgPath: "M 22,555 C 32,553 44,553 55,553 C 53,565 53,575 53,580 C 42,582 32,582 22,582 C 21,572 21,562 22,555 Z" },
];

const REGION_COLORS: Record<string, string> = {
  Northern: "text-amber-400",
  Central:  "text-emerald-400",
  Southern: "text-yellow-400",
};

export default function MalawiRiskMap({ incidents = [] }: MalawiRiskMapProps) {
  const [selected, setSelected] = useState<DistrictData | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterRegion, setFilterRegion] = useState<string>("All");
  const [themeMode, setThemeMode] = useState<"cyber" | "geo">("cyber");
  const [detailModal, setDetailModal] = useState<"incidents" | "critical" | "stats" | "monitored" | null>(null);
  const [mapModal, setMapModal] = useState<DistrictModalData | null>(null);

  // Compute live district scores based on active incidents
  const computedDistricts = useMemo(() => {
    return DISTRICTS_CONFIG.map(d => {
      const activeCount = incidents.filter(i => {
        if (i.status === "Resolved" || i.status === "Contained") return false;
        const text = (i.title + " " + i.description + " " + i.reporterOrg).toLowerCase();
        
        // Exact match checking
        if (d.id === "lilongwe" && text.includes("lilongwe")) return true;
        if (d.id === "blantyre" && text.includes("blantyre")) return true;
        if (d.id === "zomba" && text.includes("zomba")) return true;
        if (d.id === "mzimba" && (text.includes("mzimba") || text.includes("mzuzu"))) return true;
        
        return text.includes(d.name.toLowerCase());
      }).length;

      // Base threat calculations mapping to region/importance
      const baseScore = d.id === "zomba" ? 65 : d.id === "lilongwe" ? 55 : d.id === "blantyre" ? 50 : d.id === "karonga" ? 28 : 12;
      const riskScore = Math.min(100, baseScore + activeCount * 22);

      // Determine threats from incident types
      const matched = incidents.filter(i => 
        (i.title + " " + i.description).toLowerCase().includes(d.name.toLowerCase()) && 
        i.status !== "Resolved"
      );
      const primaryThreat = matched.length > 0 ? matched[0].category : (riskScore > 50 ? "System Access Risk" : "None");

      return {
        ...d,
        region: d.region as "Northern" | "Central" | "Southern",
        riskScore,
        activeIncidents: activeCount,
        primaryThreat,
        population: d.id === "lilongwe" ? "1.2M" : d.id === "blantyre" ? "1.1M" : d.id === "mzimba" ? "610k" : "250k"
      };
    });
  }, [incidents]);

  const totalIncidents = useMemo(() => {
    return computedDistricts.reduce((s, d) => s + d.activeIncidents, 0);
  }, [computedDistricts]);

  const criticalDistricts = useMemo(() => {
    return computedDistricts.filter(d => d.riskScore >= 70);
  }, [computedDistricts]);

  const avgRisk = useMemo(() => {
    if (computedDistricts.length === 0) return 0;
    return Math.round(computedDistricts.reduce((s, d) => s + d.riskScore, 0) / computedDistricts.length);
  }, [computedDistricts]);

  const filtered = useMemo(() => {
    return filterRegion === "All" ? computedDistricts : computedDistricts.filter(d => d.region === filterRegion);
  }, [computedDistricts, filterRegion]);

  return (
    <div className="space-y-5" id="malawi-risk-map">

      {/* ─── Hero Banner ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-[#FFD600]/25 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#FFD600]" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">MALAWI NATIONAL CYBER RISK HEAT MAP</h2>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">28 Districts · Active System Activities Telemetry · MACRA / MACERT Node</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <button
              onClick={() => setThemeMode(prev => prev === "cyber" ? "geo" : "cyber")}
              className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold border border-[#FFD600]/30 bg-[#FFD600]/5 text-[#FFD600] hover:bg-[#FFD600]/10 transition flex items-center gap-1.5"
              title="Toggle Geography / Cyber view"
            >
              {themeMode === "cyber" ? <Layers className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
              {themeMode === "cyber" ? "🗺️ GEOGRAPHY THEME" : "🛰️ CYBER OVERLAY"}
            </button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            {["All", "Northern", "Central", "Southern"].map(r => (
              <button
                key={r}
                onClick={() => setFilterRegion(r)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition ${
                  filterRegion === r
                    ? "bg-[#FFD600] text-[#05080F] border-[#FFD600]"
                    : "text-slate-400 border-white/10 hover:border-white/20"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── KPI Strip (Clickable to show details) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            id: "incidents",
            label: "Active Incidents",
            val: totalIncidents,
            sub: "Click to view logs",
            icon: AlertTriangle,
            color: "text-orange-400 bg-orange-500/5 border-orange-500/15 hover:border-orange-500/40"
          },
          {
            id: "critical",
            label: "Critical Districts",
            val: criticalDistricts.length,
            sub: "Risk score >= 70%",
            icon: ShieldAlert,
            color: "text-red-400 bg-red-500/5 border-red-500/15 hover:border-red-500/40"
          },
          {
            id: "stats",
            label: "National Avg. Risk",
            val: `${avgRisk}/100`,
            sub: "Click to see details",
            icon: TrendingUp,
            color: "text-[#FFD600] bg-[#FFD600]/5 border-[#FFD600]/15 hover:border-[#FFD600]/40"
          },
          {
            id: "monitored",
            label: "Districts Monitored",
            val: "28 / 28",
            sub: "Systems Online",
            icon: Shield,
            color: "text-emerald-400 bg-emerald-500/5 border-emerald-500/15 hover:border-emerald-500/40"
          },
        ].map(({ id, label, val, sub, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setDetailModal(id as any)}
            className={`rounded-xl border p-4 flex items-center gap-3 text-left transition duration-200 cursor-pointer ${color}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-[9px] uppercase tracking-wider font-mono text-slate-500">{label}</div>
              <div className="text-xl font-bold font-mono text-slate-100">{val}</div>
              <div className="text-[8px] font-mono text-slate-600 uppercase mt-0.5">{sub}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ─── SVG MAP ─── */}
        <div className="xl:col-span-1 card p-5 flex flex-col items-center">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 w-full mb-4">
            <div className="w-1 h-4 bg-[#FFD600] rounded" />
            District Risk Heat Map
            <span className="ml-auto text-[8px] font-mono text-slate-500 uppercase">{themeMode.toUpperCase()} THEME ON</span>
          </h3>

          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap mb-4 text-[9px] font-mono">
            {[
              { label: "CRITICAL", color: "#ef4444" },
              { label: "HIGH",     color: "#f97316" },
              { label: "ELEVATED", color: "#eab308" },
              { label: "FAIR",     color: "#3b82f6" },
              { label: "GOOD",     color: "#22c55e" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="text-slate-500">{l.label}</span>
              </div>
            ))}
          </div>

          {/* SVG Map of Malawi */}
          <div className="relative w-full" style={{ maxWidth: 280 }}>
            <svg
              viewBox="0 0 240 660"
              className="w-full drop-shadow-2xl"
              style={{ filter: "drop-shadow(0 0 25px rgba(255,214,0,0.05))" }}
            >
              {/* Background */}
              <rect width="240" height="660" fill="transparent" />

              {/* Lakes */}
              {/* Lake Malawi (Lake Nyasa) */}
              <path 
                d="M 175,95 C 185,90 195,85 208,85 C 215,90 220,120 222,150 C 224,180 222,210 218,240 C 214,270 210,300 205,330 C 200,350 194,370 192,390 C 188,410 182,425 180,425 C 178,415 182,400 185,385 C 188,370 194,340 196,310 C 198,280 200,240 198,200 C 196,160 192,130 178,110 Z" 
                fill={themeMode === "cyber" ? "rgba(37, 99, 235, 0.15)" : "#93c5fd"} 
                stroke={themeMode === "cyber" ? "rgba(37, 99, 235, 0.4)" : "#2563eb"} 
                strokeWidth="0.8" 
              />
              <text x="198" y="200" fill={themeMode === "cyber" ? "rgba(37, 99, 235, 0.4)" : "#1e40af"} fontSize="6" fontFamily="monospace" fontWeight="bold" transform="rotate(78,198,200)">Lake Malawi</text>
              <text x="206" y="250" fill={themeMode === "cyber" ? "rgba(37, 99, 235, 0.3)" : "#1e40af"} fontSize="5" fontFamily="monospace" fontWeight="bold" transform="rotate(78,206,250)">Lake Nyasa</text>

              {/* Lake Chilwa */}
              <path 
                d="M 215,480 C 222,482 225,488 225,495 C 222,502 215,502 210,498 C 208,495 210,488 215,480 Z" 
                fill={themeMode === "cyber" ? "rgba(37, 99, 235, 0.15)" : "#93c5fd"} 
                stroke={themeMode === "cyber" ? "rgba(37, 99, 235, 0.4)" : "#2563eb"} 
                strokeWidth="0.5" 
              />
              
              {/* Lake Chiuta */}
              <path 
                d="M 220,445 C 224,446 226,450 224,455 C 222,460 218,460 217,455 C 217,450 218,446 220,445 Z" 
                fill={themeMode === "cyber" ? "rgba(37, 99, 235, 0.15)" : "#93c5fd"} 
                stroke={themeMode === "cyber" ? "rgba(37, 99, 235, 0.4)" : "#2563eb"} 
                strokeWidth="0.5" 
              />

              {/* Lake Malombe */}
              <path 
                d="M 180,412 C 184,414 186,418 184,422 C 182,425 178,425 177,422 C 176,418 178,414 180,412 Z" 
                fill={themeMode === "cyber" ? "rgba(37, 99, 235, 0.15)" : "#93c5fd"} 
                stroke={themeMode === "cyber" ? "rgba(37, 99, 235, 0.4)" : "#2563eb"} 
                strokeWidth="0.5" 
              />

              {/* Inset Separators (Region lines) */}
              <line x1="20" y1="180" x2="200" y2="175" stroke="#ffffff" strokeWidth="0.3" strokeOpacity="0.15" strokeDasharray="4,4" />
              <line x1="20" y1="390" x2="200" y2="385" stroke="#ffffff" strokeWidth="0.3" strokeOpacity="0.15" strokeDasharray="4,4" />

              {/* Region Labels */}
              <text x="12" y="105" fill="#60a5fa" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.6">NORTHERN</text>
              <text x="12" y="295" fill="#fbbf24" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.6">CENTRAL</text>
              <text x="12" y="510" fill="#fb923c" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.6">SOUTHERN</text>

              {/* District polygons */}
              {computedDistricts.map(d => {
                const rc = riskColor(d.riskScore);
                const isHovered = hoveredId === d.id;
                const isSelected = selected?.id === d.id;
                
                // Color assignments based on Toggle Theme Mode
                const fillVal = themeMode === "geo"
                  ? (d.region === "Northern" ? "#ffedd5" : d.region === "Central" ? "#dcfce7" : "#fef9c3")
                  : rc.fill;
                const strokeVal = themeMode === "geo"
                  ? (isSelected ? "#FFD600" : "#475569")
                  : (isSelected ? "#FFD600" : isHovered ? "#ffffff" : rc.stroke);
                const strokeWidthVal = isSelected ? 1.5 : isHovered ? 1.0 : 0.5;
                const fillOpacityVal = themeMode === "geo"
                  ? (isSelected ? 1.0 : isHovered ? 0.95 : 0.85)
                  : (isSelected ? 0.95 : isHovered ? 0.85 : 0.65);

                return (
                  <g key={d.id}>
                    <path
                      d={d.svgPath}
                      fill={fillVal}
                      fillOpacity={fillOpacityVal}
                      stroke={strokeVal}
                      strokeWidth={strokeWidthVal}
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredId(d.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => {
                        setSelected(selected?.id === d.id ? null : d);
                        setMapModal({
                          id: d.id,
                          name: d.name,
                          region: d.region,
                          riskScore: d.riskScore,
                          activeIncidents: d.activeIncidents,
                          primaryThreat: d.primaryThreat,
                          population: d.population,
                        });
                      }}
                    />
                    
                    {/* Active Incident Pulsing indicator */}
                    {d.activeIncidents > 0 && (
                      <circle
                        cx={(() => {
                          const m = d.svgPath.match(/M (\d+),(\d+)/);
                          return m ? (parseInt(m[1]) + 20) : 100;
                        })()}
                        cy={(() => {
                          const m = d.svgPath.match(/M \d+,(\d+)/);
                          return m ? (parseInt(m[1]) + 15) : 200;
                        })()}
                        r="4"
                        fill="#ef4444"
                        fillOpacity="0.95"
                        stroke="#05080F"
                        strokeWidth="0.5"
                        className="pointer-events-none animate-pulse"
                      />
                    )}
                  </g>
                );
              })}

              {/* Major Cities / Capital Highlight Indicators */}
              {/* Lilongwe Capital: Yellow circle + Plane and Star Marker */}
              <circle cx="118" cy="306" r="6" fill="#FFD600" fillOpacity="0.3" stroke="#FFD600" strokeWidth="0.5" className="animate-ping pointer-events-none" />
              <circle cx="118" cy="306" r="2.5" fill="#FFD600" stroke="#000000" strokeWidth="0.4" className="pointer-events-none" />
              <text x="123" y="308" fill="#FFFFFF" fontSize="4.5" fontFamily="monospace" fontWeight="bold" className="pointer-events-none drop-shadow">Lilongwe ✪</text>

              {/* Blantyre City: Red dot */}
              <circle cx="58" cy="510" r="1.5" fill="#ef4444" stroke="#ffffff" strokeWidth="0.3" className="pointer-events-none" />
              <text x="62" y="512" fill="#FFFFFF" fontSize="4.5" fontFamily="monospace" fontWeight="bold" className="pointer-events-none drop-shadow">Blantyre ●</text>

              {/* Mzuzu City: Red dot */}
              <circle cx="130" cy="138" r="1.5" fill="#ef4444" stroke="#ffffff" strokeWidth="0.3" className="pointer-events-none" />
              <text x="134" y="140" fill="#FFFFFF" fontSize="4.5" fontFamily="monospace" fontWeight="bold" className="pointer-events-none drop-shadow">Mzuzu ●</text>

              {/* Inset Malawi Country Outline border */}
              <path
                d="M 80,18 L 200,16 L 215,90 L 225,200 L 220,320 L 215,380 L 220,440 L 190,520 L 160,555 L 185,580 L 170,645 L 30,645 L 18,580 L 25,530 L 15,455 L 30,395 L 25,295 L 30,200 L 60,175 L 70,100 L 80,18 Z"
                fill="none"
                stroke="#FFD600"
                strokeWidth="0.8"
                strokeOpacity="0.2"
                strokeDasharray="6,3"
              />

              {/* Malawi Flag SVG */}
              <g transform="translate(175, 18)">
                <rect width="45" height="28" fill="#000000" />
                <rect y="9.3" width="45" height="9.3" fill="#d01c1f" />
                <rect y="18.6" width="45" height="9.4" fill="#1f7d45" />
                {/* Sun */}
                <path d="M 18.5,9.3 A 4,4 0 0 1 26.5,9.3 Z" fill="#d01c1f" />
                {/* 31 Sun Rays */}
                {Array.from({ length: 31 }).map((_, idx) => {
                  const angle = (idx * 180) / 30;
                  const rad = (angle * Math.PI) / 185;
                  const x1 = 22.5 - Math.cos(rad) * 4;
                  const y1 = 9.3 - Math.sin(rad) * 4;
                  const x2 = 22.5 - Math.cos(rad) * 6;
                  const y2 = 9.3 - Math.sin(rad) * 6;
                  return <line key={idx} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d01c1f" strokeWidth="0.4" />;
                })}
                <text x="22.5" y="34" textAnchor="middle" fill="#94a3b8" fontSize="4.5" fontFamily="monospace" fontWeight="bold">MALAWI</text>
              </g>

              {/* Inset Africa Map (bottom-left) */}
              <g transform="translate(10, 520)">
                <rect width="65" height="65" fill="#05080f" fillOpacity="0.8" stroke="#3b82f6" strokeWidth="0.5" rx="3" />
                {/* Silhouette of Africa */}
                <path 
                  d="M 25,5 C 30,2 35,2 40,4 C 45,7 50,10 52,17 C 55,22 50,27 48,32 C 45,37 42,42 42,47 C 40,52 35,54 32,52 C 30,50 30,42 28,37 C 26,32 22,30 18,27 C 16,24 18,20 20,17 C 22,14 22,10 25,5 Z" 
                  fill="#1e293b" 
                  stroke="#334155" 
                  strokeWidth="0.3" 
                  transform="translate(4,4)"
                />
                {/* Glowing Highlight on Malawi location */}
                <circle cx="47" cy="38" r="1.2" fill="#ef4444" className="animate-pulse" />
                <line x1="47" y1="38" x2="35" y2="48" stroke="#ef4444" strokeWidth="0.3" strokeDasharray="1,1" />
                <rect x="12" y="46" width="36" height="7" rx="1" fill="#0f172a" stroke="#ef4444" strokeWidth="0.3" />
                <text x="30" y="51" textAnchor="middle" fill="#ef4444" fontSize="4.5" fontFamily="monospace" fontWeight="bold">MALAWI</text>
              </g>
            </svg>

            {/* Hover tooltip */}
            {hoveredId && (() => {
              const d = computedDistricts.find(x => x.id === hoveredId);
              if (!d) return null;
              const rc = riskColor(d.riskScore);
              return (
                <div className="absolute top-2 right-2 bg-[#05080F]/95 border border-white/15 rounded-lg px-3 py-2 space-y-1 pointer-events-none z-10 min-w-[120px]">
                  <div className="text-xs font-bold text-white">{d.name}</div>
                  <div className={`text-[9px] font-mono font-bold ${rc.text}`}>{rc.label} — {d.riskScore}/100</div>
                  {d.activeIncidents > 0 && <div className="text-[9px] text-orange-400">{d.activeIncidents} active incident{d.activeIncidents > 1 ? "s" : ""}</div>}
                </div>
              );
            })()}
          </div>

          <p className="text-[9px] text-slate-600 font-mono text-center mt-3">Click a district to see details</p>
        </div>

        {/* ─── District Detail + Rankings ─── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Selected District Panel */}
          {selected ? (
            <div className={`card p-5 border space-y-4 ${riskColor(selected.riskScore).bg}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl border ${riskColor(selected.riskScore).bg} shrink-0`}>
                  <MapPin className={`w-5 h-5 ${riskColor(selected.riskScore).text}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-bebas text-xl text-white tracking-wider">{selected.name} District</h3>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${riskColor(selected.riskScore).bg} ${riskColor(selected.riskScore).text}`}>
                      {riskColor(selected.riskScore).label}
                    </span>
                    <span className={`text-[9px] font-mono ${REGION_COLORS[selected.region]}`}>{selected.region} Region</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Pop. {selected.population} · Primary threat: <span className="text-slate-300">{selected.primaryThreat}</span></p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-600 hover:text-slate-400 transition text-xs">✕ Close</button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Risk Score", val: `${selected.riskScore}/100`, color: riskColor(selected.riskScore).text },
                  { label: "Active Incidents", val: selected.activeIncidents, color: selected.activeIncidents > 0 ? "text-orange-400" : "text-slate-400" },
                  { label: "Risk Level", val: riskColor(selected.riskScore).label, color: riskColor(selected.riskScore).text },
                ].map(item => (
                  <div key={item.label} className="bg-[#05080F]/60 rounded-xl p-3 text-center border border-white/5">
                    <div className={`text-xl font-bebas ${item.color}`}>{item.val}</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Risk bar breakdown */}
              <div>
                <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                  <span>Risk Score Distribution</span>
                  <span>{selected.riskScore}/100</span>
                </div>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${selected.riskScore}%`, backgroundColor: riskColor(selected.riskScore).fill }}
                  />
                </div>
              </div>

              {/* Click to see full details of this district's active incidents */}
              {selected.activeIncidents > 0 && (
                <button
                  onClick={() => setDetailModal("incidents")}
                  className="w-full py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-mono font-bold rounded-lg transition"
                >
                  🔍 VIEW DISTRICT INCIDENTS
                </button>
              )}
            </div>
          ) : (
            <div className="card p-5 border border-dashed border-white/10 text-center text-slate-600 text-xs">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Click any district on the map to view its threat detail
            </div>
          )}

          {/* Top 10 Highest Risk Districts */}
          <div className="card p-5 space-y-3">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-1 h-4 bg-red-400 rounded" />
              District Risk Rankings
              <span className="ml-auto text-[9px] font-mono text-slate-500">Sorted by risk score</span>
            </h3>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {filtered
                .slice()
                .sort((a, b) => b.riskScore - a.riskScore)
                .map((d, i) => {
                  const rc = riskColor(d.riskScore);
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelected(d)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left ${
                        selected?.id === d.id ? "border-[#FFD600]/40 bg-[#FFD600]/5" : "border-white/5 hover:border-white/10 bg-[#05080F]/40"
                      }`}
                    >
                      <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white">{d.name}</div>
                        <div className={`text-[9px] font-mono ${REGION_COLORS[d.region]}`}>{d.region} · {d.primaryThreat}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.activeIncidents > 0 && (
                          <span className="text-[8px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                            {d.activeIncidents} INC
                          </span>
                        )}
                        <div className="text-right">
                          <div className={`text-sm font-bold font-mono ${rc.text}`}>{d.riskScore}</div>
                          <div className="h-1 w-16 bg-white/5 rounded-full overflow-hidden mt-0.5">
                            <div className="h-full rounded-full" style={{ width: `${d.riskScore}%`, backgroundColor: rc.fill }} />
                          </div>
                        </div>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono w-16 text-center ${rc.bg} ${rc.text}`}>{rc.label}</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Less Detailed Components Detail Modal Overlay ─── */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-[#080c17] border border-[#FFD600]/45 rounded-2xl p-6 space-y-5 shadow-2xl">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
                  <Info className="w-4 h-4 text-[#FFD600]" />
                </div>
                <div>
                  <h3 className="font-bebas text-lg text-white tracking-widest uppercase">
                    {detailModal === "incidents" && "Active National Incident Log"}
                    {detailModal === "critical" && "Critical Threat Sectors & Districts"}
                    {detailModal === "stats" && "National Risk Metric Calculation Breakdown"}
                    {detailModal === "monitored" && "Telemetry Node Sensor Networks Status"}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono">MACRA CERT · SECURE SYSTEM AUDIT TELEMETRY</p>
                </div>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Contents */}
            <div className="space-y-4">
              
              {/* 1. Active Incidents Modal */}
              {detailModal === "incidents" && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 font-mono">
                    Showing all non-remediated events currently flagged inside the SQLite local telemetry engine.
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="py-2">ID</th>
                          <th className="py-2">Title</th>
                          <th className="py-2">Category</th>
                          <th className="py-2">Severity</th>
                          <th className="py-2">Reporter</th>
                          <th className="py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.filter(i => !["Resolved", "Contained", "Closed"].includes(i.status)).map(i => (
                          <tr key={i.id} className="border-b border-white/5 text-slate-300 hover:bg-white/2">
                            <td className="py-2.5 pr-2 font-bold text-[#FFD600]">{i.id}</td>
                            <td className="py-2.5 pr-2 max-w-xs truncate" title={i.title}>{i.title}</td>
                            <td className="py-2.5 pr-2">{i.category}</td>
                            <td className="py-2.5 pr-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                i.severity === "Critical" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                i.severity === "High" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                                "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                              }`}>{i.severity}</span>
                            </td>
                            <td className="py-2.5 pr-2 text-slate-400">{i.reporterOrg}</td>
                            <td className="py-2.5 text-slate-500">{new Date(i.incidentDate).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {incidents.filter(i => !["Resolved", "Contained", "Closed"].includes(i.status)).length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-500 italic">No active threat incidents registered.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Critical Districts Modal */}
              {detailModal === "critical" && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 font-mono">
                    Districts identified with active security indicators exceeding the threshold limit.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {criticalDistricts.map(d => {
                      const rc = riskColor(d.riskScore);
                      return (
                        <div key={d.id} className={`p-4 rounded-xl border ${rc.bg} flex justify-between items-center`}>
                          <div>
                            <div className="text-sm font-bold text-white">{d.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{d.region} Region · Primary: {d.primaryThreat}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-xl font-bebas ${rc.text}`}>{d.riskScore}%</div>
                            <span className="text-[9px] text-red-400 block font-mono">{d.activeIncidents} Active Incidents</span>
                          </div>
                        </div>
                      );
                    })}
                    {criticalDistricts.length === 0 && (
                      <div className="col-span-2 py-6 text-center text-slate-500 italic font-mono">All districts currently reporting normal threshold ranges.</div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. National Avg Risk Calculation Modal */}
              {detailModal === "stats" && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400 font-mono leading-relaxed">
                    The National Cyber Risk Average is computed dynamically based on the risk scores of all 28 districts in Malawi. Individual district scores evaluate base sector risk factors combined with active incident telemetry.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                    {[
                      { 
                        region: "Northern Region", 
                        avg: Math.round(computedDistricts.filter(d => d.region === "Northern").reduce((s,d)=>s+d.riskScore,0) / (computedDistricts.filter(d => d.region === "Northern").length || 1)),
                        critical: computedDistricts.filter(d => d.region === "Northern" && d.riskScore >= 70).length,
                        active: computedDistricts.filter(d => d.region === "Northern").reduce((s,d)=>s+d.activeIncidents,0)
                      },
                      { 
                        region: "Central Region", 
                        avg: Math.round(computedDistricts.filter(d => d.region === "Central").reduce((s,d)=>s+d.riskScore,0) / (computedDistricts.filter(d => d.region === "Central").length || 1)),
                        critical: computedDistricts.filter(d => d.region === "Central" && d.riskScore >= 70).length,
                        active: computedDistricts.filter(d => d.region === "Central").reduce((s,d)=>s+d.activeIncidents,0)
                      },
                      { 
                        region: "Southern Region", 
                        avg: Math.round(computedDistricts.filter(d => d.region === "Southern").reduce((s,d)=>s+d.riskScore,0) / (computedDistricts.filter(d => d.region === "Southern").length || 1)),
                        critical: computedDistricts.filter(d => d.region === "Southern" && d.riskScore >= 70).length,
                        active: computedDistricts.filter(d => d.region === "Southern").reduce((s,d)=>s+d.activeIncidents,0)
                      },
                    ].map(r => (
                      <div key={r.region} className="p-4 rounded-xl bg-white/3 border border-white/5 text-center">
                        <div className="text-sm font-bold text-slate-200">{r.region}</div>
                        <div className="text-3xl font-bebas text-[#FFD600] my-2">{r.avg}%</div>
                        <div className="text-[10px] text-slate-500 space-y-0.5">
                          <div>Critical Nodes: {r.critical}</div>
                          <div>Active Incidents: {r.active}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-[10px] font-mono text-center">
                    Formula: (Σ District_Risk_Scores) / Total_Districts_Monitored (28) = National Cyber Risk Average
                  </div>
                </div>
              )}

              {/* 4. Districts Monitored Modal */}
              {detailModal === "monitored" && (
                <div className="space-y-3 font-mono">
                  <div className="text-xs text-slate-400">
                    Status of telemetry acquisition sensors connected to the LitSecure Sentinel EOC node in Lilongwe.
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {computedDistricts.map(d => {
                      const sensorHealth = d.riskScore > 80 ? "STANDBY" : d.riskScore > 50 ? "MAINTENANCE" : "ONLINE";
                      const textCol = sensorHealth === "ONLINE" ? "text-emerald-400" : sensorHealth === "MAINTENANCE" ? "text-yellow-400" : "text-orange-400";
                      return (
                        <div key={d.id} className="p-2.5 rounded bg-white/3 border border-white/5 flex flex-col justify-between">
                          <div className="text-xs font-bold text-slate-200 truncate">{d.name}</div>
                          <div className="flex items-center justify-between mt-1.5 text-[9px]">
                            <span className="text-slate-500">Node #{d.id.substring(0,3).toUpperCase()}</span>
                            <span className={`font-bold ${textCol}`}>{sensorHealth}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-mono font-bold transition"
              >
                CLOSE WINDOW
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── District Location Modal ── */}
      {mapModal && (
        <DistrictMapModal
          district={mapModal}
          onClose={() => setMapModal(null)}
        />
      )}

    </div>
  );
}
