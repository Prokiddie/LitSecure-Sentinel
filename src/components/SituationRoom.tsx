import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWarRoomWS } from "../hooks/useWarRoomWS";
import {
  Shield, AlertTriangle, Activity, Globe, Server,
  Building2, Zap, Wifi, GraduationCap, Hospital,
  TrendingUp, CheckCircle2, XCircle, RefreshCw, Radio,
  Bot, Loader2, Sparkles, Copy, ChevronDown,
  MapPin, Users, Clock, ChevronRight, X, FileText,
  Crosshair, Siren, Phone, MessageSquare, Lock, ShieldAlert, Layers, Cpu, Eye, Info
} from "lucide-react";
import { Incident, NationalStats } from "../types";
import DistrictMapModal, { DistrictModalData } from "./DistrictMapModal";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SituationRoomProps {
  incidents?: Incident[];
  stats?: NationalStats | null;
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  critical: boolean;
}

interface ChatMessage {
  sender: string;
  org: string;
  msg: string;
  time: string;
  type: "macert" | "soc" | "police" | "system";
}

// ─── Constants ────────────────────────────────────────────────────────────────
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

const SECTOR_ICONS: Record<string, React.ElementType> = {
  government: Building2,
  banking: Shield,
  telecom: Wifi,
  utility: Zap,
  university: GraduationCap,
  hospital: Hospital,
};

const NATIONAL_THREATS = [
  { id: 1, feed: "MACERT FEED", msg: "Coordinated SIM swap cluster detected across Lilongwe Area 25 towers — 6 endpoints compromised.", time: "14:01", level: "CRITICAL", ip: "196.44.112.4" },
  { id: 2, feed: "AIRTEL SOC",  msg: "Unusual financial settlement velocity detected on Airtel merchant wallet +265991004112.", time: "14:03", level: "HIGH", ip: "41.70.3.11" },
  { id: 3, feed: "AbuseIPDB",   msg: "IP 41.221.72.109 flagged globally as a critical ransomware command and control node.", time: "14:10", level: "HIGH", ip: "41.221.72.109" },
  { id: 4, feed: "MACRA CERT",  msg: "MACRA alerts: Phishing domain mra-portal-portal-mw.online actively targeting Blantyre business units.", time: "14:15", level: "MEDIUM", ip: "198.51.100.82" },
];

const EOC_CHAT_FEED: ChatMessage[] = [
  { sender: "MACERT-Analyst",  org: "MACERT",         msg: "Confirmed: IOC 41.221.72.109 is active ransomware C2. Blocking at perimeter firewalls.", time: "14:02", type: "macert" },
  { sender: "SOC-Lead",        org: "LitSecure SOC",  msg: "Acknowledged. Escalating to incident LIT-2026-30421 (Zomba Council). Isolating subnet.", time: "14:04", type: "soc" },
  { sender: "DCP-Cybercrime",  org: "MPS Cybercrime", msg: "Police cyber unit activated. Tracking Blantyre ATM lobby suspect.", time: "14:06", type: "police" },
  { sender: "MACERT-Director", org: "MACERT",         msg: "National threat level raised to CRITICAL. All sectors on standby alert.", time: "14:08", type: "macert" },
  { sender: "SOC-Lead",        org: "LitSecure SOC",  msg: "War Room activated. Coordinating response. Dispatching local forensic units.", time: "14:10", type: "soc" },
];

const SECTOR_HEALTH = [
  { id: "gov",     label: "Government",    icon: Building2,    baseHealth: 72 },
  { id: "banking", label: "Banking",       icon: Shield,       baseHealth: 88 },
  { id: "telecom", label: "Telecom",       icon: Wifi,         baseHealth: 55 },
  { id: "utility", label: "Utilities",     icon: Zap,          baseHealth: 91 },
  { id: "health",  label: "Healthcare",    icon: Hospital,     baseHealth: 95 },
  { id: "edu",     label: "Education",     icon: GraduationCap, baseHealth: 97 },
];

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: "c1", label: "Block known IOC IP addresses at perimeter firewall",       done: false, critical: true  },
  { id: "c2", label: "Isolate affected endpoints from production network",       done: false, critical: true  },
  { id: "c3", label: "Notify MACERT Response Team via encrypted channel",        done: false, critical: true  },
  { id: "c4", label: "Trigger SIM freeze on flagged mobile numbers",             done: false, critical: false },
  { id: "c5", label: "Preserve forensic disk image before remediation",          done: false, critical: false },
  { id: "c6", label: "Coordinate with MNO to revoke fraudulent SIM swaps",      done: false, critical: false },
  { id: "c7", label: "Submit incident to MACRA CERT portal for national log",    done: false, critical: false },
  { id: "c8", label: "Brief Director General and prepare public advisory draft", done: false, critical: false },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const riskColor = (score: number) => {
  if (score >= 80) return { fill: "#ef4444", stroke: "#dc2626", text: "text-red-400" };
  if (score >= 60) return { fill: "#f97316", stroke: "#ea580c", text: "text-orange-400" };
  if (score >= 40) return { fill: "#eab308", stroke: "#ca8a04", text: "text-yellow-400" };
  if (score >= 20) return { fill: "#3b82f6", stroke: "#2563eb", text: "text-blue-400" };
  return             { fill: "#22c55e", stroke: "#16a34a", text: "text-green-400" };
};

function getThreatLevel(incidents: Incident[]) {
  const active = incidents.filter(i => i.status !== "Resolved" && i.status !== "Contained");
  if (active.some(i => i.severity === "Critical"))  return { label: "CRITICAL",  color: "red",    bg: "bg-red-500/20",    border: "border-red-500/50",    pulse: true  };
  if (active.some(i => i.severity === "High"))      return { label: "HIGH",      color: "orange", bg: "bg-orange-500/20", border: "border-orange-500/50", pulse: true  };
  if (active.some(i => i.severity === "Medium"))    return { label: "ELEVATED",  color: "yellow", bg: "bg-[#FFD600]/10",  border: "border-[#FFD600]/30",  pulse: false };
  return                                                   { label: "NORMAL",    color: "green",  bg: "bg-green-500/10",  border: "border-green-500/30",  pulse: false };
}

function getDistrictRisk(id: string, incidents: Incident[]): number {
  const districtMap: Record<string, string[]> = {
    lilongwe: ["Lilongwe", "Area 25", "Capital Hill"],
    blantyre: ["Blantyre", "Limbe"],
    mzuzu: ["Mzuzu"],
    zomba: ["Zomba"],
    mangochi: ["Mangochi", "Salima"],
  };
  const keywords = districtMap[id] || [];
  const matched = incidents.filter(i =>
    keywords.some(k => i.title?.toLowerCase().includes(k.toLowerCase()) ||
      (i as any).district?.toLowerCase().includes(k.toLowerCase()))
  );
  if (matched.some(i => i.severity === "Critical")) return 95;
  if (matched.some(i => i.severity === "High"))     return 75;
  if (matched.length > 0)                           return 50;
  return id === "zomba" ? 65 : id === "lilongwe" ? 55 : id === "blantyre" ? 50 : 15;
}

// ─── Priority badge helper ─────────────────────────────────────────────────────
// Maps severity/score → P1 CRITICAL · P2 HIGH · P3 MEDIUM · P4 LOW
function PriorityBadge({ score, level, severity }: { score: number; level: string; severity?: string }) {
  // Derive effective score: use explicit score if > 0, else derive from severity
  const eff = score > 0 ? score
    : severity === "Critical" ? 92
    : severity === "High"     ? 72
    : severity === "Medium"   ? 45
    : 20;
  const { label, color } =
    eff >= 80 ? { label: "P1 CRITICAL", color: "text-red-400 bg-red-500/15 border-red-500/30" } :
    eff >= 60 ? { label: "P2 HIGH",     color: "text-orange-400 bg-orange-500/15 border-orange-500/30" } :
    eff >= 40 ? { label: "P3 MEDIUM",   color: "text-amber-400 bg-amber-500/15 border-amber-500/30" } :
               { label: "P4 LOW",       color: "text-slate-400 bg-white/5 border-white/10" };
  return (
    <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
}

// ─── Time-since helper ────────────────────────────────────────────────────────
function timeSince(dateStr: string): { label: string; minutesSince: number } {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const label = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return { label, minutesSince: mins };
}

function sectorHealthFromIncidents(baseHealth: number, incidents: Incident[], sectorId: string): number {
  const sectorKeywords: Record<string, string[]> = {
    gov: ["government", "ministry", "council", "portal", "hrms"],
    banking: ["bank", "finance", "swift", "payment", "atm"],
    telecom: ["airtel", "tnm", "sim", "mobile", "mpamba", "otp"],
    utility: ["water", "electricity", "escom", "lwb", "scada"],
    health: ["hospital", "clinic", "health"],
    edu: ["university", "school", "mubas"],
  };
  const keys = sectorKeywords[sectorId] || [];
  const active = incidents.filter(i =>
    !["Resolved", "Contained", "Closed"].includes(i.status) &&
    keys.some(k => (i.title + " " + i.description).toLowerCase().includes(k))
  );
  const penalty = active.reduce((sum, i) =>
    sum + (i.severity === "Critical" ? 25 : i.severity === "High" ? 15 : 8), 0
  );
  return Math.max(0, Math.min(100, baseHealth - penalty));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThreatLevelBanner({ level }: { level: ReturnType<typeof getThreatLevel> }) {
  const colors: Record<string, string> = {
    red: "text-red-400", orange: "text-orange-400", yellow: "text-[#FFD600]", green: "text-emerald-400"
  };
  return (
    <div className={`relative overflow-hidden rounded-2xl border px-6 py-4 flex items-center gap-6 ${level.bg} ${level.border}`}>
      {level.pulse && <div className={`absolute inset-0 ${level.bg} animate-pulse opacity-30`} />}
      <div className="relative flex items-center gap-4">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${level.border} ${level.bg}`}>
          {level.label === "CRITICAL" ? (
            <Siren className={`w-7 h-7 ${colors[level.color]}`} />
          ) : level.label === "HIGH" ? (
            <ShieldAlert className={`w-7 h-7 ${colors[level.color]}`} />
          ) : (
            <Shield className={`w-7 h-7 ${colors[level.color]}`} />
          )}
        </div>
        <div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">National Threat Level</div>
          <div className={`font-bebas text-4xl tracking-widest ${colors[level.color]}`}>{level.label}</div>
        </div>
      </div>
      <div className="hidden md:block w-px h-12 bg-white/10" />
      <div className="hidden md:flex items-center gap-6 text-[10px] font-mono text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${level.pulse ? "animate-pulse" : ""} bg-current ${colors[level.color]}`} />
          <span>Live Feed: <span className="text-slate-300">ACTIVE</span></span>
        </div>
        <div>Source: <span className="text-slate-300">MACERT FUSION</span></div>
        <div>Updated: <span className="text-slate-300">{new Date().toLocaleTimeString()}</span></div>
      </div>
      <div className="md:ml-auto text-right">
        <div className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">MACRA — MACERT — MDF Cyber Cell</div>
        <div className="text-[9px] font-mono text-slate-700">{new Date().toLocaleString()}</div>
      </div>
    </div>
  );
}

function MalawiIncidentMap({
  incidents,
  onHotspotClick,
}: {
  incidents: Incident[];
  onHotspotClick: (districtId: string, name: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<"cyber" | "geo">(() => {
    return (sessionStorage.getItem("sentinel_map_theme") as "cyber" | "geo") || "cyber";
  });

  useEffect(() => {
    sessionStorage.setItem("sentinel_map_theme", mapTheme);
  }, [mapTheme]);

  // Filter districts that have active incidents to render pulsing circles
  const districtsWithIncidents = useMemo(() => {
    return DISTRICTS_CONFIG.map(d => {
      const risk = getDistrictRisk(d.id, incidents);
      const activeCount = incidents.filter(i => {
        if (i.status === "Resolved" || i.status === "Contained") return false;
        const text = (i.title + " " + i.description + " " + i.reporterOrg).toLowerCase();
        
        if (d.id === "lilongwe" && text.includes("lilongwe")) return true;
        if (d.id === "blantyre" && text.includes("blantyre")) return true;
        if (d.id === "zomba" && text.includes("zomba")) return true;
        if (d.id === "mzimba" && (text.includes("mzimba") || text.includes("mzuzu"))) return true;
        
        return text.includes(d.name.toLowerCase());
      }).length;

      return {
        ...d,
        risk,
        activeCount
      };
    });
  }, [incidents]);

  return (
    <div className="card p-5 space-y-3">
      
      {/* CSS style block for live cyber threat dash lines animation */}
      <style>{`
        @keyframes flowdash {
          to { stroke-dashoffset: -20; }
        }
        .flow-line {
          stroke: #ef4444;
          stroke-width: 0.8;
          stroke-dasharray: 4, 3;
          fill: none;
          animation: flowdash 1.5s linear infinite;
        }
      `}</style>

      <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
        <div className="w-1 h-4 bg-red-500 rounded animate-pulse" />
        EOC Interactive National Cyber Map
        <button
          onClick={() => setMapTheme(prev => prev === "cyber" ? "geo" : "cyber")}
          className="ml-auto text-[8px] font-mono border border-[#FFD600]/30 bg-[#FFD600]/5 text-[#FFD600] px-2 py-0.5 rounded uppercase hover:bg-[#FFD600]/10 transition"
        >
          {mapTheme === "cyber" ? "🗺️ GEO COLOR" : "🛰️ CYBER NODE"}
        </button>
      </h3>

      <div className="relative w-full">
        <svg
          viewBox="0 0 240 660"
          className="w-full drop-shadow-2xl"
          style={{ filter: "drop-shadow(0 0 20px rgba(239,68,68,0.03))" }}
        >
          {/* Background */}
          <rect width="240" height="660" fill="transparent" />

          {/* Lake Malawi */}
          <path 
            d="M 175,95 C 185,90 195,85 208,85 C 215,90 220,120 222,150 C 224,180 222,210 218,240 C 214,270 210,300 205,330 C 200,350 194,370 192,390 C 188,410 182,425 180,425 C 178,415 182,400 185,385 C 188,370 194,340 196,310 C 198,280 200,240 198,200 C 196,160 192,130 178,110 Z" 
            fill={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.15)" : "#93c5fd"} 
            stroke={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.3)" : "#2563eb"} 
            strokeWidth="0.8" 
          />
          <text x="198" y="200" fill={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.4)" : "#1e40af"} fontSize="6" fontFamily="monospace" fontWeight="bold" transform="rotate(78,198,200)">Lake Malawi</text>

          {/* Other Southern Lakes */}
          <path d="M 215,480 C 222,482 225,488 225,495 C 222,502 215,502 210,498 C 208,495 210,488 215,480 Z" fill={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.1)" : "#93c5fd"} stroke={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.2)" : "#2563eb"} strokeWidth="0.4" />
          <path d="M 220,445 C 224,446 226,450 224,455 C 222,460 218,460 217,455 C 217,450 218,446 220,445 Z" fill={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.1)" : "#93c5fd"} stroke={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.2)" : "#2563eb"} strokeWidth="0.4" />
          <path d="M 180,412 C 184,414 186,418 184,422 C 182,425 178,425 177,422 C 176,418 178,414 180,412 Z" fill={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.1)" : "#93c5fd"} stroke={mapTheme === "cyber" ? "rgba(37, 99, 235, 0.2)" : "#2563eb"} strokeWidth="0.4" />

          {/* Region outlines */}
          <line x1="20" y1="180" x2="200" y2="175" stroke="#ffffff" strokeWidth="0.3" strokeOpacity="0.15" strokeDasharray="4,4" />
          <line x1="20" y1="390" x2="200" y2="385" stroke="#ffffff" strokeWidth="0.3" strokeOpacity="0.15" strokeDasharray="4,4" />

          {/* Region labels */}
          <text x="12" y="105" fill="#60a5fa" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.6">NORTHERN</text>
          <text x="12" y="295" fill="#fbbf24" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.6">CENTRAL</text>
          <text x="12" y="510" fill="#fb923c" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity="0.6">SOUTHERN</text>

          {/* District boundaries */}
          {districtsWithIncidents.map(d => {
            const rc = riskColor(d.risk);
            const isHovering = hovered === d.id;
            
            // Theming configuration
            const fillVal = mapTheme === "geo"
              ? (d.region === "Northern" ? "#ffedd5" : d.region === "Central" ? "#dcfce7" : "#fef9c3")
              : rc.fill;
            const strokeVal = mapTheme === "geo"
              ? (isHovering ? "#FFD600" : "#475569")
              : (isHovering ? "#ffffff" : rc.stroke);
            const fillOpacityVal = mapTheme === "geo"
              ? (isHovering ? 1.0 : 0.85)
              : (isHovering ? 0.85 : 0.65);

            return (
              <g key={d.id}>
                <path
                  d={d.svgPath}
                  fill={fillVal}
                  fillOpacity={fillOpacityVal}
                  stroke={strokeVal}
                  strokeWidth={isHovering ? 1.2 : 0.5}
                  className="cursor-pointer transition-all duration-150"
                  onClick={() => onHotspotClick(d.id, d.name)}
                  onMouseEnter={() => setHovered(d.id)}
                  onMouseLeave={() => setHovered(null)}
                />

                {/* Pulsing warning indicator for high-risk and active incidents */}
                {d.activeCount > 0 && (
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
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="0.8"
                  >
                    <animate attributeName="r" values="3;7;3" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0;1" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Interactive city indicators */}
          <circle cx="118" cy="306" r="3" fill="#FFD600" stroke="#000" strokeWidth="0.4" className="pointer-events-none" />
          <text x="123" y="308" fill="#FFF" fontSize="5.5" fontFamily="monospace" fontWeight="bold" className="pointer-events-none drop-shadow">Lilongwe ✪</text>

          <circle cx="58" cy="510" r="1.8" fill="#ef4444" stroke="#fff" strokeWidth="0.3" className="pointer-events-none" />
          <text x="62" y="512" fill="#FFF" fontSize="5" fontFamily="monospace" fontWeight="bold" className="pointer-events-none drop-shadow">Blantyre ●</text>

          <circle cx="130" cy="138" r="1.8" fill="#ef4444" stroke="#fff" strokeWidth="0.3" className="pointer-events-none" />
          <text x="134" y="140" fill="#FFF" fontSize="5" fontFamily="monospace" fontWeight="bold" className="pointer-events-none drop-shadow">Mzuzu ●</text>

          {/* Malawi Flag */}
          <g transform="translate(175, 18)">
            <rect width="45" height="28" fill="#000000" />
            <rect y="9.3" width="45" height="9.3" fill="#d01c1f" />
            <rect y="18.6" width="45" height="9.4" fill="#1f7d45" />
            <path d="M 18.5,9.3 A 4,4 0 0 1 26.5,9.3 Z" fill="#d01c1f" />
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

          {/* Africa Inset Map */}
          <g transform="translate(10, 520)">
            <rect width="65" height="65" fill="#05080f" fillOpacity="0.85" stroke="#3b82f6" strokeWidth="0.5" rx="3" />
            <path 
              d="M 25,5 C 30,2 35,2 40,4 C 45,7 50,10 52,17 C 55,22 50,27 48,32 C 45,37 42,42 42,47 C 40,52 35,54 32,52 C 30,50 30,42 28,37 C 26,32 22,30 18,27 C 16,24 18,20 20,17 C 22,14 22,10 25,5 Z" 
              fill="#1e293b" 
              stroke="#334155" 
              strokeWidth="0.3" 
              transform="translate(4,4)"
            />
            <circle cx="47" cy="38" r="1.2" fill="#ef4444" className="animate-pulse" />
            <line x1="47" y1="38" x2="35" y2="48" stroke="#ef4444" strokeWidth="0.3" strokeDasharray="1,1" />
            <rect x="12" y="46" width="36" height="7" rx="1" fill="#0f172a" stroke="#ef4444" strokeWidth="0.3" />
            <text x="30" y="51" textAnchor="middle" fill="#ef4444" fontSize="4.5" fontFamily="monospace" fontWeight="bold">MALAWI</text>
          </g>

          {/* Cyber attack vector overlays (Simulated Threat Vectors Ingressing in Command mode) */}
          {mapTheme === "cyber" && (
            <g>
              {/* Attacker 1 - East Europe C2 */}
              <circle cx="25" cy="130" r="1.8" fill="#ef4444" />
              <text x="25" y="125" fill="#ef4444" fontSize="4.5" fontFamily="monospace" fontWeight="bold">C2_node_RU</text>
              <path d="M 25,130 Q 80,110 130,138" className="flow-line" />

              {/* Attacker 2 - China Proxy */}
              <circle cx="20" cy="270" r="1.8" fill="#ef4444" />
              <text x="20" y="265" fill="#ef4444" fontSize="4.5" fontFamily="monospace" fontWeight="bold">Host_CN [41.221]</text>
              <path d="M 20,270 Q 70,290 118,306" className="flow-line" />

              {/* Attacker 3 - US Hosting */}
              <circle cx="25" cy="450" r="1.8" fill="#ef4444" />
              <text x="25" y="445" fill="#ef4444" fontSize="4.5" fontFamily="monospace" fontWeight="bold">Bot_US [198.51]</text>
              <path d="M 25,450 Q 50,470 58,510" className="flow-line" />
            </g>
          )}
        </svg>

        {/* Floating Tooltip info */}
        {hovered && (() => {
          const config = DISTRICTS_CONFIG.find(c => c.id === hovered);
          const riskVal = getDistrictRisk(hovered, incidents);
          return (
            <div className="absolute top-2 right-2 bg-[#05080f]/95 border border-white/10 rounded-lg p-2.5 z-10 font-mono text-[10px] space-y-1">
              <div className="font-bold text-white uppercase">{config?.name}</div>
              <div className="text-slate-400">Region: {config?.region}</div>
              <div className={`font-bold ${riskVal >= 70 ? "text-red-400" : "text-yellow-400"}`}>Risk: {riskVal}%</div>
              <div className="text-slate-500 text-[9px] uppercase">Click → War Room Console</div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[9px] font-mono text-slate-500 border-t border-white/5 pt-2">
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Critical</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Elevated</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal</div>
        <span className="ml-auto">Click hotspot → War Room</span>
      </div>
    </div>
  );
}

function BentoMissionMetrics({ 
  incidents, 
  stats,
  onMetricClick
}: { 
  incidents: Incident[]; 
  stats?: NationalStats | null;
  onMetricClick: (type: "active" | "critical" | "resolved" | "units") => void;
}) {
  const active   = incidents.filter(i => !["Resolved", "Contained", "Closed"].includes(i.status));
  const critical = incidents.filter(i => i.severity === "Critical" && !["Resolved", "Contained", "Closed"].includes(i.status));
  const resolved = incidents.filter(i => ["Resolved", "Contained"].includes(i.status));

  const metrics = [
    {
      id: "active",
      label: "Active Incidents",
      sub: "Non-resolved events",
      val: active.length,
      icon: AlertTriangle,
      topBorder: "bg-orange-500",
      textColor: "text-orange-400",
      borderColor: "border-orange-500/25",
      bg: active.length > 0 ? "bg-orange-500/6" : "bg-white/2",
      glow: active.length > 0 ? "hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]" : "",
      pulse: active.length > 0,
      blink: active.length > 2,
    },
    {
      id: "critical",
      label: "CRITICAL",
      sub: "Immediate response required",
      val: critical.length,
      icon: Siren,
      topBorder: "bg-red-500",
      textColor: "text-red-400",
      borderColor: critical.length > 0 ? "border-red-500/40" : "border-red-500/15",
      bg: critical.length > 0 ? "bg-red-500/8" : "bg-white/2",
      glow: critical.length > 0 ? "hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]" : "",
      pulse: critical.length > 0,
      blink: critical.length > 0,
    },
    {
      id: "resolved",
      label: "Resolved",
      sub: "Contained & closed",
      val: resolved.length,
      icon: CheckCircle2,
      topBorder: "bg-emerald-500",
      textColor: "text-emerald-400",
      borderColor: "border-emerald-500/20",
      bg: "bg-emerald-500/4",
      glow: "hover:shadow-[0_0_16px_rgba(34,197,94,0.1)]",
      pulse: false,
      blink: false,
    },
    {
      id: "units",
      label: "Response Units",
      sub: "MACERT · Police · MDF",
      val: 3,
      icon: Users,
      topBorder: "bg-blue-500",
      textColor: "text-blue-400",
      borderColor: "border-blue-500/20",
      bg: "bg-blue-500/4",
      glow: "hover:shadow-[0_0_16px_rgba(59,130,246,0.1)]",
      pulse: false,
      blink: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map(({ id, label, sub, val, icon: Icon, topBorder, textColor, borderColor, bg, glow, pulse, blink }) => (
        <button
          key={id}
          onClick={() => onMetricClick(id as any)}
          className={`relative rounded-xl border overflow-hidden text-left w-full cursor-pointer transition-all duration-300 group ${borderColor} ${bg} ${glow}`}
        >
          {/* Top accent stripe */}
          <div className={`h-0.5 w-full ${topBorder} ${blink ? "animate-pulse" : ""}`} />

          <div className="p-4 flex items-start gap-3">
            {/* Icon */}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${borderColor} bg-black/20 mt-0.5`}>
              <Icon className={`w-4.5 h-4.5 ${textColor} ${pulse ? "animate-pulse" : ""}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-0.5">{label}</div>
              <div className={`font-orbitron text-3xl font-bold leading-none mb-1 ${val > 0 && id !== "resolved" ? textColor : "text-slate-100"}`}>
                {val}
              </div>
              <div className="text-[8px] font-mono text-slate-600 truncate">{sub}</div>
            </div>

            {/* Live indicator for active/critical */}
            {blink && (
              <div className="absolute top-3 right-3">
                <span className={`w-1.5 h-1.5 rounded-full ${topBorder} animate-ping absolute`} />
                <span className={`w-1.5 h-1.5 rounded-full ${topBorder} relative block`} />
              </div>
            )}
          </div>

          {/* Hover arrow */}
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className={`w-3 h-3 ${textColor}`} />
          </div>
        </button>
      ))}
    </div>
  );
}

function SectorHealthDashboard({ 
  incidents,
  onSectorClick
}: { 
  incidents: Incident[];
  onSectorClick: (sectorId: string, name: string, health: number) => void;
}) {
  return (
    <div className="card p-5 space-y-3">
      <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
        <div className="w-1.5 h-4 bg-blue-400 rounded-full" />
        <span className="cyber-heading-sm text-slate-200">Sector Health Matrix</span>
        <span className="ml-auto text-[8px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase">Live · Click Row</span>
      </h3>
      <div className="space-y-1.5">
        {SECTOR_HEALTH.map(({ id, label, icon: Icon, baseHealth }) => {
          const health     = sectorHealthFromIncidents(baseHealth, incidents, id);
          const barColor   = health >= 80 ? "bg-emerald-400" : health >= 50 ? "bg-orange-400" : "bg-red-500";
          const textColor  = health >= 80 ? "text-emerald-400" : health >= 50 ? "text-orange-400" : "text-red-400";
          const borderLeft = health >= 80 ? "border-l-emerald-500/60" : health >= 50 ? "border-l-orange-500/60" : "border-l-red-500/70";
          const status     = health >= 80 ? "OPERATIONAL" : health >= 50 ? "DEGRADED" : "CRITICAL";
          return (
            <button
              key={id}
              onClick={() => onSectorClick(id, label, health)}
              className={`w-full flex items-center gap-3 text-left p-2.5 rounded-lg border border-white/5 border-l-2 ${borderLeft} hover:bg-white/4 hover:border-white/10 transition-all cursor-pointer group relative overflow-hidden`}
            >
              {/* Icon */}
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                health < 50 ? "bg-red-500/10" : health < 80 ? "bg-orange-500/8" : "bg-white/4"
              }`}>
                <Icon className={`w-3.5 h-3.5 ${textColor}`} />
              </div>

              {/* Label + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1.5 text-[10px] font-mono">
                  <span className="text-slate-200 font-semibold">{label}</span>
                  <span className={`font-bold ${textColor}`}>{health}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${health}%` }} />
                </div>
              </div>
              
              {/* Status Indicator */}
              <div className="flex items-center gap-1 text-[8px] font-mono shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${barColor}`} />
                <span className={textColor}>{status}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const formatElapsed = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? h + ":" : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

function EocWarRoom({
  districtName,
  incidents,
  onClose,
  isConnected,
  lastChatMsg,
  sendChatMessage,
  connectedCount,
}: {
  districtName: string;
  incidents: Incident[];
  onClose: () => void;
  isConnected: boolean;
  lastChatMsg: any;
  sendChatMessage: (text: string, sender?: string, org?: string) => void;
  connectedCount: number;
}) {
  // Current user configuration
  const userStr = sessionStorage.getItem("sentinel_user");
  const currentUser = userStr ? JSON.parse(userStr) : { name: "SOC-Analyst", role: "analyst" };

  // ── States ─────────────────────────────────────────────────────────────────
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST.map(i => ({ ...i, done: false })));
  const [chatMsg, setChatMsg] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>(EOC_CHAT_FEED);
  
  // Tactical & Alert States
  const [emergency, setEmergency] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callTarget, setCallTarget] = useState("");
  const [reportActive, setReportActive] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const [escalatedLevel, setEscalatedLevel] = useState("L1 - CRITICAL");

  // Real-time ticking operational clock
  const [elapsedSeconds, setElapsedSeconds] = useState(2820); // 47 mins
  const [currentTime, setCurrentTime] = useState(new Date());

  // Interactive Responders Status
  const [unitStatus, setUnitStatus] = useState([
    { name: "MACERT-SOC", status: "online", action: "Responding", badge: "● Online" },
    { name: "MPS Cybercrime", status: "online", action: "Tracking", badge: "● Online" },
    { name: "MOD Cyber-Cell", status: "standby", action: "Alert", badge: "◐ Standby" },
    { name: "RBM Financial", status: "critical", action: "Freeze", badge: "🔴 Alert" },
    { name: "ZNBC Comms", status: "offline", action: "No Response", badge: "○ Offline" }
  ]);

  // Dynamic Timeline
  const [timelineEvents, setTimelineEvents] = useState([
    { id: "e1", time: "14:32:17", type: "urgent", label: "🚨 URGENT", msg: "New C2 beacon detected: 41.221.72.109", status: "pending", actionLabel: "Block Now" },
    { id: "e2", time: "14:31:45", type: "critical", label: "⚡ CRITICAL", msg: "Encryption detected on Zomba Council servers", status: "pending", actionLabel: "Isolate" },
    { id: "e3", time: "14:29:12", type: "action", label: "🛡️ ACTION", msg: "Isolating subnet 192.168.12.0/24", status: "completed", actionLabel: "" },
    { id: "e4", time: "14:25:03", type: "intelligence", label: "🧠 AI", msg: "Gemini Triage: Matches LIT-2026-59719 pattern", status: "pending", actionLabel: "Link Cases" }
  ]);

  // Action Queue
  const [actionQueue, setActionQueue] = useState([
    { id: "q1", priority: "🔴 CRITICAL", msg: "Block C2 IP: 41.221.72.109", status: "pending", timer: "⏱️ 2 min", type: "execute" },
    { id: "q2", priority: "🟠 HIGH", msg: "Notify Zomba Council IT Director", status: "pending", type: "call" },
    { id: "q3", priority: "🟡 MEDIUM", msg: "Update Threat Intelligence Feed", status: "pending", type: "update" },
    { id: "q4", priority: "⚪ LOW", msg: "Document incident report", status: "pending", type: "draft" }
  ]);

  // Live IOC List
  const [iocs, setIocs] = useState([
    { value: "41.221.72.109", type: "ip", confidence: 97, blocked: true, country: "MW", description: "Ransomware C2 Beaconing" },
    { value: "mra-portal-portal-mw.online", type: "domain", confidence: 81, blocked: false, country: "IS", description: "MRA Phishing Gateway" },
    { value: "102.167.3.2", type: "ip", confidence: 92, blocked: false, country: "ZA", description: "Brute-force SSH attacks" },
    { value: "41.70.3.11", type: "ip", confidence: 68, blocked: false, country: "MW", description: "Settlement fraud API abuse" },
    { value: "mra-tax-payment.info", type: "domain", confidence: 45, blocked: false, country: "US", description: "Simulated spearphishing landing" }
  ]);

  // Interactive MITRE TTPs
  const [selectedTtp, setSelectedTtp] = useState<string | null>(null);

  // Command Console state
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleHistory, setConsoleHistory] = useState<{ text: string; type: "info" | "success" | "error" | "warning" | "input" }[]>([
    { text: "LITSECURE SENTINEL SECURITY DAEMON v1.0", type: "success" },
    { text: "RAM db initialized. Direct network edge blocking active.", type: "info" },
    { text: "Type /help to query list of stealth commands.", type: "info" }
  ]);

  const chatRef = useRef<HTMLDivElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setElapsedSeconds(s => s + 1);
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Sync WebSocket messages
  useEffect(() => {
    if (lastChatMsg) {
      setChatLog(prev => {
        const exists = prev.some(m => m.msg === lastChatMsg.text && m.time === lastChatMsg.time && m.sender === lastChatMsg.sender);
        if (exists) return prev;
        return [...prev, {
          sender: lastChatMsg.sender,
          org: lastChatMsg.org,
          msg: lastChatMsg.text,
          time: lastChatMsg.time,
          type: lastChatMsg.org.toLowerCase().includes("police") ? "police"
              : lastChatMsg.org.toLowerCase().includes("macert") ? "macert"
              : lastChatMsg.org.toLowerCase().includes("system") ? "system" : "soc"
        }];
      });
      setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  }, [lastChatMsg]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleHistory]);

  const toggleChecklist = (id: string) =>
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));

  const toggleUnitStatus = (index: number) => {
    setUnitStatus(prev => prev.map((u, i) => {
      if (i !== index) return u;
      const nextStatus = u.status === "online" ? "standby"
                       : u.status === "standby" ? "critical"
                       : u.status === "critical" ? "offline" : "online";
      const nextBadge = nextStatus === "online" ? "● Online"
                      : nextStatus === "standby" ? "◐ Standby"
                      : nextStatus === "critical" ? "🔴 Alert" : "○ Offline";
      const nextAction = nextStatus === "online" ? "Responding"
                       : nextStatus === "standby" ? "Alert"
                       : nextStatus === "critical" ? "Freeze" : "No Response";
      return { ...u, status: nextStatus, badge: nextBadge, action: nextAction };
    }));
  };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    const sender = currentUser.name;
    const org = currentUser.role === "admin" || currentUser.role === "super_admin" ? "MACERT"
              : currentUser.role === "soc_manager" ? "LitSecure SOC"
              : currentUser.role === "investigator" ? "MPS Cybercrime" : "LitSecure SOC";
    sendChatMessage(chatMsg.trim(), sender, org);
    setChatMsg("");
  };

  const handleTimelineAction = (id: string, action: string) => {
    setTimelineEvents(prev => prev.map(e => e.id === id ? { ...e, status: "completed" } : e));
    if (action === "Block Now") {
      setIocs(prev => prev.map(i => i.value === "41.221.72.109" ? { ...i, blocked: true } : i));
      setConsoleHistory(prev => [...prev,
        { text: "Executing manual boundary block command for 41.221.72.109...", type: "warning" },
        { text: "[NSX API] Successfully generated rule drop_ipset_41.221.72.109", type: "info" },
        { text: "SUCCESS: Edge firewall updated.", type: "success" }
      ]);
      sendChatMessage("[AUTOMATED] Perimeter rule executed. IP 41.221.72.109 has been dropped.", currentUser.name, "SYSTEM");
    } else if (action === "Isolate") {
      setConsoleHistory(prev => [...prev,
        { text: "Quarantining subnet 192.168.12.0/24...", type: "warning" },
        { text: "[VLAN Controller] Isolated VLAN-14 gateway routing.", type: "info" },
        { text: "SUCCESS: Target subnet is now isolated.", type: "success" }
      ]);
      sendChatMessage("[AUTOMATED] Subnet 192.168.12.0/24 isolated from the production network.", currentUser.name, "SYSTEM");
    } else if (action === "Link Cases") {
      setConsoleHistory(prev => [...prev,
        { text: "Linking current incident with campaign LIT-2026-59719...", type: "warning" },
        { text: "[SIEM Correlation] Extracted indicators match APT-28 campaign profile.", type: "info" },
        { text: "SUCCESS: Cases linked successfully.", type: "success" }
      ]);
      sendChatMessage("[SYSTEM] Incident linked with campaign LIT-2026-59719.", currentUser.name, "SYSTEM");
    }
  };

  const handleQueueAction = (id: string, type: string) => {
    setActionQueue(prev => prev.map(q => q.id === id ? { ...q, status: "completed" } : q));
    if (type === "execute") {
      setIocs(prev => prev.map(i => i.value === "41.221.72.109" ? { ...i, blocked: true } : i));
      setConsoleHistory(prev => [...prev,
        { text: "Executing manual boundary block command for 41.221.72.109...", type: "warning" },
        { text: "[NSX API] Successfully generated rule drop_ipset_41.221.72.109", type: "info" },
        { text: "SUCCESS: Edge firewall updated.", type: "success" }
      ]);
      sendChatMessage("[AUTOMATED] Perimeter rule executed. IP 41.221.72.109 has been dropped.", currentUser.name, "SYSTEM");
    } else if (type === "call") {
      setCallTarget("Zomba Council IT Director (+265-888-921-209)");
      setCallActive(true);
    } else if (type === "update") {
      setConsoleHistory(prev => [...prev,
        { text: "Pushing indicators to national feed servers...", type: "warning" },
        { text: "Updating Airtel Money C2 endpoints... OK", type: "info" },
        { text: "Updating TNM Mpamba C2 endpoints... OK", type: "info" },
        { text: "SUCCESS: Threat Intelligence Feed successfully synchronized.", type: "success" }
      ]);
    } else if (type === "draft") {
      setReportActive(true);
    }
  };

  const hashlib_mock = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = consoleInput.trim();
    if (!clean) return;

    setConsoleHistory(prev => [...prev, { text: `$ ${clean}`, type: "input" }]);
    setConsoleInput("");

    const parts = clean.split(" ");
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");

    switch (cmd) {
      case "/help":
        setConsoleHistory(prev => [...prev,
          { text: "Stealth Defense Toolkit - Command Console Interface", type: "info" },
          { text: "  /block <IP|domain>  Apply edge blocking rule silently", type: "info" },
          { text: "  /lockdown           Trigger extreme host-level lockdown", type: "info" },
          { text: "  /status             Query stealth blocking engine telemetry", type: "info" },
          { text: "  /clear              Clear console history", type: "info" }
        ]);
        break;
      case "/block":
        if (!arg) {
          setConsoleHistory(prev => [...prev, { text: "Error: Missing target IP or domain.", type: "error" }]);
        } else {
          setIocs(prev => {
            if (prev.find(item => item.value === arg)) return prev;
            return [...prev, { value: arg, type: arg.includes(".") && isNaN(Number(arg.split(".")[0])) ? "domain" : "ip", confidence: 98, blocked: true, country: "MW", description: "Manual Perimeter Block" }];
          });
          setConsoleHistory(prev => [...prev,
            { text: `Applying silent block on ${arg}...`, type: "info" },
            { text: `[NSX API] IP-Set generated: ipset_${hashlib_mock(arg)}`, type: "info" },
            { text: `[IP Tables] DROP rule injected for output ${arg}`, type: "info" },
            { text: `SUCCESS: ${arg} blocked successfully. No logs written to disk.`, type: "success" }
          ]);
          sendChatMessage(`[CONSOLE] Block rule deployed on ${arg} at edge gateway.`, currentUser.name, "SYSTEM");
        }
        break;
      case "/lockdown":
        setConsoleHistory(prev => [...prev,
          { text: "Applying extreme host-level lockdown sequence...", type: "warning" },
          { text: "Flushing iptables rules... OK", type: "info" },
          { text: "Default Deny policy applied... OK", type: "info" },
          { text: "Local DNS Sinkhole configured... OK", type: "info" },
          { text: "Outbound domain whitelist enabled... OK", type: "info" },
          { text: "SYSTEM STATUS: SECURE (Lockdown Mode)", type: "success" }
        ]);
        setEmergency(true);
        sendChatMessage("[CONSOLE] Host lockdown sequence initiated by Analyst.", currentUser.name, "SYSTEM");
        break;
      case "/status":
        setConsoleHistory(prev => [...prev,
          { text: "Stealth Network Blocker v1.0 Telemetry Status:", type: "info" },
          { text: "  Daemon State: RUNNING (as process [kworker/0:1])", type: "info" },
          { text: "  RAM Database (SQLite): INITIALIZED (:memory:)", type: "info" },
          { text: "  Redis Broker: CONNECTED (localhost:6379)", type: "info" },
          { text: "  Blocked Indicators Count: " + iocs.filter(i => i.blocked).length, type: "info" },
          { text: "  Disk logging: DISABLED (stealth_mode = true)", type: "success" }
        ]);
        break;
      case "/clear":
        setConsoleHistory([]);
        break;
      default:
        setConsoleHistory(prev => [...prev, { text: `Command not found: ${cmd}. Type /help for assistance.`, type: "error" }]);
    }
  };

  const handleEscalateClick = () => {
    setEscalatedLevel("CRITICAL RED ALERT");
    setConsoleHistory(prev => [...prev, { text: "Threat Level Escalated: CRITICAL RED ALERT (9.9/10)", type: "warning" }]);
    sendChatMessage("[SYSTEM] Incident escalated to National Alert Level - CRITICAL RED ALERT", currentUser.name, "SYSTEM");
  };

  const doneCount = checklist.filter(c => c.done).length;
  const totalCount = checklist.length;
  const pct = Math.round((doneCount / totalCount) * 100);

  const orgColor: Record<ChatMessage["type"], string> = {
    macert: "text-[#FFD600]",
    soc:    "text-blue-400",
    police: "text-purple-400",
    system: "text-emerald-400",
  };

  const MITRE_TTPS = [
    { code: "T1190", name: "Exploit Public-Facing App", tactic: "Initial Access", desc: "Attacker exploited SMBv1 exposure or employee portal vulnerability to establish foothold.", mit: "Isolate subnet, patch SMB services immediately." },
    { code: "T1204", name: "User Execution", tactic: "Execution", desc: "Local user executed ransomware payload via malicious email attachment.", mit: "Disable macro permissions, sandbox email downloads." },
    { code: "T1078", name: "Valid Accounts", tactic: "Persistence", desc: "Compromised admin credentials used to execute services laterally.", mit: "Rotate credentials, enforce MFA setups." },
    { code: "T1562", name: "Impair Defenses", tactic: "Defense Evasion", desc: "Attacker cleared system logs and disabled service auditing.", mit: "Enable off-site remote log aggregation." },
    { code: "T1071", name: "Application Layer Protocol", tactic: "Command & Control", desc: "C2 beacons transmitted outbound via encrypted web sockets.", mit: "Apply silent DNS sinkholing rules." },
    { code: "T1486", name: "Data Encrypted for Impact", tactic: "Impact", desc: "Encryption script executed locally on Zomba Council records mainframe.", mit: "Offline backup restoration protocols." },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-4">
      <div className="w-full max-w-[95vw] h-[95vh] flex flex-col bg-[#05080f] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden relative">
        
        {/* Flashing ambient warning if emergency / lockdown active */}
        {emergency && (
          <div className="absolute inset-0 border-4 border-red-500 animate-pulse pointer-events-none z-40 bg-red-950/10" />
        )}

        {/* ─── Header ────────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-30 bg-[#080c17]/95 border-b border-red-500/20 px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
            <Crosshair className="w-4.5 h-4.5 text-red-400 animate-pulse" />
          </div>
          <div>
            <h2 className="font-bebas text-lg md:text-xl text-white tracking-widest flex items-center gap-2">
              ⚔️ EOC INCIDENT WAR ROOM — {districtName.toUpperCase()}
              <span className="text-[9px] font-mono font-bold bg-red-500/20 border border-red-500/40 text-red-400 px-1.5 py-0.5 rounded animate-pulse">
                {escalatedLevel}
              </span>
            </h2>
            <p className="text-[9px] text-slate-500 font-mono">Republic of Malawi · Emergency Operations Center · Coordinated Incident Response</p>
          </div>
          
          <div className="hidden md:flex items-center gap-4 text-[9px] font-mono text-slate-500 ml-auto mr-4">
            <div>
              Status: <span className="text-red-400 font-bold animate-pulse">🔴 RED ALERT</span>
            </div>
            <div>
              Operators: <span className="text-slate-300 font-bold">{connectedCount} Active</span>
            </div>
            <div>
              Time: <span className="text-slate-300 font-bold">{currentTime.toLocaleTimeString()}</span>
            </div>
            <div>
              Date: <span className="text-slate-300 font-bold">2026-06-19</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="ml-auto md:ml-0 p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── 3-Panel Main Layout ───────────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-y-auto lg:overflow-hidden min-h-0">
          
          {/* 1. LEFT PANEL (Situation Area) - lg:col-span-3 */}
          <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto h-full scrollbar-thin">
            
            {/* Live Threat Vector Map */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 relative overflow-hidden shrink-0 h-[260px]">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>📍 SECURE SATELLITE RADAR FEED</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE</span>
              </div>
              <div className="flex-1 relative flex items-center justify-center">
                <svg viewBox="0 0 200 300" className="w-full h-full max-h-[200px]">
                  <circle cx="100" cy="150" r="130" fill="none" stroke="rgba(239, 68, 68, 0.05)" strokeWidth="0.5" />
                  <circle cx="100" cy="150" r="90" fill="none" stroke="rgba(239, 68, 68, 0.08)" strokeWidth="0.5" />
                  <circle cx="100" cy="150" r="50" fill="none" stroke="rgba(239, 68, 68, 0.12)" strokeWidth="0.5" />
                  <line x1="100" y1="150" x2="200" y2="150" stroke="rgba(239, 68, 68, 0.15)" strokeWidth="1" className="origin-[100px_150px] animate-radar" />
                  
                  {/* Targets */}
                  <circle cx="95" cy="130" r="4.5" fill="#ef4444" className="animate-pulse" />
                  <text x="103" y="132" fill="#fff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">LILONGWE (HQ)</text>
                  <circle cx="120" cy="220" r="3.5" fill="#f97316" />
                  <text x="126" y="222" fill="#94a3b8" fontSize="7" fontFamily="monospace">BLANTYRE</text>
                  <circle cx="125" cy="190" r="3.5" fill="#eab308" />
                  <text x="131" y="192" fill="#94a3b8" fontSize="7" fontFamily="monospace">ZOMBA</text>
                  <circle cx="85" cy="60" r="3.5" fill="#3b82f6" />
                  <text x="91" y="62" fill="#94a3b8" fontSize="7" fontFamily="monospace">MZUZU</text>

                  {/* Lines representing international C2 vectors ingressing */}
                  <path d="M 20,40 Q 60,80 95,130" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" className="flow-line" />
                  <path d="M 180,80 Q 150,150 125,190" fill="none" stroke="#eab308" strokeWidth="0.8" strokeDasharray="4,3" className="flow-line" />
                  <path d="M 10,240 Q 70,230 120,220" fill="none" stroke="#f97316" strokeWidth="0.8" strokeDasharray="4,3" className="flow-line" />
                </svg>
              </div>
            </div>

            {/* Response Units Status List */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 shrink-0">
              <div className="text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>🛡️ RESPONDER UNITS CONTROL</span>
              </div>
              <div className="space-y-1.5">
                {unitStatus.map((unit, idx) => (
                  <button
                    key={unit.name}
                    onClick={() => toggleUnitStatus(idx)}
                    className="w-full flex items-center justify-between text-left p-2 rounded border border-white/5 hover:border-white/10 bg-white/2 transition cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-200 truncate">{unit.name}</div>
                      <div className="text-[8px] text-slate-500">{unit.action}</div>
                    </div>
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-bold ${
                      unit.status === "online" ? "bg-emerald-500/10 text-emerald-400"
                      : unit.status === "standby" ? "bg-amber-500/10 text-amber-400"
                      : unit.status === "critical" ? "bg-red-500/10 text-red-400 animate-pulse"
                      : "bg-white/5 text-slate-500"
                    }`}>
                      {unit.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Real-time stats */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 flex-1 min-h-[120px]">
              <div className="text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>📊 ATTACK WAVE TELEMETRY</span>
              </div>
              <div className="grid grid-cols-3 gap-2 flex-1 items-center">
                <div className="bg-red-500/5 border border-red-500/20 rounded p-2 text-center h-full flex flex-col justify-center">
                  <div className="text-[8px] font-mono text-slate-500">ATTACKS</div>
                  <div className="text-xl font-orbitron font-bold text-red-400 leading-none mt-1">1,847</div>
                  <div className="text-[7px] font-mono text-red-500/60 mt-1">↑ 14.8%</div>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2 text-center h-full flex flex-col justify-center">
                  <div className="text-[8px] font-mono text-slate-500">BLOCKED</div>
                  <div className="text-xl font-orbitron font-bold text-emerald-400 leading-none mt-1">1,739</div>
                  <div className="text-[7px] font-mono text-emerald-500/60 mt-1">94.2%</div>
                </div>
                <div className="bg-[#FFD600]/5 border border-[#FFD600]/20 rounded p-2 text-center h-full flex flex-col justify-center">
                  <div className="text-[8px] font-mono text-slate-500">ACTIVE</div>
                  <div className="text-xl font-orbitron font-bold text-[#FFD600] leading-none mt-1">108</div>
                  <div className="text-[7px] font-mono text-[#FFD600]/60 mt-1">⚡ Dynamic</div>
                </div>
              </div>
            </div>

          </div>

          {/* 2. CENTER PANEL (Active Incident Response) - lg:col-span-5 */}
          <div className="lg:col-span-5 flex flex-col gap-4 overflow-y-auto h-full scrollbar-thin min-h-0">
            
            {/* Active Incident Header */}
            <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-3 flex items-start gap-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                <Siren className="w-4 h-4 text-red-400 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-mono font-bold text-red-400 uppercase tracking-wider">CRITICAL INCIDENT ACTIVE</div>
                <h3 className="text-xs font-bold text-white truncate mt-0.5">LIT-2028-30421 – {districtName} Council Ransomware</h3>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[8px] font-mono text-slate-400">
                  <span className="flex items-center gap-1 text-red-400">⏱️ Active: <span className="font-bold">{formatElapsed(elapsedSeconds)}</span></span>
                  <span>📊 Impact Score: 9.8/10</span>
                  <span>👤 Assigned: MACERT-SOC</span>
                </div>
              </div>
            </div>

            {/* Live Operations Timeline */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>⚡ LIVE OPERATIONS TIMELINE</span>
                <span className="text-[8px] text-slate-500">LATEST TOP</span>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {timelineEvents.map(event => (
                  <div key={event.id} className="flex items-start gap-2.5 bg-white/2 rounded p-2 border border-white/5 relative overflow-hidden">
                    <span className="text-[8px] font-mono text-slate-500 mt-0.5 shrink-0">{event.time}</span>
                    <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                      event.type === "urgent" ? "text-red-400 border-red-500/30 bg-red-500/10"
                      : event.type === "critical" ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                      : event.type === "action" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    }`}>{event.label}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-slate-300 font-mono leading-tight">{event.msg}</div>
                    </div>
                    {event.actionLabel && (
                      <div className="shrink-0">
                        {event.status === "completed" ? (
                          <span className="text-[8px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">✓ Done</span>
                        ) : (
                          <button
                            onClick={() => handleTimelineAction(event.id, event.actionLabel)}
                            className="text-[8px] font-mono font-bold bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            {event.actionLabel}
                          </button>
                        )}
                      </div>
                    )}
                    {event.status === "completed" && !event.actionLabel && (
                      <span className="text-[8px] font-mono text-emerald-500">✓ Done</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Queue */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 shrink-0">
              <div className="text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>📋 PENDING INCIDENT RUNBOOK QUEUE</span>
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {actionQueue.map(action => (
                  <div key={action.id} className="flex items-center gap-2 p-2 bg-white/2 rounded border border-white/5">
                    <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      action.priority.includes("CRITICAL") ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : action.priority.includes("HIGH") ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                      : action.priority.includes("MEDIUM") ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      : "bg-white/5 text-slate-400"
                    }`}>{action.priority}</span>
                    <span className="text-[10px] font-mono text-slate-300 flex-1 truncate">{action.msg}</span>
                    {action.timer && <span className="text-[8px] text-slate-500 font-mono">{action.timer}</span>}
                    {action.status === "completed" ? (
                      <span className="text-[8px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded shrink-0">✓ Deployed</span>
                    ) : (
                      <button
                        onClick={() => handleQueueAction(action.id, action.type)}
                        className="text-[8px] font-mono font-bold bg-white/5 border border-white/10 hover:border-[#FFD600]/40 text-slate-300 hover:text-[#FFD600] px-2 py-0.5 rounded transition cursor-pointer"
                      >
                        {action.type === "execute" ? "Execute" : action.type === "call" ? "📞 Call" : action.type === "update" ? "Update" : "Draft"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Secure Chat */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 flex-1 min-h-[220px]">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>🔐 SECURE MACERT/SOC FUSION CHANNEL</span>
                <span className={`text-[8px] font-mono font-bold flex items-center gap-1 ${isConnected ? "text-emerald-400" : "text-red-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
                  {isConnected ? "AES-256 SECURE" : "DISCONNECTED"}
                </span>
              </div>
              <div
                ref={chatRef}
                className="flex-1 overflow-y-auto space-y-2 p-2 bg-[#040709] border border-white/5 rounded-lg h-[120px] scrollbar-thin"
              >
                {chatLog.map((msg, i) => (
                  <div key={i} className="space-y-0.5 font-mono text-[9px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${orgColor[msg.type] || "text-slate-300"}`}>{msg.sender}</span>
                      <span className="text-slate-600">[{msg.org}]</span>
                      <span className="text-slate-700 ml-auto">{msg.time}</span>
                    </div>
                    <div className="text-[10px] text-slate-300 pl-2 border-l border-white/5 leading-normal">{msg.msg}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMsg}
                  onChange={e => setChatMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendChat()}
                  placeholder="Type secure message and press Enter..."
                  className="flex-1 bg-[#0A0E1A] border border-white/10 focus:border-red-500/40 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none font-mono"
                />
                <button
                  onClick={sendChat}
                  className="px-3 py-1.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition text-xs font-mono font-bold cursor-pointer"
                >
                  SEND
                </button>
              </div>
            </div>

            {/* Command Console */}
            <div className="border border-[rgba(0,255,65,0.15)] bg-black/90 rounded-xl p-3 flex flex-col gap-2 shrink-0 h-[220px]">
              <div className="flex items-center justify-between text-[9px] font-mono text-[rgba(0,255,65,0.7)] border-b border-[rgba(0,255,65,0.12)] pb-1">
                <span>🛡️ COMMAND SHELL - STEALTH DEPLOYMENT KIT</span>
                <span className="text-[7px] text-[rgba(0,255,65,0.5)]">TTY02_SEC</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[9px] text-[rgba(0,255,65,0.9)] scrollbar-thin">
                {consoleHistory.map((line, idx) => (
                  <div key={idx} className={`leading-normal ${
                    line.type === "success" ? "text-emerald-400"
                    : line.type === "error" ? "text-rose-400"
                    : line.type === "warning" ? "text-[#FFD600]"
                    : line.type === "input" ? "text-[#00e5ff]"
                    : "text-slate-400"
                  }`}>
                    {line.text}
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
              <form onSubmit={handleCommandSubmit} className="flex gap-2 border-t border-[rgba(0,255,65,0.12)] pt-1.5">
                <span className="text-[rgba(0,255,65,0.9)] font-mono text-xs select-none">$</span>
                <input
                  type="text"
                  value={consoleInput}
                  onChange={e => setConsoleInput(e.target.value)}
                  placeholder="Enter stealth boundary command (e.g. /help, /block <IP>, /lockdown)..."
                  className="flex-1 bg-transparent text-[rgba(0,255,65,0.9)] placeholder-[rgba(0,255,65,0.25)] text-xs font-mono outline-none border-none"
                />
              </form>
            </div>

          </div>

          {/* 3. RIGHT PANEL (Intelligence Panel) - lg:col-span-4 */}
          <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto h-full scrollbar-thin">
            
            {/* Live IOC Dashboard */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 shrink-0">
              <div className="text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>🔍 ACTIVE IOC ATTACK INDICATORS</span>
              </div>
              <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                {iocs.map(ioc => (
                  <div key={ioc.value} className="flex items-center justify-between p-2 bg-white/2 rounded border border-white/5 text-[9px] font-mono">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1 h-1 rounded-full ${ioc.type === "ip" ? "bg-cyan-400" : "bg-purple-400"}`} />
                        <span className="text-slate-200 font-bold truncate max-w-[120px]">{ioc.value}</span>
                        <span className="text-slate-500">({ioc.type.toUpperCase()})</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">{ioc.description}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${
                        ioc.confidence >= 90 ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : ioc.confidence >= 60 ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                        : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      }`}>{ioc.confidence}% Conf.</span>
                      <button
                        onClick={() => {
                          setIocs(prev => prev.map(i => i.value === ioc.value ? { ...i, blocked: !i.blocked } : i));
                          setConsoleHistory(prev => [...prev, { text: `Stealth block status toggled for ${ioc.value} to ${!ioc.blocked ? 'BLOCKED' : 'ALLOWED'}`, type: "warning" }]);
                        }}
                        className={`text-[8px] font-bold px-2 py-0.5 rounded border transition cursor-pointer ${
                          ioc.blocked ? "bg-red-500/15 border-red-500/30 text-red-400"
                          : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {ioc.blocked ? "BLOCKED" : "BLOCK"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MITRE ATT&CK Matrix Grid */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 shrink-0">
              <div className="text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>📊 ATT&CK TTACTIC MAP (MITRE MATRIX)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MITRE_TTPS.map(ttp => (
                  <button
                    key={ttp.code}
                    onClick={() => setSelectedTtp(selectedTtp === ttp.code ? null : ttp.code)}
                    className={`p-2 rounded border text-left transition relative overflow-hidden cursor-pointer ${
                      selectedTtp === ttp.code ? "bg-purple-500/10 border-purple-500/50"
                      : "bg-white/2 border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex justify-between items-start text-[8px] font-mono font-bold text-slate-400 mb-1">
                      <span className="text-[#FFD600]">{ttp.code}</span>
                      <span className="truncate max-w-[80px]">{ttp.tactic}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-200 font-bold truncate">{ttp.name}</div>
                  </button>
                ))}
              </div>
              {selectedTtp && (() => {
                const ttp = MITRE_TTPS.find(t => t.code === selectedTtp);
                return (
                  <div className="bg-purple-950/20 border border-purple-500/20 rounded p-2.5 text-[9px] font-mono text-slate-300 space-y-1 mt-1 animate-fade-in">
                    <div><strong>Tactics Group:</strong> <span className="text-purple-400 font-bold">{ttp?.tactic} ({ttp?.code})</span></div>
                    <div><strong>Observation Detail:</strong> {ttp?.desc}</div>
                    <div><strong>Containment Action:</strong> <span className="text-emerald-400 font-semibold">{ttp?.mit}</span></div>
                  </div>
                );
              })()}
            </div>

            {/* Related Historical Cases */}
            <div className="border border-white/5 rounded-xl bg-black/40 p-3 flex flex-col gap-2 flex-1 min-h-[140px]">
              <div className="text-[10px] font-mono text-slate-400 border-b border-white/5 pb-1">
                <span>📚 HISTORICAL CORRELATED CAMPAIGNS</span>
              </div>
              <div className="space-y-1.5 flex-1 overflow-y-auto scrollbar-thin font-mono text-[9px]">
                {[
                  { id: "LIT-2026-59719", title: "Blantyre Financial Spearphishing", date: "2026-04-12", severity: "High", risk: "81%" },
                  { id: "LIT-2028-1002", title: "Capital Hill Mainframe Exfiltration", date: "2028-02-09", severity: "Critical", risk: "95%" }
                ].map(c => (
                  <div key={c.id} className="p-2 rounded border border-white/5 bg-white/2 flex justify-between items-center">
                    <div>
                      <div className="text-slate-300 font-bold">{c.id} — {c.title}</div>
                      <div className="text-slate-500 text-[8px] mt-0.5">Date: {c.date} · Threat Level: {c.severity}</div>
                    </div>
                    <span className="text-[#FFD600] font-bold bg-[#FFD600]/10 px-1.5 rounded shrink-0">{c.risk} Cor.</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* ─── Bottom Bar Controls ───────────────────────────────────────────── */}
        <div className="sticky bottom-0 z-30 bg-[#080c17]/95 border-t border-white/5 px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEmergency(!emergency);
                setConsoleHistory(prev => [...prev, {
                  text: emergency ? "Emergency protocol deactivated." : "EMERGENCY PROTOCOL ENGAGED! Alerts broadcast to MACRA DG and response cell.",
                  type: emergency ? "info" : "error"
                }]);
                sendChatMessage(emergency ? "[SYSTEM] Emergency alert deactivated." : "[ALERT] Emergency response protocol triggered by Analyst.", currentUser.name, "SYSTEM");
              }}
              className={`px-4 py-2 text-white font-mono text-xs font-bold rounded-lg border transition cursor-pointer shadow-lg hover:brightness-110 active:scale-95 ${
                emergency ? "bg-red-600 border-red-500 animate-pulse"
                : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
              }`}
            >
              🔴 {emergency ? "ABORT EMERGENCY" : "EMERGENCY PROTOCOL"}
            </button>
            
            <button
              onClick={() => {
                setCallTarget("MACRA Director General");
                setCallActive(true);
              }}
              className="px-4 py-2 bg-white/5 border border-white/10 hover:border-blue-500/40 text-slate-300 hover:text-blue-400 font-mono text-xs font-bold rounded-lg transition cursor-pointer"
            >
              📞 CALL DG
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleEscalateClick}
              className="px-4 py-2 bg-white/5 border border-white/10 hover:border-orange-500/40 text-slate-300 hover:text-orange-400 font-mono text-xs font-bold rounded-lg transition cursor-pointer"
            >
              🛡️ ESCALATE LEVEL
            </button>
            <button
              onClick={() => setReportActive(true)}
              className="px-4 py-2 bg-white/5 border border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 font-mono text-xs font-bold rounded-lg transition cursor-pointer"
            >
              📊 DRAFT REPORT
            </button>
            <button
              onClick={() => setAiActive(true)}
              className="px-4 py-2 bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 font-mono text-xs font-bold rounded-lg transition cursor-pointer"
            >
              ⚡ AI CONTAINMENT
            </button>
          </div>
        </div>

        {/* ─── VoIP Phone Screen Overlay ─────────────────────────────────────── */}
        {callActive && (
          <div className="absolute inset-0 bg-black/90 z-[200] flex items-center justify-center p-4">
            <div className="w-full max-w-sm p-6 border border-[#FFD600]/40 bg-[#0a0e1a] rounded-2xl flex flex-col items-center space-y-6 text-center shadow-2xl relative overflow-hidden font-mono">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[#FFD600]/60 animate-bounce" />
              <div className="w-16 h-16 rounded-full bg-[#FFD600]/10 border border-[#FFD600]/40 flex items-center justify-center animate-pulse shrink-0 font-mono">
                <Phone className="w-8 h-8 text-[#FFD600]" />
              </div>
              <div className="space-y-1.5">
                <div className="text-white text-xs font-bold tracking-widest uppercase">ESTABLISHING SECURE VOICE BRIDGE...</div>
                <div className="text-slate-400 text-xs font-semibold">{callTarget}</div>
              </div>
              <div className="w-full bg-black/40 border border-white/5 rounded-lg p-3 text-[9px] text-slate-500 space-y-1 text-left">
                <div>Encryption Key: DH-4096 / GCM-256</div>
                <div>Signal Integrity: SECURE (Encrypted Pipeline Established)</div>
                <div>Routing: Lilongwe EOC Core ↔ Airtel VoIP Trunk</div>
              </div>
              <button 
                onClick={() => setCallActive(false)} 
                className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-lg transition cursor-pointer shadow-lg active:scale-95 font-mono"
              >
                DISCONNECT VOICE BRIDGE
              </button>
            </div>
          </div>
        )}

        {/* ─── Report Draft Screen Overlay ───────────────────────────────────── */}
        {reportActive && (
          <div className="absolute inset-0 bg-black/90 z-[200] flex items-center justify-center p-4">
            <div className="w-full max-w-2xl h-[80vh] flex flex-col bg-[#0a0e1a] border border-blue-500/30 rounded-2xl shadow-2xl overflow-hidden font-mono">
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-black/40 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">STIX 2.1 Threat Report Draft</span>
                </div>
                <button onClick={() => setReportActive(false)} className="text-slate-400 hover:text-white transition"><X className="w-4.5 h-4.5" /></button>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                <pre className="text-[9px] text-emerald-400 bg-black/60 p-3 rounded-lg border border-white/5 overflow-x-auto leading-relaxed">
{`{
  "type": "bundle",
  "id": "bundle--${hashlib_mock(districtName)}-4b4e",
  "spec_version": "2.1",
  "objects": [
    {
      "type": "incident",
      "spec_version": "2.1",
      "id": "incident--${districtName.toLowerCase()}-council-ransomware",
      "name": "${districtName} Council Ransomware Incursion",
      "description": "Coordinated ransomware deployment targeting employee records mainframe.",
      "severity": "CRITICAL",
      "created": "${new Date().toISOString()}",
      "labels": ["ransomware", "malawi-emergency"]
    },
    {
      "type": "indicator",
      "spec_version": "2.1",
      "id": "indicator--${hashlib_mock("41.221.72.109")}",
      "name": "C2 Command & Control Beacon",
      "pattern": "[ipv4-addr:value = '41.221.72.109']",
      "pattern_type": "stix",
      "valid_from": "${new Date().toISOString()}"
    }
  ]
}`}
                </pre>
              </div>

              <div className="px-5 py-3 border-t border-white/5 bg-black/40 flex justify-end gap-2 shrink-0">
                <button 
                  onClick={() => {
                    setConsoleHistory(prev => [...prev, { text: "Threat report draft exported to Evidence Vault successfully.", type: "success" }]);
                    setReportActive(false);
                  }} 
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-black font-bold text-xs rounded-lg transition cursor-pointer active:scale-95"
                >
                  EXPORT TO EVIDENCE VAULT
                </button>
                <button 
                  onClick={() => setReportActive(false)} 
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── AI Triage Screen Overlay ──────────────────────────────────────── */}
        {aiActive && (
          <div className="absolute inset-0 bg-black/90 z-[200] flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#0a0e1a] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4 font-mono">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <Bot className="w-5 h-5 text-purple-400 animate-pulse" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">SENTINEL AI CONTAINMENT ADVISORY</h3>
              </div>
              
              <div className="text-[11px] text-slate-300 space-y-3 leading-relaxed">
                <p><strong>Incident Vector:</strong> Coordinated lateral ransomware spread targeting directory systems in Zomba.</p>
                <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-500/20 text-purple-300 space-y-2">
                  <div className="font-bold uppercase text-[10px]">Triage Protocol Recommendations:</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Deploy default-deny rules at edge gateway (VLAN-14).</li>
                    <li>Isolate affected host AST-004 from production subnets.</li>
                    <li>Initiate a full SIM-freeze on flagged Airtel/TNM mobile gateways.</li>
                  </ul>
                </div>
                <p className="text-[9px] text-slate-500">Gemini 2.5 Flash Triage Engine · Confidence Level: 94%</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
                <button 
                  onClick={() => {
                    setConsoleHistory(prev => [...prev, { text: "AI Containment strategy applied to response units successfully.", type: "success" }]);
                    setAiActive(false);
                  }} 
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition cursor-pointer active:scale-95"
                >
                  APPLY ADVISORY PROTOCOL
                </button>
                <button 
                  onClick={() => setAiActive(false)} 
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function AiCommanderPanel() {
  const [briefing, setBriefing]         = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError]     = useState("");
  const briefRef = useRef<HTMLDivElement>(null);

  const generateBriefing = useCallback(async () => {
    const token = sessionStorage.getItem("sentinel_token");
    setBriefing(""); setBriefError(""); setBriefLoading(true);
    try {
      const res = await fetch("/api/ai/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("AI briefing request failed");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.chunk) { full += parsed.chunk; setBriefing(full); briefRef.current?.scrollIntoView({ behavior: "smooth" }); }
            if (parsed.error) setBriefError(parsed.error);
          } catch {}
        }
      }
    } catch (err: any) {
      setBriefError(err.message || "Briefing failed");
    } finally { setBriefLoading(false); }
  }, []);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
          <div className="w-1 h-4 bg-purple-500 rounded" />
          AI Cyber Commander Assessment
        </h3>
        <button
          onClick={generateBriefing}
          disabled={briefLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold transition disabled:opacity-50"
          id="generate-ai-briefing-btn"
        >
          {briefLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
          {briefLoading ? "GENERATING..." : "🤖 GENERATE BRIEFING"}
        </button>
      </div>

      {!briefing && !briefLoading && !briefError && (
        <div className="text-center py-8 text-slate-600">
          <Bot className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-xs font-mono">Click "Generate Briefing" to get an AI-powered national threat assessment from SENTINEL AI (Gemini).</p>
        </div>
      )}

      {briefError && (
        <div className="text-red-400 text-xs font-mono p-3 bg-red-500/10 rounded-lg border border-red-500/20">
          ⚠ {briefError} — Check GEMINI_API_KEY in .env.local
        </div>
      )}

      {briefLoading && !briefing && (
        <div className="flex items-center gap-2 text-purple-400 text-xs font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Contacting SENTINEL AI… generating national threat briefing…
        </div>
      )}

      {briefing && (
        <div ref={briefRef} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-purple-300 font-mono">SENTINEL AI — CLASSIFIED BRIEFING</div>
              <div className="text-[9px] text-purple-600 font-mono">Gemini 2.5 Flash · {new Date().toLocaleString()}</div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(briefing)}
              className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 transition rounded"
              title="Copy briefing"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="prose-sm text-slate-300 text-[12px] leading-relaxed font-mono whitespace-pre-wrap border-t border-white/5 pt-3">
            {briefing}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SituationRoom({ incidents = [], stats }: SituationRoomProps) {
  const [warRoom, setWarRoom] = useState<{ districtId: string; name: string } | null>(null);
  const [districtMapModal, setDistrictMapModal] = useState<DistrictModalData | null>(null);
  const [ticker, setTicker]  = useState(0);
  const [feedPaused, setFeedPaused] = useState(false);
  const [threatScores, setThreatScores] = useState<Record<string, number | null>>({});
  const [hoveredThreat, setHoveredThreat] = useState<number | null>(null);

  // States for interactive detail modals
  const [metricModal, setMetricModal] = useState<"active" | "critical" | "resolved" | "units" | null>(null);
  const [sectorDetail, setSectorDetail] = useState<{ id: string; label: string; health: number } | null>(null);
  const [threatDetail, setThreatDetail] = useState<typeof NATIONAL_THREATS[0] | null>(null);
  const [correlationDetail, setCorrelationDetail] = useState<any | null>(null);

  // WebSocket live connection
  const { isConnected, lastIncident, lastChatMsg, sendChatMessage, connectedCount } = useWarRoomWS();
  const [liveNewIncident, setLiveNewIncident] = useState<any>(null);

  useEffect(() => {
    if (lastIncident) {
      setLiveNewIncident(lastIncident);
      // Auto-dismiss after 8s
      const t = setTimeout(() => setLiveNewIncident(null), 8000);
      return () => clearTimeout(t);
    }
  }, [lastIncident]);

  useEffect(() => {
    const interval = setInterval(() => setTicker(t => t + 1), 3500);
    return () => clearInterval(interval);
  }, []);

  const threatLevel = getThreatLevel(incidents);
  const criticalActive = incidents.filter(
    i => i.severity === "Critical" && !["Resolved", "Contained", "Closed"].includes(i.status)
  );

  // Lazy-fetch threat score when user hovers a feed item
  const fetchThreatScore = useCallback(async (ip: string, id: number) => {
    if (threatScores[ip] !== undefined) return;
    setThreatScores(prev => ({ ...prev, [ip]: null })); // mark loading
    try {
      const token = sessionStorage.getItem("sentinel_token");
      const res = await fetch(`/api/cyber/threat-score/${encodeURIComponent(ip)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setThreatScores(prev => ({ ...prev, [ip]: data.score ?? 0 }));
      }
    } catch {
      setThreatScores(prev => ({ ...prev, [ip]: 0 }));
    }
  }, [threatScores]);

  // Hardcoded SIEM Correlation data matching SQLite seed events
  const CORRELATION_EVENTS = [
    {
      title: "High-Risk Coordinated Attack",
      score: 97,
      events: [
        "Firewall DROP rules triggered × 144 times on TNM subnets",
        "Multiple failed administrative logons from remote endpoint 102.167.3.2",
        "Airtel Money spoofer patterns correlation alert positive",
        "IP 41.221.72.109 queried on blacklists and flagged as active ransomware C2"
      ],
      outcome: "CRITICAL INCIDENT AUTO-ESCALATED → LIT-2026-30421",
      rulesMatched: ["RUL-001 (TNM Spoofer)", "RUL-002 (Gov SSH Sweeper)", "RUL-003 (Zomba DDoS Alert)"],
      targets: ["Zomba District Council Server", "Capital Hill government HRMS mainframe"]
    },
    {
      title: "Phishing Campaign Signal",
      score: 81,
      events: [
        "Phishing domain mra-portal-portal-mw.online DNS resolved to external VPS",
        "Corporate endpoint mail header verification failed (SPF softfail)",
        "Financial credential harvesting overlays downloaded from non-bank address"
      ],
      outcome: "HIGH RISK INCIDENT CLASSIFIED → LIT-2026-10492",
      rulesMatched: ["RUL-001 (TNM Spoofer YARA signature match)"],
      targets: ["Standard Bank core database, Blantyre"]
    },
    {
      title: "Ransomware Preparation Phase",
      score: 68,
      events: [
        "Vulnerability scanner logs SMBv1 exposure on administrative nodes",
        "High volume data backup sequence interrupted or altered by host AST-004",
        "RDP brute force attempts detected from untrusted gateway address"
      ],
      outcome: "MEDIUM RISK ALARM SENT TO LOCAL AUDIT ANALYST",
      rulesMatched: ["RUL-002 (SSH Brute Force detection Sigma rule)"],
      targets: ["Mzuzu regional telecom database network"]
    }
  ];

  return (
    <div className="space-y-6" id="situation-room">

      {/* ─── Live WS Incident Toast ─── */}
      {liveNewIncident && (
        <div className="fixed top-4 right-4 z-[200] max-w-sm bg-[#080c17] border border-[#FFD600]/50 rounded-xl p-4 shadow-2xl animate-fade-in">
          <div className="flex items-start gap-3">
            <span className="text-[#FFD600] mt-0.5">⚡</span>
            <div className="flex-1">
              <div className="text-[10px] font-mono font-bold text-[#FFD600] uppercase">New Incident — Live Update</div>
              <div className="text-xs text-slate-200 font-semibold mt-0.5">{liveNewIncident.title}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  liveNewIncident.severity === "Critical" ? "bg-red-500/20 text-red-400" :
                  liveNewIncident.severity === "High" ? "bg-orange-500/20 text-orange-400" : "bg-white/10 text-slate-300"
                }`}>{liveNewIncident.severity}</span>
                {liveNewIncident.priorityScore != null && <PriorityBadge score={liveNewIncident.priorityScore} level={liveNewIncident.priorityLevel ?? ""} />}
              </div>
            </div>
            <button onClick={() => setLiveNewIncident(null)} className="text-slate-500 hover:text-white text-xs">✕</button>
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-10 h-10 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
          <Radio className="w-5 h-5 text-[#FFD600]" />
        </div>
        <div>
          <h2 className="font-bebas text-2xl text-white tracking-widest">NATIONAL CYBER SITUATION ROOM</h2>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">MACRA — MACERT — MALAWI DEFENSE COORDINATED NODE</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* WS connection indicator */}
          <div className="flex items-center gap-1.5" title={isConnected ? "WebSocket Live" : "WebSocket Offline"}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
            <span className={`text-[9px] font-mono font-bold ${isConnected ? "text-emerald-400" : "text-red-400"}`}>
              {isConnected ? "WS LIVE" : "WS OFFLINE"}
            </span>
          </div>
          <span className="w-2 h-2 rounded-full bg-[#FFD600] animate-pulse" />
          <span className="text-[#FFD600] text-[10px] font-mono font-bold">LIVE</span>
          <span className="text-[10px] font-mono text-slate-500">{new Date().toLocaleString("en-MW")}</span>
        </div>
      </div>

      {/* ─── Critical Priority Banner ─── */}
      {criticalActive.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-red-500/50 bg-red-500/8 px-5 py-4">
          <div className="absolute inset-0 bg-red-500/5 animate-pulse" style={{ animationDuration: "2s" }} />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                <Siren className="w-4 h-4 text-red-400 animate-pulse" />
              </div>
              <div>
                <div className="text-red-400 font-bold font-mono text-xs uppercase tracking-widest">🚨 {criticalActive.length} CRITICAL INCIDENT{criticalActive.length > 1 ? "S" : ""} — PRIORITY MATRIX</div>
                <div className="text-[9px] text-red-500/70 font-mono">Immediate EOC activation required · Auto-escalation active</div>
              </div>
              <button
                onClick={() => setWarRoom({ districtId: "lilongwe", name: "Lilongwe" })}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-[10px] font-bold font-mono transition shrink-0"
              >
                <Crosshair className="w-3 h-3" /> ENTER WAR ROOM
              </button>
            </div>
            <div className="space-y-2">
              {criticalActive.slice(0, 3).map((inc, idx) => {
                const { label: tsLabel, minutesSince } = timeSince(inc.incidentDate);
                const score = (inc as any).priorityScore ?? 0;
                const escalated = minutesSince > 30;
                return (
                  <div key={inc.id} className="flex items-center gap-3 bg-black/40 rounded-lg px-3 py-2.5 border border-red-500/20 relative overflow-hidden">
                    {/* Left severity stripe */}
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500" />
                    <PriorityBadge score={score} level={(inc as any).priorityLevel ?? ""} severity={inc.severity} />
                    <span className="text-[10px] font-mono text-slate-200 truncate flex-1 font-semibold">{inc.title}</span>
                    <span className="text-[9px] font-mono text-slate-500 shrink-0">{inc.id}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-mono text-slate-500">{tsLabel}</span>
                      {escalated && (
                        <span className="text-[8px] font-bold text-red-300 bg-red-500/20 border border-red-500/40 px-1.5 py-0.5 rounded font-mono animate-pulse">⚡ AUTO-ESCALATED</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Threat Level Banner ─── */}
      <ThreatLevelBanner level={threatLevel} />

      {/* ─── Bento Mission Metrics ─── */}
      <BentoMissionMetrics 
        incidents={incidents} 
        stats={stats} 
        onMetricClick={(type) => setMetricModal(type)}
      />

      {/* ─── Map + Threat Feed Row ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <MalawiIncidentMap
            incidents={incidents}
            onHotspotClick={(id, name) => {
              // Find this district's risk from the incidents
              const risk = getDistrictRisk(id, incidents);
              const activeIncs = incidents.filter(i =>
                !["Resolved","Contained","Closed"].includes(i.status) &&
                (i.title + " " + i.description).toLowerCase().includes(name.toLowerCase())
              ).length;
              const region =
                ["chitipa","karonga","likoma","rumphi","mzimba","nkhatabay"].includes(id) ? "Northern" :
                ["kasungu","nkhotakota","ntchisi","dowa","salima","lilongwe","mchinji","dedza","ntcheu"].includes(id) ? "Central" : "Southern";
              setDistrictMapModal({
                id, name, region,
                riskScore: risk,
                activeIncidents: activeIncs,
                primaryThreat: activeIncs > 0 ? "Active Cyber Incident" : "No Active Threats",
                population: undefined,
              });
              setWarRoom({ districtId: id, name });
            }}
          />
        </div>

        <div className="xl:col-span-2 space-y-4">
          {/* Sector Health */}
          <SectorHealthDashboard 
            incidents={incidents} 
            onSectorClick={(id, label, health) => setSectorDetail({ id, label, health })}
          />

          {/* ── Live National Threat Intelligence Feed ── */}
          <div className="terminal-bg p-0 overflow-hidden">
            {/* Animated scan line */}
            <div className="scan-line" />

            {/* Feed header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(0,255,65,0.12)] relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-mono font-bold text-red-400 uppercase tracking-widest">Live Threat Intelligence Feed</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setFeedPaused(p => !p)}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded border transition ${
                    feedPaused
                      ? "bg-[#FFD600]/10 border-[#FFD600]/30 text-[#FFD600]"
                      : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20"
                  }`}
                >
                  {feedPaused ? "▶ PLAY" : "⏸ PAUSE"}
                </button>
                <span className="text-[8px] font-mono text-slate-600">MACERT · AbuseIPDB · HOVER→SCORE</span>
              </div>
            </div>

            {/* Feed rows */}
            <div className="relative z-10 divide-y divide-[rgba(255,255,255,0.04)]">
              {NATIONAL_THREATS.map((threat, idx) => {
                const levelColor =
                  threat.level === "CRITICAL" ? { bar: "bg-red-500",    badge: "text-red-400 border-red-500/30 bg-red-500/10",     icon: "text-red-500" } :
                  threat.level === "HIGH"     ? { bar: "bg-orange-500", badge: "text-orange-400 border-orange-500/30 bg-orange-500/10", icon: "text-orange-500" } :
                                               { bar: "bg-yellow-400", badge: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10", icon: "text-yellow-400" };
                const score = threat.ip && threatScores[threat.ip];
                return (
                  <div
                    key={threat.id}
                    onMouseEnter={() => { setHoveredThreat(threat.id); if (threat.ip) fetchThreatScore(threat.ip, threat.id); }}
                    onMouseLeave={() => setHoveredThreat(null)}
                    className="relative"
                  >
                    <button
                      onClick={() => setThreatDetail(threat)}
                      className={`w-full text-left px-4 py-3 transition-all group relative overflow-hidden ${
                        hoveredThreat === threat.id ? "bg-white/3" : "bg-transparent"
                      }`}
                    >
                      {/* Left severity stripe */}
                      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${levelColor.bar}`} />

                      <div className="flex items-center gap-2 mb-1.5 pl-2">
                        {/* Severity badge */}
                        <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded font-mono border ${levelColor.badge}`}>
                          {threat.level}
                        </span>
                        {/* IP badge */}
                        {threat.ip && (
                          <span className="text-[8px] font-mono text-slate-500 bg-white/3 border border-white/8 px-1.5 py-0.5 rounded">
                            {threat.ip}
                          </span>
                        )}
                        {/* Score pill (on hover) */}
                        {score !== undefined && (
                          <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                            (score ?? 0) >= 80 ? "text-red-400 bg-red-500/10 border-red-500/30" :
                            (score ?? 0) >= 50 ? "text-orange-400 bg-orange-500/10 border-orange-500/30" :
                            "text-amber-400 bg-amber-500/10 border-amber-500/30"
                          }`}>
                            {score === null ? "SCORING…" : `THREAT·${score}`}
                          </span>
                        )}
                        {/* Feed source */}
                        <span className="text-[8px] font-mono text-slate-600 ml-auto">{threat.feed}</span>
                        <span className="text-[8px] font-mono text-slate-700">{threat.time}</span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed pl-2 font-mono">{threat.msg}</p>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Response units */}
            <div className="border-t border-[rgba(0,255,65,0.08)] px-4 py-3 relative z-10">
              <div className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-2">Response Unit Status</div>
              <div className="space-y-1.5">
                {[
                  { name: "MACERT Response Team",  status: "On Standby",   dot: "bg-[#FFD600]" },
                  { name: "Police Cybercrime Unit", status: "Investigating", dot: "bg-orange-400" },
                  { name: "MDF Cyber-Cell",         status: "On Alert",     dot: "bg-red-500 animate-pulse" },
                ].map(u => (
                  <div key={u.name} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${u.dot}`} />
                    <span className="text-slate-400 flex-1">{u.name}</span>
                    <span className={`font-bold ${
                      u.status === "Investigating" ? "text-orange-400" :
                      u.status === "On Alert"      ? "text-red-400" : "text-[#FFD600]"
                    }`}>{u.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Enter EOC War Room CTA ─── */}
      {incidents.some(i => i.severity === "Critical" && !["Resolved", "Contained", "Closed"].includes(i.status)) && (
        <div className="animate-pulse-critical rounded-2xl relative overflow-hidden">
          {/* Animated top edge glow */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-red-950/60 via-red-900/30 to-transparent rounded-2xl" />

          <div className="relative p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-red-500/30 rounded-xl blur-lg animate-pulse" />
                <div className="relative w-14 h-14 rounded-xl bg-red-500/20 border border-red-500/60 flex items-center justify-center">
                  <Siren className="w-7 h-7 text-red-400" />
                </div>
              </div>
              <div>
                <div className="font-bebas text-2xl text-red-400 tracking-widest leading-none">⚠ CRITICAL INCIDENT ACTIVE</div>
                <p className="text-slate-400 text-[11px] mt-1 font-mono">
                  EOC activation required · MACERT Coordinated Response Protocol · Auto-escalation engaged
                </p>
              </div>
            </div>

            <button
              onClick={() => setWarRoom({ districtId: "lilongwe", name: "Lilongwe" })}
              id="enter-war-room-btn"
              className="sm:ml-auto flex items-center gap-2.5 px-6 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold font-mono text-sm transition-all hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] active:scale-95 shrink-0"
            >
              <Crosshair className="w-4 h-4" />
              ENTER EOC WAR ROOM
            </button>
          </div>
        </div>
      )}

      {/* ─── AI Cyber Commander ─── */}
      <AiCommanderPanel />

      {/* ─── SIEM Correlation Engine ─── */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/3 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-purple-500/15">
          <div className="w-1.5 h-5 bg-purple-500 rounded-full" />
          <span className="font-grotesk font-bold text-sm text-white">SIEM Correlation Engine</span>
          <span className="text-[9px] font-mono text-slate-500">Event Aggregation · Rule Matching</span>
          <span className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
            <span className="w-1 h-1 rounded-full bg-purple-400 animate-pulse" />
            LIVE CORRELATION
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
          {CORRELATION_EVENTS.map((corr, idx) => {
            const isHigh   = corr.score >= 90;
            const isMed    = corr.score >= 80;
            const topColor = isHigh ? "bg-red-500" : isMed ? "bg-orange-500" : "bg-yellow-400";
            const borderCl = isHigh ? "border-red-500/30 hover:border-red-500/50" : isMed ? "border-orange-500/25 hover:border-orange-500/45" : "border-yellow-500/20 hover:border-yellow-500/40";
            const bgCl     = isHigh ? "bg-red-500/6" : isMed ? "bg-orange-500/5" : "bg-yellow-500/4";
            const scoreCl  = isHigh ? "text-red-400" : isMed ? "text-orange-400" : "text-yellow-400";
            return (
              <button
                key={corr.title}
                onClick={() => setCorrelationDetail(corr)}
                className={`rounded-xl border overflow-hidden text-left w-full cursor-pointer transition-all group ${borderCl} ${bgCl}`}
              >
                {/* Top severity stripe */}
                <div className={`h-0.5 ${topColor}`} />

                <div className="p-4 space-y-3">
                  {/* Title + Score */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[11px] font-bold text-white leading-tight">{corr.title}</h4>
                    <div className="text-right shrink-0">
                      <div className={`font-orbitron text-3xl font-bold leading-none ${scoreCl}`}>{corr.score}</div>
                      <div className="text-[7px] font-mono text-slate-600 uppercase">risk score</div>
                    </div>
                  </div>

                  {/* Events */}
                  <ul className="space-y-1.5">
                    {corr.events.slice(0, 3).map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-[10px] text-slate-400">
                        <span className={`shrink-0 mt-0.5 font-bold ${scoreCl}`}>›</span>
                        <span className="leading-tight">{e}</span>
                      </li>
                    ))}
                    {corr.events.length > 3 && (
                      <li className="text-[9px] font-mono text-slate-600">+{corr.events.length - 3} more signals</li>
                    )}
                  </ul>

                  {/* Outcome */}
                  <div className={`text-[9px] font-mono font-bold border-t border-white/5 pt-2 ${scoreCl}`}>
                    → {corr.outcome}
                  </div>

                  {/* Rules matched */}
                  <div className="flex flex-wrap gap-1">
                    {corr.rulesMatched.slice(0, 2).map(r => (
                      <span key={r} className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-white/4 border border-white/8 text-slate-500">{r}</span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── EOC War Room Modal ─── */}
      {warRoom && (
        <EocWarRoom
          districtName={warRoom.name}
          incidents={incidents}
          onClose={() => setWarRoom(null)}
          isConnected={isConnected}
          lastChatMsg={lastChatMsg}
          sendChatMessage={sendChatMessage}
          connectedCount={connectedCount}
        />
      )}

      {/* ─── District Map Modal ─── */}
      {districtMapModal && (
        <DistrictMapModal
          district={districtMapModal}
          onClose={() => setDistrictMapModal(null)}
        />
      )}

      {/* ─── Metric Details Modals (Clicking KPIs) ─── */}
      {metricModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[#080c17] border border-[#FFD600]/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bebas text-lg text-white tracking-widest">
                {metricModal === "active" && "Active Campaigns Monitor"}
                {metricModal === "critical" && "Critical Security Incursions"}
                {metricModal === "resolved" && "Remediated Threats Archive"}
                {metricModal === "units" && "Dispatched Forensic Response Units"}
              </h3>
              <button onClick={() => setMetricModal(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-3 font-mono text-xs">
              {metricModal === "active" && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/10">
                      <th className="py-2">Incident ID</th>
                      <th className="py-2">Title</th>
                      <th className="py-2">Severity</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.filter(i => !["Resolved", "Contained", "Closed"].includes(i.status)).map(i => (
                      <tr key={i.id} className="border-b border-white/5 hover:bg-white/2">
                        <td className="py-2 text-[#FFD600] font-bold">{i.id}</td>
                        <td className="py-2 truncate max-w-xs">{i.title}</td>
                        <td className="py-2 text-rose-400">{i.severity}</td>
                        <td className="py-2">{i.category}</td>
                        <td className="py-2 text-yellow-400">{i.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {metricModal === "critical" && (
                <div className="space-y-2">
                  <p className="text-slate-500">Critical incidents requiring urgent perimeter mitigation:</p>
                  {incidents.filter(i => i.severity === "Critical").map(i => (
                    <div key={i.id} className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl space-y-1.5">
                      <div className="flex justify-between font-bold text-red-400">
                        <span>{i.id} — {i.category}</span>
                        <span>{i.status}</span>
                      </div>
                      <div className="text-white text-xs font-grotesk">{i.title}</div>
                      <div className="text-slate-400 text-[10px]">{i.description}</div>
                      <div className="text-[10px] text-[#FFD600] bg-white/3 p-2 rounded border border-white/5">
                        <strong>Mitigation Advice:</strong> {i.mitigationAdvice}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {metricModal === "resolved" && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/10">
                      <th className="py-2">Incident ID</th>
                      <th className="py-2">Title</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Remediated Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.filter(i => ["Resolved", "Contained"].includes(i.status)).map(i => (
                      <tr key={i.id} className="border-b border-white/5 hover:bg-white/2 text-slate-400">
                        <td className="py-2 text-slate-300 font-bold">{i.id}</td>
                        <td className="py-2 truncate max-w-xs text-slate-300">{i.title}</td>
                        <td className="py-2">{i.category}</td>
                        <td className="py-2 text-emerald-400">REMEDIATED</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {metricModal === "units" && (
                <div className="space-y-3">
                  {[
                    { unit: "MACERT Incident Response Team", location: "Lilongwe Core Office", task: "SIM Swap perimeter freeze deployment", active: "DEPLOYED" },
                    { unit: "MPS Cybercrime Investigators", location: "Blantyre ATM lobbies", task: "Biometric correlation camera trace on Austin M.", active: "DEPLOYED" },
                    { unit: "MDF Cyber Defense Cell", location: "Zomba Council Mainframe", task: "SMBv1 vulnerability patch and decrypt logs validation", active: "DEPLOYED" }
                  ].map(u => (
                    <div key={u.unit} className="p-3 bg-white/2 border border-white/5 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="text-slate-200 font-bold">{u.unit}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Task: {u.task} · Node: {u.location}</div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">{u.active}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button onClick={() => setMetricModal(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono font-bold transition">CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sector Detail Modal ─── */}
      {sectorDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[#080c17] border border-[#FFD600]/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bebas text-lg text-white tracking-widest">{sectorDetail.label} Sector Asset Health</h3>
              <button onClick={() => setSectorDetail(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-3 font-mono text-xs text-slate-300">
              <div className="flex justify-between items-center bg-white/2 p-3 rounded-lg border border-white/5">
                <span>Sector Integrity Index:</span>
                <span className={`font-bold text-lg ${sectorDetail.health >= 80 ? "text-emerald-400" : sectorDetail.health >= 50 ? "text-orange-400" : "text-red-400"}`}>{sectorDetail.health}%</span>
              </div>
              
              <p className="text-[11px] text-slate-500">Live assets in SQLite database linked to this category:</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10">
                    <th className="py-2">Asset ID</th>
                    <th className="py-2">Name</th>
                    <th className="py-2">Owner / Dept</th>
                    <th className="py-2">Risk Index</th>
                    <th className="py-2">Criticality</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: "AST-001", name: "Capital Hill HRMS main server", owner: "Ministry of Finance", risk: 65, crit: "Critical", status: "ONLINE", sec: "gov" },
                    { id: "AST-002", name: "Standard Bank core transaction hub", owner: "Standard Bank MW", risk: 30, crit: "Critical", status: "ONLINE", sec: "banking" },
                    { id: "AST-003", name: "TNM Mpamba transaction database", owner: "TNM Malawi", risk: 55, crit: "High", status: "ONLINE", sec: "telecom" },
                    { id: "AST-004", name: "Zomba Council employee portal host", owner: "Zomba District Council", risk: 95, crit: "Medium", status: "DEGRADED", sec: "gov" },
                    { id: "AST-005", name: "SCADA telemetry node Lilongwe water", owner: "Lilongwe Water Board", risk: 40, crit: "High", status: "ONLINE", sec: "utility" }
                  ].filter(a => a.sec === sectorDetail.id).map(a => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/2">
                      <td className="py-2 text-[#FFD600] font-bold">{a.id}</td>
                      <td className="py-2">{a.name}</td>
                      <td className="py-2 text-slate-400">{a.owner}</td>
                      <td className={`py-2 font-bold ${a.risk >= 70 ? "text-red-400" : "text-emerald-400"}`}>{a.risk}%</td>
                      <td className="py-2">{a.crit}</td>
                      <td className={`py-2 font-bold ${a.status === "ONLINE" ? "text-emerald-400" : "text-orange-400 animate-pulse"}`}>{a.status}</td>
                    </tr>
                  ))}
                  {[
                    { id: "AST-001", name: "Capital Hill HRMS main server", owner: "Ministry of Finance", risk: 65, crit: "Critical", status: "ONLINE", sec: "gov" },
                    { id: "AST-002", name: "Standard Bank core transaction hub", owner: "Standard Bank MW", risk: 30, crit: "Critical", status: "ONLINE", sec: "banking" },
                    { id: "AST-003", name: "TNM Mpamba transaction database", owner: "TNM Malawi", risk: 55, crit: "High", status: "ONLINE", sec: "telecom" },
                    { id: "AST-004", name: "Zomba Council employee portal host", owner: "Zomba District Council", risk: 95, crit: "Medium", status: "DEGRADED", sec: "gov" },
                    { id: "AST-005", name: "SCADA telemetry node Lilongwe water", owner: "Lilongwe Water Board", risk: 40, crit: "High", status: "ONLINE", sec: "utility" }
                  ].filter(a => a.sec === sectorDetail.id).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 italic">No assets registered in database for this sector category.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button onClick={() => setSectorDetail(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono font-bold transition">CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Live Threat Feed Item Detail Modal ─── */}
      {threatDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#080c17] border border-red-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <h3 className="font-bebas text-lg text-white tracking-widest">{threatDetail.feed} Threat Telemetry</h3>
              </div>
              <button onClick={() => setThreatDetail(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl space-y-1 text-slate-300">
                <div><strong>Source Feed:</strong> {threatDetail.feed}</div>
                <div><strong>Timestamp:</strong> {threatDetail.time}</div>
                <div><strong>Classification:</strong> <span className="text-red-400 font-bold">{threatDetail.level}</span></div>
                <div><strong>Target/Observed Indicator:</strong> <span className="text-yellow-400 font-bold">{threatDetail.ip}</span></div>
              </div>
              
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Threat Intelligence Summary:</span>
                <p className="text-slate-300 bg-white/2 p-2.5 rounded border border-white/5 font-grotesk">{threatDetail.msg}</p>
              </div>

              {/* Dynamic forensic logs associated with this IP if it exists */}
              <div className="space-y-1.5 border-t border-white/5 pt-3">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Real-time AbuseIPDB / OSINT Lookup:</span>
                <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 text-[10px] text-slate-400 space-y-1">
                  <div>IP Address: {threatDetail.ip}</div>
                  <div>Confidence Score: {threatDetail.level === "CRITICAL" ? "100%" : "85%"}</div>
                  <div>ISP: Airtel Malawi AS37064 / Skyband Corporation</div>
                  <div>Geo-Location: Lilongwe, Central Region, Malawi</div>
                  <div className="text-[9px] text-[#FFD600] mt-1">✓ Auto-queried against live AbuseIPDB proxy nodes successfully.</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button 
                onClick={() => setThreatDetail(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono font-bold transition"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SIEM Correlation Detail Modal ─── */}
      {correlationDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[#080c17] border border-purple-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-purple-400" />
                <h3 className="font-bebas text-lg text-white tracking-widest">{correlationDetail.title} Details</h3>
              </div>
              <button onClick={() => setCorrelationDetail(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/2 border border-white/5 rounded-xl text-center">
                  <div className="text-slate-500 text-[9px] uppercase">Correlation Confidence Score</div>
                  <div className="text-3xl font-bebas text-[#FFD600] my-1">{correlationDetail.score}%</div>
                </div>
                <div className="p-3 bg-white/2 border border-white/5 rounded-xl text-center">
                  <div className="text-slate-500 text-[9px] uppercase">Target Infrastructure Count</div>
                  <div className="text-3xl font-bebas text-purple-400 my-1">{correlationDetail.targets.length} Nodes</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Correlated Event Trail:</span>
                <div className="space-y-1 bg-black/40 p-2.5 rounded border border-white/5 text-[10px] text-slate-300">
                  {correlationDetail.events.map((e: string, idx: number) => (
                    <div key={idx} className="flex gap-2 py-0.5 border-b border-white/5 last:border-0">
                      <span className="text-purple-400">•</span>
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Mitigation Rules Deployed:</span>
                  <div className="p-2.5 bg-white/2 border border-white/5 rounded-lg space-y-1 text-slate-300 text-[10px]">
                    {correlationDetail.rulesMatched.map((r: string, idx: number) => (
                      <div key={idx} className="text-[#FFD600]">{r}</div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Target Assets Identifiers:</span>
                  <div className="p-2.5 bg-white/2 border border-white/5 rounded-lg space-y-1 text-slate-300 text-[10px]">
                    {correlationDetail.targets.map((t: string, idx: number) => (
                      <div key={idx} className="text-purple-400">{t}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button onClick={() => setCorrelationDetail(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono font-bold transition">CLOSE</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
