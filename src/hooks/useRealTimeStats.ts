/**
 * LitSecure — useRealTimeStats
 * Hybrid live data hook:
 *  - If Supabase key is set → uses Supabase real-time subscriptions (instant push)
 *  - Otherwise             → polls the local Express API every 5 seconds
 *
 * Returns the same NationalStats shape the rest of the app already uses.
 */
import { useState, useEffect, useRef, useCallback, useId } from "react";
import { supabase, isSupabaseConnected } from "../lib/supabase";
import type { NationalStats } from "../types";

export interface LiveStats extends NationalStats {
  lastUpdated: Date;
  source: "supabase" | "api" | "loading";
  isLive: boolean;
}

const EMPTY: LiveStats = {
  totalIncidents:    0,
  reportedCount:     0,
  investigatingCount:0,
  containedCount:    0,
  resolvedCount:     0,
  criticalCount:     0,
  activeAlerts:      0,
  categoryStats:     [],
  severityStats:     [],
  lastUpdated:       new Date(),
  source:            "loading",
  isLive:            false,
};


// ─── Fetch from local Express API ─────────────────────────────────────────────
async function fetchFromAPI(token: string | null): Promise<NationalStats | null> {
  try {
    const res = await fetch("/api/incidents/meta/stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Compute stats from raw Supabase rows ─────────────────────────────────────
function computeStats(rows: any[]): NationalStats {
  const catMap: Record<string, number> = {};
  const sevMap: Record<string, number> = {};

  for (const r of rows) {
    catMap[r.category] = (catMap[r.category] || 0) + 1;
    sevMap[r.severity] = (sevMap[r.severity] || 0) + 1;
  }

  return {
    totalIncidents:     rows.length,
    reportedCount:      rows.filter((r: any) => r.status === "Reported").length,
    investigatingCount: rows.filter((r: any) => r.status === "Investigating").length,
    containedCount:     rows.filter((r: any) => r.status === "Contained").length,
    resolvedCount:      rows.filter((r: any) => r.status === "Resolved").length,
    criticalCount:      rows.filter((r: any) => r.severity === "Critical").length,
    activeAlerts:       rows.filter((r: any) => !["Resolved","Contained"].includes(r.status)).length,
    categoryStats:      Object.entries(catMap).map(([name, value]) => ({ name, value })),
    severityStats:      Object.entries(sevMap).map(([name, value]) => ({ name, value })),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useRealTimeStats(): LiveStats {
  const [stats, setStats] = useState<LiveStats>(EMPTY);
  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Unique ID per hook instance — prevents name collision on React 18 StrictMode double-mount
  const instanceId  = useId();
  const token = () => sessionStorage.getItem("sentinel_token");

  // ── Supabase real-time path ─────────────────────────────────────────────────
  const setupSupabase = useCallback(async () => {
    // Synchronously guard against StrictMode double-invoke
    if (channelRef.current) return () => {};

    // Build the channel immediately (synchronous) before any await
    const channelName = `litsecure-incidents-${instanceId.replace(/:/g, "")}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        async () => {
          const { data: fresh } = await supabase
            .from("incidents")
            .select("*")
            .order("created_at", { ascending: false });
          if (fresh) {
            setStats({
              ...computeStats(fresh),
              lastUpdated: new Date(),
              source:      "supabase",
              isLive:      true,
            });
          }
        }
      )
      .subscribe();

    // Store ref synchronously — second StrictMode mount will see this
    channelRef.current = channel;

    // Initial load (async, after channel is set up)
    const { data, error } = await supabase
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setStats({
        ...computeStats(data),
        lastUpdated: new Date(),
        source:      "supabase",
        isLive:      true,
      });
    }

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [instanceId]);


  // ── API polling path ────────────────────────────────────────────────────────
  const setupPolling = useCallback(() => {
    const refresh = async () => {
      const data = await fetchFromAPI(token());
      if (data) {
        setStats({
          ...data,
          lastUpdated: new Date(),
          source:      "api",
          isLive:      false,
        });
      }
    };

    refresh(); // immediate first fetch
    pollingRef.current = setInterval(refresh, 5000); // every 5s

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (isSupabaseConnected()) {
      setupSupabase().then(fn => { cleanup = fn; });
    } else {
      cleanup = setupPolling();
    }

    return () => { cleanup?.(); };
  }, [setupSupabase, setupPolling]);

  return stats;
}
