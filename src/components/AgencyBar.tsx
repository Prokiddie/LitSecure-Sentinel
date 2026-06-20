/**
 * LitSecure Sentinel — AgencyBar
 * Items 1, 5, 10: Organization logo badges with hover stats,
 * agency color system, and live presence indicators.
 */
import React, { useState, useEffect } from "react";
import { Shield, Radio, Landmark, Building2, Wifi } from "lucide-react";

// ─── Agency Config ─────────────────────────────────────────────────────────

export type AgencyId = "ALL" | "MACRA" | "POLICE" | "MOD" | "MACERT" | "RBM" | "MOF";

export interface Agency {
  id: AgencyId;
  name: string;
  fullName: string;
  color: string;
  glowColor: string;
  borderColor: string;
  bgColor: string;
  logo?: string;        // path to /public image
  Icon?: React.ElementType;
  uptime: string;
  activeCases: number;
  lastActivity: string;
  presence: "online" | "responding" | "standby" | "offline";
}

export const AGENCIES: Agency[] = [
  {
    id: "MACRA",
    name: "MACRA",
    fullName: "Malawi Communications Regulatory Authority",
    color: "#a855f7",
    glowColor: "rgba(168,85,247,0.35)",
    borderColor: "border-purple-500/40",
    bgColor: "bg-purple-500/10",
    logo: "/macra_logo.png",
    uptime: "98.7%",
    activeCases: 4,
    lastActivity: "2 min ago",
    presence: "online",
  },
  {
    id: "POLICE",
    name: "Police",
    fullName: "Malawi Police Service — Cybercrime Unit",
    color: "#f97316",
    glowColor: "rgba(249,115,22,0.35)",
    borderColor: "border-orange-500/40",
    bgColor: "bg-orange-500/10",
    Icon: Shield,
    uptime: "99.1%",
    activeCases: 3,
    lastActivity: "5 min ago",
    presence: "online",
  },
  {
    id: "MOD",
    name: "MOD",
    fullName: "Malawi Defence Force — Cyber Cell",
    color: "#ef4444",
    glowColor: "rgba(139,0,0,0.5)",
    borderColor: "border-red-800/50",
    bgColor: "bg-red-900/15",
    Icon: Radio,
    uptime: "99.9%",
    activeCases: 1,
    lastActivity: "12 min ago",
    presence: "standby",
  },
  {
    id: "MACERT",
    name: "MACERT",
    fullName: "Malawi Computer Emergency Response Team",
    color: "#22c55e",
    glowColor: "rgba(34,197,94,0.35)",
    borderColor: "border-green-500/40",
    bgColor: "bg-green-500/10",
    logo: "/macert_logo.png",
    uptime: "97.4%",
    activeCases: 2,
    lastActivity: "Responding",
    presence: "responding",
  },
  {
    id: "RBM",
    name: "RBM",
    fullName: "Reserve Bank of Malawi — Financial Intelligence",
    color: "#3b82f6",
    glowColor: "rgba(59,130,246,0.35)",
    borderColor: "border-blue-500/40",
    bgColor: "bg-blue-500/10",
    Icon: Landmark,
    uptime: "99.8%",
    activeCases: 2,
    lastActivity: "8 min ago",
    presence: "online",
  },
  {
    id: "MOF",
    name: "MoF",
    fullName: "Ministry of Finance — Financial Crime Division",
    color: "#eab308",
    glowColor: "rgba(234,179,8,0.3)",
    borderColor: "border-yellow-500/40",
    bgColor: "bg-yellow-500/10",
    Icon: Building2,
    uptime: "96.2%",
    activeCases: 1,
    lastActivity: "Scheduled Maint.",
    presence: "offline",
  },
];

const PRESENCE_DOT: Record<Agency["presence"], string> = {
  online:     "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
  responding: "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.7)] animate-pulse",
  standby:    "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]",
  offline:    "bg-slate-600",
};

const PRESENCE_LABEL: Record<Agency["presence"], string> = {
  online:     "Online",
  responding: "Responding",
  standby:    "Standby",
  offline:    "Offline",
};

// ─── Agency Logo Badge ──────────────────────────────────────────────────────

function AgencyBadge({
  agency,
  active,
  onClick,
}: {
  key?: any;
  agency: Agency;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        style={{
          borderColor: active ? agency.color : undefined,
          boxShadow: active ? `0 0 18px ${agency.glowColor}` : undefined,
        }}
        className={`
          relative flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all duration-200
          ${active
            ? `${agency.bgColor} ${agency.borderColor}`
            : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5"
          }
        `}
      >
        {/* Presence dot */}
        <span
          className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-[#05080F] ${PRESENCE_DOT[agency.presence]}`}
        />

        {/* Logo or Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
          style={{ background: active ? `${agency.color}20` : "rgba(255,255,255,0.05)" }}
        >
          {agency.logo ? (
            <img
              src={agency.logo}
              alt={agency.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to icon if image fails
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : agency.Icon ? (
            <agency.Icon
              className="w-4 h-4"
              style={{ color: active ? agency.color : "#94a3b8" }}
            />
          ) : (
            <Wifi
              className="w-4 h-4"
              style={{ color: active ? agency.color : "#94a3b8" }}
            />
          )}
        </div>

        {/* Name */}
        <span
          className="text-[9px] font-mono font-bold uppercase tracking-wider"
          style={{ color: active ? agency.color : "#64748b" }}
        >
          {agency.name}
        </span>

        {/* Active case count bubble */}
        {agency.activeCases > 0 && (
          <span
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-mono font-bold px-1.5 rounded-full border"
            style={{
              color: agency.color,
              borderColor: `${agency.color}40`,
              background: `${agency.color}18`,
            }}
          >
            {agency.activeCases}
          </span>
        )}
      </button>

      {/* Hover Tooltip Card */}
      {hovered && (
        <div
          className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-50 w-56 rounded-xl border bg-[#05080F] shadow-2xl p-3 space-y-2 pointer-events-none"
          style={{
            borderColor: `${agency.color}40`,
            boxShadow: `0 8px 32px ${agency.glowColor}, 0 0 0 1px ${agency.color}20`,
          }}
        >
          {/* Arrow */}
          <div
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t"
            style={{ borderColor: `${agency.color}40`, background: "#05080F" }}
          />

          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${PRESENCE_DOT[agency.presence]}`}
            />
            <span
              className="text-[9px] font-mono font-bold uppercase"
              style={{ color: agency.color }}
            >
              {PRESENCE_LABEL[agency.presence]}
            </span>
          </div>

          <div className="text-[10px] font-semibold text-slate-200 leading-tight">
            {agency.fullName}
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/5">
            {[
              { label: "Uptime",      val: agency.uptime },
              { label: "Active Cases", val: `${agency.activeCases}` },
              { label: "Last Activity", val: agency.lastActivity },
              { label: "Status",       val: PRESENCE_LABEL[agency.presence] },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/3 rounded-lg p-1.5">
                <div className="text-[7px] font-mono text-slate-600 uppercase">{label}</div>
                <div className="text-[10px] font-mono font-bold text-slate-200">{val}</div>
              </div>
            ))}
          </div>

          <div
            className="text-[8px] font-mono text-center py-0.5 rounded"
            style={{ color: agency.color, background: `${agency.color}15` }}
          >
            Click to filter dashboard → {agency.name} incidents
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Presence Strip ────────────────────────────────────────────────────

function PresenceStrip() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2">
      {AGENCIES.map(ag => (
        <div key={ag.id} className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${PRESENCE_DOT[ag.presence]}`} />
          <span className="text-[9px] font-mono text-slate-500">
            <span style={{ color: ag.color }} className="font-bold">{ag.name}</span>
            {" · "}
            <span className={ag.presence === "offline" ? "text-slate-600" : "text-slate-400"}>
              {ag.presence === "offline" ? "Offline" : ag.lastActivity}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main AgencyBar ─────────────────────────────────────────────────────────

interface AgencyBarProps {
  activeAgency: AgencyId;
  onAgencyChange: (id: AgencyId) => void;
}

export default function AgencyBar({ activeAgency, onAgencyChange }: AgencyBarProps) {
  return (
    <div className="space-y-3">
      {/* Agency badge row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* "ALL" pill */}
        <button
          onClick={() => onAgencyChange("ALL")}
          className={`h-[72px] px-4 rounded-xl border text-[9px] font-mono font-bold uppercase tracking-wider transition-all duration-200 flex flex-col items-center justify-center gap-1 ${
            activeAgency === "ALL"
              ? "border-[#FFD600]/50 bg-[#FFD600]/10 text-[#FFD600] shadow-[0_0_16px_rgba(255,214,0,0.2)]"
              : "border-white/8 bg-white/3 text-slate-500 hover:text-slate-300 hover:border-white/15"
          }`}
        >
          <span className="text-lg">🏛</span>
          <span>ALL</span>
        </button>

        {AGENCIES.map(ag => (
          <AgencyBadge
            key={ag.id}
            agency={ag}
            active={activeAgency === ag.id}
            onClick={() => onAgencyChange(activeAgency === ag.id ? "ALL" : ag.id)}
          />
        ))}

        {/* Live connection status */}
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
          <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
            Live Connection: All Units
          </span>
        </div>
      </div>

      {/* Presence activity strip */}
      <PresenceStrip />
    </div>
  );
}
