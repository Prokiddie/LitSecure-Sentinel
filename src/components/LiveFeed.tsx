import React, { useState, useEffect } from "react";
import { Activity, ShieldCheck, AlertOctagon, Terminal, Play, Loader, Sparkles } from "lucide-react";
import { SimulatedLog } from "../types";

export default function LiveFeed() {
  const [logs, setLogs] = useState<SimulatedLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("All");

  const fetchLogs = async () => {
    try {
      const response = await fetch("/api/logs");
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (err) {
      console.error("Error reading simulated logs:", err);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Poll logs every 8 seconds for real-time live feel
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, []);

  const triggerAnomalies = async () => {
    setTriggering(true);
    try {
      const response = await fetch("/api/logs/generate", {
        method: "POST",
      });
      if (response.ok) {
        const newLog = await response.json();
        setLogs(prev => [newLog, ...prev]);
      }
    } catch (err) {
      console.error("Error generating simulated anomaly:", err);
    } finally {
      setTriggering(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "malicious":
        return "bg-red-500/10 text-red-400 border border-red-500/20";
      case "suspicious":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      default:
        return "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20";
    }
  };

  const getSourceBadge = (src: string) => {
    switch (src) {
      case "TNM Mpamba":
      case "Airtel Money":
        return "bg-rose-950/40 text-rose-300 border border-rose-900/30";
      case "Standard Bank MW":
      case "National Bank MW":
      case "FDH Bank":
        return "bg-blue-950/40 text-blue-300 border border-blue-900/30";
      default:
        return "bg-[#05080F]/50 text-slate-300 border border-white/10";
    }
  };

  const filteredLogs = sourceFilter === "All" 
    ? logs 
    : logs.filter(log => log.source === sourceFilter);

  return (
    <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-xl relative overflow-hidden" id="live-feed-panel">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Activity className="w-36 h-36 text-rose-500" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400 border border-rose-500/20">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-100 tracking-tight">Active Infrastructure API Logs</h2>
            <p className="text-xs text-slate-400">Incoming syslog and merchant security transactions stream</p>
          </div>
        </div>

        <button
          onClick={triggerAnomalies}
          disabled={triggering}
          className="px-4 py-2 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 disabled:from-slate-800 disabled:to-slate-800 text-slate-100 rounded-lg text-xs font-bold shadow-md flex items-center justify-center gap-2 transition active:translate-y-0.5 whitespace-nowrap self-start sm:self-center"
          id="simulate-threat-btn"
        >
          {triggering ? (
            <Loader className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          Trigger Outpost Anomaly Wave
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Gateway Filter:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-[#05080F] border border-white/10 rounded px-2.0 py-1 text-xs text-slate-300 focus:outline-none"
            id="source-filter-select"
          >
            <option value="All">All Integration Points (8)</option>
            <option value="TNM Mpamba">TNM Mpamba</option>
            <option value="Airtel Money">Airtel Money</option>
            <option value="Standard Bank MW">Standard Bank MW</option>
            <option value="FDH Bank">FDH Bank</option>
            <option value="Skyband ISP">Skyband ISP</option>
            <option value="Malawi Gov Gateway">Malawi Gov Gateway</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
          <span>Surveillance Active</span>
        </div>
      </div>

      <div className="bg-[#05080F] border border-white/10/80 rounded-xl max-h-96 overflow-y-auto p-2" id="logs-container">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-600 text-xs font-sans">
            No incoming alerts detected across active gateways with current filter.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className="bg-[#0A0E1A]/30 hover:bg-[#0A0E1A]/80 border border-white/10/60 hover:border-white/10 rounded-lg p-3 text-xs transition duration-150 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold font-mono tracking-wider ${getSourceBadge(log.source)}`}>
                      {log.source}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-semibold text-slate-200">
                      {log.event}
                    </span>
                  </div>
                  <p className="text-slate-400 font-sans leading-relaxed text-[11px]">
                    {log.details}
                  </p>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-white/[0.06] pt-2 md:pt-0">
                  <div className="font-mono text-[10px] text-slate-500">
                    <span className="text-slate-600">Indicator:</span> <span className="text-slate-300 font-bold bg-[#05080F] px-1.5 py-0.5 border border-white/10/60 rounded">{log.indicator}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded shrink-0 ${getSeverityBadge(log.severity)}`}>
                    {log.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
