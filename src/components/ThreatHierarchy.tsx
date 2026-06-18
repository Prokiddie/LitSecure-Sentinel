import React, { useState, useEffect } from "react";
import {
  Brain, ChevronRight, Shield,
  Activity, Flame, Target, Eye
} from "lucide-react";
import { Incident } from "../types";

interface ThreatHierarchyProps {
  incidents: Incident[];
  onSelectIncident?: (id: string) => void;
}

// ── Gravity Score: composite of severity + recency + status ─────────────────
function calcGravityScore(incident: Incident): number {
  const severityMap: Record<string, number> = {
    Critical: 100, High: 70, Medium: 40, Low: 15,
    critical: 100, high: 70, medium: 40, low: 15,
  };
  const statusMod: Record<string, number> = {
    Investigating: 1.2, Reported: 1.0, Contained: 0.5,
    Resolved: 0.2, Closed: 0.1,
  };
  const baseSeverity = severityMap[incident.severity] ?? 30;
  const statusMultiplier = statusMod[incident.status] ?? 1;
  // Use incidentDate (the Incident type field) for recency calculation
  const ageHours = (Date.now() - new Date(incident.incidentDate).getTime()) / 3_600_000;
  const recencyBonus = Math.max(0, 30 - ageHours) * 0.5;
  return Math.min(100, Math.round(baseSeverity * statusMultiplier + recencyBonus));
}

type HierarchyLevel = {
  level: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  glow: string;
  ring: string;
  textColor: string;
  bgColor: string;
  badgeColor: string;
  severities: string[];
  statuses: string[];
  pulse: string;
};

const HIERARCHY_LEVELS: HierarchyLevel[] = [
  {
    level: 1,
    title: "NATIONAL CRITICAL",
    subtitle: "Immediate Response Required",
    icon: Flame,
    color: "border-red-500",
    glow: "shadow-[0_0_30px_rgba(239,68,68,0.25)]",
    ring: "ring-1 ring-red-500/40",
    textColor: "text-red-400",
    bgColor: "bg-red-500/8",
    badgeColor: "bg-red-500 text-white",
    severities: ["Critical", "critical"],
    statuses: ["Investigating", "Reported"],
    pulse: "animate-pulse-critical",
  },
  {
    level: 2,
    title: "ACTIVE INTRUSION",
    subtitle: "Under Active Investigation",
    icon: Target,
    color: "border-orange-500",
    glow: "shadow-[0_0_20px_rgba(251,146,60,0.2)]",
    ring: "ring-1 ring-orange-500/30",
    textColor: "text-orange-400",
    bgColor: "bg-orange-500/6",
    badgeColor: "bg-orange-500 text-white",
    severities: ["High", "high"],
    statuses: ["Investigating", "Reported", "Contained"],
    pulse: "animate-pulse",
  },
  {
    level: 3,
    title: "SUSPICIOUS ACTIVITY",
    subtitle: "Monitoring & Assessment",
    icon: Eye,
    color: "border-yellow-500",
    glow: "",
    ring: "ring-1 ring-yellow-500/20",
    textColor: "text-yellow-400",
    bgColor: "bg-yellow-500/5",
    badgeColor: "bg-yellow-500/80 text-black",
    severities: ["Medium", "medium"],
    statuses: ["Reported", "Investigating", "Contained"],
    pulse: "",
  },
  {
    level: 4,
    title: "BACKGROUND NOISE",
    subtitle: "Logged & Monitored",
    icon: Activity,
    color: "border-blue-500/50",
    glow: "",
    ring: "",
    textColor: "text-blue-400",
    bgColor: "bg-blue-500/4",
    badgeColor: "bg-blue-500/50 text-white",
    severities: ["Low", "low"],
    statuses: ["Reported", "Resolved", "Closed", "Contained"],
    pulse: "",
  },
];

function GravityBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red-500" : score >= 55 ? "bg-orange-400" : score >= 30 ? "bg-yellow-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[9px] font-mono font-bold text-slate-400 w-6 text-right">{score}</span>
    </div>
  );
}

function ThreatCard({
  incident,
  level,
  onClick,
}: {
  incident: Incident;
  level: HierarchyLevel;
  onClick: () => void;
}) {
  const gravity = calcGravityScore(incident);
  const [hovered, setHovered] = useState(false);
  const age = Math.round((Date.now() - new Date(incident.incidentDate).getTime()) / 60000);
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 group relative overflow-hidden ${level.color}/30 ${hovered ? `${level.bgColor} ${level.glow}` : "bg-white/2 border-white/6"}`}
    >
      {/* Animated left stripe on hover */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 transition-all duration-300 ${level.textColor.replace("text-", "bg-")} ${hovered ? "opacity-100" : "opacity-0"}`} />

      {/* Gravity score overlay on hover */}
      {hovered && (
        <div className="absolute top-2 right-2">
          <div className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${level.badgeColor}`}>
            G:{gravity}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${level.bgColor}`}>
          <level.icon className={`w-3 h-3 ${level.textColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded ${level.badgeColor}`}>
              L{level.level}
            </span>
            <span className="text-[10px] font-mono font-semibold text-slate-200 truncate">{incident.id}</span>
            <span className="text-[9px] text-slate-600 shrink-0 ml-auto">{ageLabel}</span>
          </div>
          <p className="text-[11px] font-grotesk font-semibold text-slate-100 truncate mb-1">{incident.title}</p>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-slate-500 truncate">{incident.reporterOrg}</span>
          </div>
          {hovered && (
            <div className="mt-2">
              <GravityBar score={gravity} />
            </div>
          )}
        </div>
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-1 transition-transform ${hovered ? `${level.textColor} translate-x-0.5` : "text-slate-700"}`} />
      </div>
    </button>
  );
}

export default function ThreatHierarchy({ incidents, onSelectIncident }: ThreatHierarchyProps) {
  const [expandedLevel, setExpandedLevel] = useState<number | null>(1);
  const [tick, setTick] = useState(0);

  // Live tick for animations
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 3000);
    return () => clearInterval(t);
  }, []);

  // Sort incidents by gravity score
  const sorted = [...incidents].sort((a, b) => calcGravityScore(b) - calcGravityScore(a));

  const leveledIncidents = HIERARCHY_LEVELS.map(lvl => ({
    level: lvl,
    incidents: sorted.filter(i =>
      lvl.severities.some(s => i.severity === s)
    ).slice(0, 5),
  }));

  const totalCritical = leveledIncidents[0].incidents.length;
  const totalActive   = leveledIncidents[1].incidents.length;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-red-500/15 flex items-center justify-center">
            <Shield className="w-3 h-3 text-red-400" />
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-widest">Threat Hierarchy</span>
        </div>
        <div className="flex items-center gap-2">
          {totalCritical > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
              <span className="w-1 h-1 rounded-full bg-red-400" />
              {totalCritical} CRITICAL
            </span>
          )}
          <span className="text-[9px] font-mono text-slate-600">{incidents.length} total</span>
        </div>
      </div>

      {/* Levels */}
      {leveledIncidents.map(({ level, incidents: lvlIncidents }) => {
        const Icon = level.icon;
        const isExpanded = expandedLevel === level.level;
        const count = lvlIncidents.length;

        return (
          <div
            key={level.level}
            className={`rounded-xl border transition-all duration-300 overflow-hidden ${
              count > 0
                ? `${level.color}/40 ${isExpanded ? level.glow : ""} ${level.ring}`
                : "border-white/5"
            }`}
          >
            {/* Level header */}
            <button
              onClick={() => setExpandedLevel(isExpanded ? null : level.level)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all ${count > 0 ? "hover:bg-white/3" : "opacity-40 cursor-default"}`}
              disabled={count === 0}
            >
              {/* Level indicator */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 relative ${count > 0 ? level.bgColor : "bg-white/3"}`}>
                <Icon className={`w-3.5 h-3.5 ${count > 0 ? level.textColor : "text-slate-600"}`} />
                {level.level === 1 && count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-75" />
                )}
              </div>

              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${count > 0 ? level.textColor : "text-slate-600"}`}>
                    L{level.level} · {level.title}
                  </span>
                </div>
                <span className="text-[9px] text-slate-600">{level.subtitle}</span>
              </div>

              {/* Count badge */}
              <div className={`shrink-0 flex items-center gap-1.5`}>
                {count > 0 ? (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${level.badgeColor}`}>
                    {count}
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-700">—</span>
                )}
                <ChevronRight className={`w-3 h-3 text-slate-600 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </div>
            </button>

            {/* Expanded incidents */}
            {isExpanded && count > 0 && (
              <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
                {lvlIncidents.map(inc => (
                  <React.Fragment key={inc.id}>
                    <ThreatCard
                      incident={inc}
                      level={level}
                      onClick={() => onSelectIncident?.(inc.id)}
                    />
                  </React.Fragment>
                ))}
                {count === 5 && (
                  <button className={`w-full text-center text-[9px] font-mono py-1.5 ${level.textColor} hover:underline`}>
                    View all →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Gravity legend */}
      <div className="mt-3 p-3 rounded-lg bg-white/2 border border-white/5">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain className="w-3 h-3 text-purple-400" />
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">AI Gravity Score</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Critical", range: "80–100", color: "bg-red-500" },
            { label: "High",     range: "55–79",  color: "bg-orange-400" },
            { label: "Medium",   range: "30–54",  color: "bg-yellow-400" },
            { label: "Low",      range: "0–29",   color: "bg-blue-400" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className={`h-1 rounded-full mb-1 ${s.color}`} />
              <div className="text-[8px] font-mono text-slate-500">{s.label}</div>
              <div className="text-[8px] font-mono text-slate-700">{s.range}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
