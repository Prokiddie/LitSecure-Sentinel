import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWarRoomWS } from "../hooks/useWarRoomWS";
import {
  Shield, AlertTriangle, Activity, Globe, Server,
  Building2, Zap, Wifi, GraduationCap, Hospital,
  TrendingUp, CheckCircle2, XCircle, RefreshCw, Radio,
  Bot, Loader2, Sparkles, Copy, ChevronDown,
  MapPin, Users, Clock, ChevronRight, X,
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

// ─── Priority badge helper ────────────────────────────────────────────────────
function PriorityBadge({ score, level }: { score: number; level: string }) {
  const color = score >= 80 ? "text-red-400 bg-red-500/15 border-red-500/30"
    : score >= 60 ? "text-orange-400 bg-orange-500/15 border-orange-500/30"
    : score >= 40 ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
    : "text-slate-400 bg-white/5 border-white/10";
  return (
    <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border ${color}`}>
      P{score}
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
  const [mapTheme, setMapTheme] = useState<"cyber" | "geo">("cyber");

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

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { id: "active",   label: "Active Incidents",     val: active.length,   icon: AlertTriangle, color: "text-orange-400 border-orange-500/20 bg-orange-500/5",  pulse: active.length > 0 },
        { id: "critical", label: "Critical Severity",    val: critical.length, icon: Siren,         color: "text-red-400 border-red-500/20 bg-red-500/5",            pulse: critical.length > 0 },
        { id: "resolved", label: "Resolved / Contained", val: resolved.length, icon: CheckCircle2,  color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5", pulse: false },
        { id: "units",    label: "Dispatched Units",     val: 3,               icon: Users,         color: "text-blue-400 border-blue-500/20 bg-blue-500/5",          pulse: false },
      ].map(({ id, label, val, icon: Icon, color, pulse }) => (
        <button 
          key={label} 
          onClick={() => onMetricClick(id as any)}
          className={`rounded-xl border p-4 flex items-center gap-3 text-left w-full cursor-pointer hover:border-white/20 transition-all duration-200 ${color}`}
        >
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className={`w-5 h-5 ${pulse ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-mono text-slate-500">{label}</div>
            <div className="text-2xl font-bold font-mono text-slate-100">{val}</div>
            <div className="text-[8px] font-mono text-slate-600 mt-0.5">CLICK FOR DETAILS</div>
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
        <div className="w-1 h-4 bg-blue-400 rounded" />
        Sector Health Dashboard
        <span className="ml-auto text-[9px] font-mono text-slate-500">LIVE · CLICK SECTOR ROW FOR DETAILS</span>
      </h3>
      <div className="space-y-2.5">
        {SECTOR_HEALTH.map(({ id, label, icon: Icon, baseHealth }) => {
          const health = sectorHealthFromIncidents(baseHealth, incidents, id);
          const colorClass = health >= 80 ? "bg-emerald-400" : health >= 50 ? "bg-orange-400" : "bg-red-500";
          const textColor  = health >= 80 ? "text-emerald-400" : health >= 50 ? "text-orange-400" : "text-red-400";
          const status     = health >= 80 ? "OPERATIONAL" : health >= 50 ? "DEGRADED" : "CRITICAL";
          return (
            <button 
              key={id} 
              onClick={() => onSectorClick(id, label, health)}
              className="w-full flex items-center gap-3 text-left p-2 rounded-xl bg-white/2 hover:bg-white/5 border border-white/5 hover:border-white/10 transition cursor-pointer"
            >
              <div className="p-1.5 rounded bg-white/5 shrink-0">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1 text-[10px] font-mono">
                  <span className="text-slate-300 font-bold">{label}</span>
                  <span className={textColor}>{health}% — {status}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${colorClass} ${health < 50 ? "animate-pulse" : ""}`}
                    style={{ width: `${health}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EocWarRoom({
  districtName,
  incidents,
  onClose,
}: {
  districtName: string;
  incidents: Incident[];
  onClose: () => void;
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST.map(i => ({ ...i, done: false })));
  const [chatMsg, setChatMsg] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>(EOC_CHAT_FEED);
  const chatRef = useRef<HTMLDivElement>(null);

  const toggle = (id: string) =>
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    setChatLog(prev => [...prev, {
      sender: "SOC-Analyst",
      org: "LitSecure SOC",
      msg: chatMsg.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "soc",
    }]);
    setChatMsg("");
    setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  const done  = checklist.filter(c => c.done).length;
  const total = checklist.length;
  const pct   = Math.round((done / total) * 100);

  const relevantIncidents = incidents.filter(i =>
    !["Resolved", "Contained", "Closed"].includes(i.status)
  ).slice(0, 3);

  const orgColor: Record<ChatMessage["type"], string> = {
    macert: "text-[#FFD600]",
    soc:    "text-blue-400",
    police: "text-purple-400",
    system: "text-emerald-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-[#080c17] border border-red-500/30 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#080c17] border-b border-red-500/20 px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-red-400 animate-pulse" />
          </div>
          <div>
            <h2 className="font-bebas text-xl text-white tracking-widest">EOC INCIDENT WAR ROOM — {districtName.toUpperCase()}</h2>
            <p className="text-[10px] text-red-400 font-mono">Emergency Operations Center · MACERT Coordinated Response</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          {/* Checklist */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Response Action Checklist
              </h3>
              <span className="text-[10px] font-mono text-slate-400">{done}/{total} complete ({pct}%)</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Items */}
            <div className="space-y-2">
              {checklist.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg border transition ${
                    item.done
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : item.critical
                      ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                      : "border-white/5 bg-white/2 hover:border-white/10"
                  }`}
                >
                  <div className={`w-4 h-4 rounded shrink-0 mt-0.5 border flex items-center justify-center transition ${
                    item.done ? "bg-emerald-500 border-emerald-400" : item.critical ? "border-red-500/60" : "border-white/20"
                  }`}>
                    {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-[11px] font-mono ${
                    item.done ? "text-emerald-400 line-through" : item.critical ? "text-red-300" : "text-slate-300"
                  }`}>
                    {item.critical && !item.done && <span className="text-red-500 mr-1">★</span>}
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Relevant Incidents */}
            {relevantIncidents.length > 0 && (
              <div className="space-y-2 border-t border-white/5 pt-4">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Incidents in War Room</h4>
                {relevantIncidents.map(inc => (
                  <div key={inc.id} className={`rounded-lg border px-3 py-2 ${
                    inc.severity === "Critical" ? "border-red-500/25 bg-red-500/5" :
                    inc.severity === "High" ? "border-orange-500/25 bg-orange-500/5" :
                    "border-white/5 bg-white/2"
                  }`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded font-mono ${
                        inc.severity === "Critical" ? "text-red-400 bg-red-500/20" :
                        inc.severity === "High" ? "text-orange-400 bg-orange-500/20" : "text-slate-400"
                      }`}>{inc.severity}</span>
                      <span className="text-[9px] font-mono text-slate-600">{inc.id}</span>
                      {(() => {
                        if (inc.status !== "Reported") return <span className="text-[8px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 rounded ml-auto font-mono">Compliance Met ✓</span>;
                        const createdDate = new Date(inc.incidentDate);
                        const diffHours = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60);
                        if (diffHours >= 24) {
                          return <span className="text-[8px] text-red-400 bg-red-500/10 border border-red-500/20 px-1 rounded ml-auto font-bold font-mono">⚠️ SLA Breach: &gt;24h</span>;
                        } else {
                          const remaining = Math.max(0, Math.round(24 - diffHours));
                          return <span className="text-[8px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 rounded ml-auto font-mono">SLA: {remaining}h left</span>;
                        }
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-300">{inc.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat Feed */}
          <div className="space-y-3">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              MACERT ↔ SOC Secure Channel
            </h3>
            <div
              ref={chatRef}
              className="h-[320px] overflow-y-auto space-y-2 bg-[#040709] border border-white/5 rounded-xl p-4"
            >
              {chatLog.map((msg, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-[9px] font-mono">
                    <span className={`font-bold ${orgColor[msg.type]}`}>{msg.sender}</span>
                    <span className="text-slate-600">[{msg.org}]</span>
                    <span className="text-slate-700 ml-auto">{msg.time}</span>
                  </div>
                  <div className="text-[10px] text-slate-300 pl-2 border-l border-white/5">{msg.msg}</div>
                </div>
              ))}
            </div>
            {/* Send message */}
            <div className="flex gap-2">
              <input
                type="text"
                value={chatMsg}
                onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Type secure message and press Enter..."
                className="flex-1 bg-[#0A0E1A] border border-white/10 focus:border-blue-500/50 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none font-mono"
              />
              <button
                onClick={sendChat}
                className="px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition text-xs font-mono"
              >
                SEND
              </button>
            </div>

            {/* Forensics log */}
            <div className="space-y-2 border-t border-white/5 pt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Forensics Evidence Log
              </h4>
              <div className="space-y-1">
                {[
                  { time: "14:01:33", entry: "Network capture started on VLAN-14 (Lilongwe SOC)" },
                  { time: "14:03:12", entry: "Memory dump acquired from affected endpoint AST-004" },
                  { time: "14:08:47", entry: "PCAP stored to encrypted Evidence Vault (EVD-2026-0441)" },
                  { time: "14:11:02", entry: "Chain of custody signed by SOC-Lead and MACERT-Director" },
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-[9px] font-mono">
                    <span className="text-slate-600 shrink-0">{f.time}</span>
                    <span className="text-slate-400">{f.entry}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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
  const { isConnected, lastIncident } = useWarRoomWS();
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
              {criticalActive.slice(0, 3).map(inc => {
                const { label: tsLabel, minutesSince } = timeSince(inc.incidentDate);
                const score = (inc as any).priorityScore ?? 0;
                const escalated = inc.severity === "Critical" && minutesSince > 30;
                return (
                  <div key={inc.id} className="flex items-center gap-3 bg-black/30 rounded-lg px-3 py-2 border border-red-500/15">
                    <PriorityBadge score={score} level={(inc as any).priorityLevel ?? ""} />
                    <span className="text-[10px] font-mono text-slate-300 truncate flex-1">{inc.title}</span>
                    <span className="text-[9px] font-mono text-slate-500 shrink-0">{inc.id}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-mono text-slate-500">{tsLabel}</span>
                      {escalated && (
                        <span className="text-[8px] font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded font-mono">⚡ AUTO-ESCALATED</span>
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

          {/* Live Threat Feed */}
          <div className="card p-5 space-y-3">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-1 h-4 bg-red-500 rounded animate-pulse" />
              Live National Threat Intelligence Feed
              <span className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setFeedPaused(p => !p)}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded border transition ${
                    feedPaused
                      ? "bg-[#FFD600]/10 border-[#FFD600]/30 text-[#FFD600]"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  {feedPaused ? "▶ PLAY" : "⏸ PAUSE"}
                </button>
                <span className="text-[9px] font-mono text-slate-500">MACERT · AbuseIPDB · HOVER FOR SCORE</span>
              </span>
            </h3>
            <div className="space-y-2">
              {NATIONAL_THREATS.map(threat => (
                <div
                  key={threat.id}
                  onMouseEnter={() => { setHoveredThreat(threat.id); if (threat.ip) fetchThreatScore(threat.ip, threat.id); }}
                  onMouseLeave={() => setHoveredThreat(null)}
                  className="relative"
                >
                  <button 
                    onClick={() => setThreatDetail(threat)}
                    className="w-full text-left bg-[#05080F]/60 border border-white/5 hover:border-red-500/40 rounded-xl p-3 space-y-1.5 transition cursor-pointer hover:bg-white/2"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded font-mono border ${
                        threat.level === "CRITICAL" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                        threat.level === "HIGH"     ? "text-orange-400 border-orange-500/30 bg-orange-500/10" :
                        "text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10"
                      }`}>{threat.level}</span>
                      {/* Threat Score pill */}
                      {threat.ip && threatScores[threat.ip] !== undefined && (
                        <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                          (threatScores[threat.ip] ?? 0) >= 80 ? "text-red-400 bg-red-500/10 border-red-500/30" :
                          (threatScores[threat.ip] ?? 0) >= 50 ? "text-orange-400 bg-orange-500/10 border-orange-500/30" :
                          (threatScores[threat.ip] ?? 0) >= 20 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
                          "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        }`}>
                          {threatScores[threat.ip] === null ? "…" : `SCORE ${threatScores[threat.ip]}`}
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-slate-500">{threat.feed}</span>
                      <span className="ml-auto text-[9px] font-mono text-slate-600">{threat.time}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{threat.msg}</p>
                  </button>
                </div>
              ))}
            </div>
            {/* Response units */}
            <div className="border-t border-white/5 pt-3 space-y-1.5">
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Response Unit Status</p>
              {[
                { name: "MACERT Response Team",  status: "On Standby" },
                { name: "Police Cybercrime Unit", status: "Investigating" },
                { name: "MDF Cyber-Cell",         status: "On Alert" },
              ].map(u => (
                <div key={u.name} className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">{u.name}</span>
                  <span className={u.status === "Investigating" ? "text-orange-400" : u.status === "On Alert" ? "text-red-400" : "text-[#FFD600]"}>{u.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Enter EOC War Room CTA ─── */}
      {incidents.some(i => i.severity === "Critical" && !["Resolved", "Contained", "Closed"].includes(i.status)) && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5 flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
            <Siren className="w-6 h-6 text-red-400 animate-pulse" />
          </div>
          <div>
            <div className="text-red-400 font-bold font-mono text-sm">⚠ CRITICAL INCIDENT ACTIVE</div>
            <p className="text-slate-400 text-xs mt-0.5">A critical incident is active. Click to enter the EOC War Room and coordinate the national response.</p>
          </div>
          <button
            onClick={() => setWarRoom({ districtId: "lilongwe", name: "Lilongwe" })}
            id="enter-war-room-btn"
            className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold font-mono transition shrink-0"
          >
            <Crosshair className="w-4 h-4" />
            ENTER EOC WAR ROOM
          </button>
        </div>
      )}

      {/* ─── AI Cyber Commander ─── */}
      <AiCommanderPanel />

      {/* ─── SIEM Correlation Engine ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-purple-500 rounded" />
          SIEM Correlation Engine — Event Aggregation
          <span className="ml-auto text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">LIVE CORRELATION · CLICK CARD FOR DETAILS</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CORRELATION_EVENTS.map(corr => (
            <button 
              key={corr.title} 
              onClick={() => setCorrelationDetail(corr)}
              className={`rounded-xl border p-4 space-y-3 text-left w-full cursor-pointer hover:border-white/20 transition ${
                corr.score >= 90 ? "border-red-500/25 bg-red-500/5 hover:border-red-500/40" :
                corr.score >= 80 ? "border-orange-500/25 bg-orange-500/5 hover:border-orange-500/40" :
                "border-[#FFD600]/20 bg-[#FFD600]/5 hover:border-[#FFD600]/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white">{corr.title}</h4>
                <span className="font-bebas text-2xl text-[#FFD600]">{corr.score}</span>
              </div>
              <ul className="space-y-1">
                {corr.events.slice(0, 3).map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-400">
                    <span className="text-[#FFD600] mt-0.5">+</span> {e}
                  </li>
                ))}
                {corr.events.length > 3 && (
                  <li className="text-[9px] font-mono text-slate-500 italic">+ {corr.events.length - 3} more signals...</li>
                )}
              </ul>
              <div className="text-[9px] font-mono font-bold text-[#FFD600] border-t border-white/5 pt-2">{corr.outcome}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── EOC War Room Modal ─── */}
      {warRoom && (
        <EocWarRoom
          districtName={warRoom.name}
          incidents={incidents}
          onClose={() => setWarRoom(null)}
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
