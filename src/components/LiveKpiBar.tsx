/**
 * LitSecure Sentinel — Live KPI Bar
 * Animated real-time metric cards shown across the top of every page.
 * Pulses gold when new data arrives. Shows LIVE/POLLING source badge.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ShieldAlert, Search, ShieldCheck, Lock,
  AlertTriangle, TrendingUp, Wifi, WifiOff, Activity
} from "lucide-react";
import type { LiveStats } from "../hooks/useRealTimeStats";

interface Props {
  stats: LiveStats;
}

interface KpiCard {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  pulse?: boolean;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    const start   = prev.current;
    const diff    = value - start;
    const dur     = 600;
    const startTs = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - startTs) / dur, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) requestAnimationFrame(tick);
      else prev.current = value;
    };

    requestAnimationFrame(tick);
  }, [value]);

  return <>{display}</>;
}

export default function LiveKpiBar({ stats }: Props) {
  const [flash, setFlash] = useState(false);
  const prevUpdate = useRef(stats.lastUpdated);

  useEffect(() => {
    if (stats.lastUpdated !== prevUpdate.current) {
      prevUpdate.current = stats.lastUpdated;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [stats.lastUpdated]);

  const cards: KpiCard[] = [
    {
      label: "Total Incidents",
      value: stats.totalIncidents,
      icon:  ShieldAlert,
      color: "text-slate-300",
    },
    {
      label: "Investigating",
      value: stats.investigatingCount,
      icon:  Search,
      color: "text-yellow-400",
      pulse: stats.investigatingCount > 0,
    },
    {
      label: "Critical",
      value: stats.criticalCount,
      icon:  AlertTriangle,
      color: "text-rose-400",
      pulse: stats.criticalCount > 0,
    },
    {
      label: "Active Alerts",
      value: stats.activeAlerts,
      icon:  Activity,
      color: "text-orange-400",
      pulse: stats.activeAlerts > 5,
    },
    {
      label: "Resolved",
      value: stats.resolvedCount,
      icon:  ShieldCheck,
      color: "text-emerald-400",
    },
    {
      label: "Contained",
      value: stats.containedCount,
      icon:  Lock,
      color: "text-blue-400",
    },
  ];

  const isLoading = stats.source === "loading";

  return (
    <div
      className={`border-b transition-colors duration-300 ${
        flash
          ? "border-[#FFD600]/30 bg-[#FFD600]/3"
          : "border-white/5 bg-[#05080F]"
      }`}
    >
      <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">

        {/* Live indicator badge */}
        <div className={`flex items-center gap-1.5 text-[9px] font-mono px-2.5 py-1.5 rounded-lg border shrink-0 ${
          stats.source === "supabase"
            ? "border-[#00ff41]/25 bg-[#00ff41]/5 text-[#00ff41]"
            : stats.source === "api"
            ? "border-[#FFD600]/25 bg-[#FFD600]/5 text-[#FFD600]"
            : "border-white/10 bg-white/3 text-slate-500"
        }`}>
          {stats.source === "supabase" ? (
            <><Wifi className="w-2.5 h-2.5" /><span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />SUPABASE LIVE</>
          ) : stats.source === "api" ? (
            <><Activity className="w-2.5 h-2.5" /><span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-pulse" />POLLING</>
          ) : (
            <><WifiOff className="w-2.5 h-2.5" />LOADING</>
          )}
        </div>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* KPI cards */}
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/3 transition shrink-0 group"
            >
              <Icon className={`w-3.5 h-3.5 ${card.color} shrink-0`} />
              <div className="flex items-baseline gap-1.5">
                <span className={`font-bebas text-xl leading-none ${card.color} transition-all`}>
                  {isLoading ? (
                    <span className="text-slate-700 animate-pulse">—</span>
                  ) : (
                    <AnimatedNumber value={card.value} />
                  )}
                </span>
                <span className="text-[9px] text-slate-600 uppercase tracking-wider font-mono whitespace-nowrap">
                  {card.label}
                </span>
              </div>
              {card.pulse && !isLoading && (
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse opacity-60" style={{ color: card.color.replace("text-","") }} />
              )}
            </div>
          );
        })}

        {/* Timestamp */}
        {!isLoading && (
          <>
            <div className="w-px h-5 bg-white/10 shrink-0 ml-1" />
            <div className="text-[9px] text-slate-600 font-mono shrink-0 whitespace-nowrap">
              Updated {stats.lastUpdated.toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
