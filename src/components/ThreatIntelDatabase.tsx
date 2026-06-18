import React, { useState, useEffect } from "react";
import { Search, Globe, Smartphone, Activity, Terminal, ShieldAlert, Cpu, AlertTriangle } from "lucide-react";

interface ThreatIntelItem {
  type: string;
  value: string;
  origin: string;
  severity: string;
  date: string;
}

export default function ThreatIntelDatabase() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ThreatIntelItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchIntel = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/threat-intel?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Error fetching threat intelligence registry:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
  }, [query]);

  const getIndicatorIcon = (type: string) => {
    switch (type) {
      case "IP Address":
        return <Activity className="w-4.5 h-4.5 text-blue-400 shrink-0" />;
      case "Phone Number":
        return <Smartphone className="w-4.5 h-4.5 text-[#FFD600] shrink-0" />;
      case "Domain Portal":
      case "Domain Wallet":
        return <Globe className="w-4.5 h-4.5 text-purple-400 shrink-0" />;
      default:
        return <Cpu className="w-4.5 h-4.5 text-slate-400 shrink-0" />;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "Critical":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "High":
        return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
      case "Medium":
        return "bg-amber-500/10 text-amber-500/80 border border-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    }
  };

  return (
    <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-xl relative overflow-hidden" id="threat-intel-database">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Terminal className="w-36 h-36 text-blue-500" />
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
          <Terminal className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight">MACERT Threat Intelligence Registry</h2>
          <p className="text-xs text-slate-400">Search compiled network indicator assets flagged across Malawian nodes</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Query IP, fraud phone line prefix (+265), rogue domain target or incident ID reference..."
            className="w-full bg-[#05080F]/80 border border-white/10 focus:border-blue-500 focus:outline-none rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 transition font-sans"
            id="intel-search-input"
          />
          <Search className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-3.5" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-[#05080F] border border-white/10/80 rounded-xl overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-[#0A0E1A]/60 sticky top-0">
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compromised asset</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Indicator Type</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Threat Severity</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Origin Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        Querying database files...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No indicators matched your search parameters.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[#0A0E1A]/40 transition">
                        <td className="p-3 font-mono font-bold text-slate-200">
                          <div className="flex items-center gap-2">
                            {getIndicatorIcon(item.type)}
                            <span>{item.value}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-400 font-sans">{item.type}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${getSeverityBadge(item.severity)}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-400">{item.origin}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="space-y-4">
          <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> ISP & Carrier Policy Sync
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed font-sans mb-3">
              MACRA regulations mandate that internet service providers (ISPs), mobile network operators (TNM, Airtel), and central settlement clearing networks download this telemetry registry at 15-minute cron cycles.
            </p>
            <div className="bg-[#05080F]/80 rounded border border-white/10 p-2 text-[10px] font-mono text-slate-500 leading-normal">
              1. Block suspect firewall IPs: drop WAN packets.<br />
              2. Hold fraud wallets: freeze ledger payouts.<br />
              3. Block spoof domains: nullify DNS translation.
            </div>
          </div>

          <div className="bg-amber-950/10 border border-amber-900/30 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-2 flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-4 h-4" /> Live Forensics Notice
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Registry assets are shared with Interpol and regional SADC Cyber Unit nodes. Do not attempt to alert owners of blacklisted mobile money wallets during ongoing security operations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
