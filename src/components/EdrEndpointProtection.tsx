import React, { useState, useEffect } from "react";
import {
  Shield, Monitor, AlertTriangle, Activity, RefreshCw,
  Cpu, Loader2, CheckCircle, XCircle, Trash2,
  Lock, Unlock, Wifi, Bug, Package
} from "lucide-react";

interface Endpoint {
  id: string; hostname: string; ip: string; os: string;
  status: string; vulnerabilities: number; lastScan: string;
}
interface Threat {
  id: string; name: string; file: string; endpoint: string;
  severity: string; status: string;
}
interface Packet {
  timestamp: string; protocol: string; source: string;
  destination: string; length: number; info: string; isMalicious: boolean;
}

const SEV_BADGE: Record<string, string> = {
  Critical: "text-red-400 bg-red-500/10 border-red-500/25",
  High:     "text-orange-400 bg-orange-500/10 border-orange-500/25",
  Medium:   "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",
  Low:      "text-slate-400 bg-slate-500/10 border-slate-500/25",
};

const STATUS_BADGE: Record<string, string> = {
  Protected:   "text-green-400 bg-green-500/10 border-green-500/25",
  Vulnerable:  "text-red-400 bg-red-500/10 border-red-500/25",
};

export default function EdrEndpointProtection() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [threats, setThreats]     = useState<Threat[]>([]);
  const [packets, setPackets]     = useState<Packet[]>([]);
  const [scanning, setScanning]   = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [tab, setTab]             = useState<"endpoints" | "threats" | "packets" | "vulns">("endpoints");

  const token = () => sessionStorage.getItem("sentinel_token");
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  const loadData = async () => {
    try {
      const [eRes, tRes, pRes] = await Promise.all([
        fetch("/api/edr/endpoints", { headers: headers() }),
        fetch("/api/edr/threats",   { headers: headers() }),
        fetch("/api/edr/packets",   { headers: headers() }),
      ]);
      if (eRes.ok) setEndpoints(await eRes.json());
      if (tRes.ok) setThreats(await tRes.json());
      if (pRes.ok) setPackets(await pRes.json());
    } catch (err) {
      console.error("EDR data load error:", err);
    }
  };

  useEffect(() => { loadData(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      await fetch("/api/edr/scan", { method: "POST", headers: headers() });
      await loadData();
    } finally {
      setScanning(false);
    }
  };

  const doAction = async (threatId: string, action: string) => {
    setActioning(threatId);
    try {
      await fetch("/api/edr/action", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ threatId, action })
      });
      await loadData();
    } finally {
      setActioning(null);
    }
  };

  const SIMULATED_VULNS = [
    { id: "CVE-2023-44487", name: "HTTP/2 Rapid Reset Attack", affected: "Zomba Council Web Server", severity: "Critical", patched: false },
    { id: "CVE-2022-30190", name: "Follina MSDT Remote Code Execution", affected: "MDF-HQ-DESKTOP-09", severity: "High", patched: false },
    { id: "CVE-2021-34527", name: "PrintNightmare Windows Print Spooler", affected: "STDBANK-CORE-SRV", severity: "High", patched: true },
    { id: "CVE-2017-0144",  name: "EternalBlue SMBv1 (WannaCry vector)", affected: "ZOMBA-TREASURY-01", severity: "Critical", patched: false },
  ];

  const TABS = [
    { id: "endpoints", label: "Monitored Endpoints", icon: Monitor },
    { id: "threats",   label: "Malware Threats",     icon: Bug },
    { id: "packets",   label: "Network Packets",     icon: Activity },
    { id: "vulns",     label: "Vulnerabilities (CVE)", icon: AlertTriangle },
  ] as const;

  return (
    <div className="space-y-5" id="edr-endpoint-protection">

      {/* Header with scan button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#05080F] border border-white/8 rounded-xl p-5">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-[#FFD600] rounded-full" />
            <h3 className="font-grotesk font-bold text-white text-sm">EDR Endpoint Protection</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Monitor corporate computers and servers, detect malicious software, scan for security weaknesses, and inspect network traffic flowing across the Malawi digital network.
          </p>
        </div>
        <button
          id="edr-scan-btn"
          onClick={runScan}
          disabled={scanning}
          className="btn-accent px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 shrink-0 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
          {scanning ? "Scanning All Nodes..." : "Run Full System Scan"}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-[#05080F] border border-white/8 rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`edr-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                tab === t.id ? "bg-[#FFD600] text-[#05080F]" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Endpoints Tab */}
      {tab === "endpoints" && (
        <div className="space-y-3">
          {endpoints.map(ep => (
            <div key={ep.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#05080F] border border-white/8 rounded-xl px-4 py-3">
              <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 shrink-0">
                <Monitor className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white font-mono">{ep.hostname}</div>
                <div className="text-[10px] text-slate-500 font-mono">{ep.ip} · {ep.os}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className={`text-lg font-bold font-mono ${ep.vulnerabilities > 5 ? "text-red-400" : ep.vulnerabilities > 1 ? "text-orange-400" : "text-[#FFD600]"}`}>{ep.vulnerabilities}</div>
                  <div className="text-[8px] text-slate-600 font-mono uppercase">VULNS</div>
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${STATUS_BADGE[ep.status] || "text-slate-400 border-slate-600 bg-slate-700/20"}`}>{ep.status}</span>
              </div>
              <div className="text-[9px] text-slate-600 font-mono shrink-0 hidden md:block">
                Last scanned: {new Date(ep.lastScan).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Threats Tab */}
      {tab === "threats" && (
        <div className="space-y-3">
          {threats.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-sm">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
              No active malware threats detected.
            </div>
          )}
          {threats.map(threat => (
            <div key={threat.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#05080F] border border-white/8 rounded-xl px-4 py-3">
              <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20 shrink-0">
                <Bug className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">{threat.name}</div>
                <code className="text-[9px] text-slate-500 font-mono block truncate">{threat.file}</code>
                <div className="text-[9px] text-slate-600 font-mono">Endpoint: {threat.endpoint}</div>
              </div>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${SEV_BADGE[threat.severity]}`}>{threat.severity}</span>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${
                threat.status === "Active" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                threat.status === "Quarantined" ? "text-orange-400 border-orange-500/30 bg-orange-500/10" :
                "text-green-400 border-green-500/30 bg-green-500/10"
              }`}>{threat.status}</span>

              {threat.status !== "Deleted" && threat.status !== "Cleaned" && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    id={`edr-quarantine-${threat.id}`}
                    onClick={() => doAction(threat.id, "quarantine")}
                    disabled={!!actioning}
                    className="flex items-center gap-1 text-[9px] font-mono font-bold text-orange-400 hover:text-orange-300 bg-orange-500/10 border border-orange-500/25 px-2 py-1 rounded transition disabled:opacity-40"
                  >
                    <Lock className="w-3 h-3" /> Quarantine
                  </button>
                  <button
                    id={`edr-clean-${threat.id}`}
                    onClick={() => doAction(threat.id, "clean")}
                    disabled={!!actioning}
                    className="flex items-center gap-1 text-[9px] font-mono font-bold text-green-400 hover:text-green-300 bg-green-500/10 border border-green-500/25 px-2 py-1 rounded transition disabled:opacity-40"
                  >
                    <CheckCircle className="w-3 h-3" /> Clean
                  </button>
                  <button
                    id={`edr-delete-${threat.id}`}
                    onClick={() => doAction(threat.id, "delete")}
                    disabled={!!actioning}
                    className="flex items-center gap-1 text-[9px] font-mono font-bold text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/25 px-2 py-1 rounded transition disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Packets Tab */}
      {tab === "packets" && (
        <div className="space-y-2">
          <div className="grid grid-cols-6 text-[9px] font-mono text-slate-600 uppercase tracking-wider px-4 pb-1 border-b border-white/5">
            <span>Time</span><span>Protocol</span><span>Source</span><span>Destination</span><span>Size</span><span>Status</span>
          </div>
          {packets.map((pkt, i) => (
            <div key={i} className={`grid grid-cols-6 text-[10px] font-mono px-4 py-2 rounded-lg ${pkt.isMalicious ? "bg-red-500/8 border border-red-500/20" : "bg-[#05080F]/40 border border-transparent"}`}>
              <span className="text-slate-500">{pkt.timestamp}</span>
              <span className={pkt.protocol === "HTTP" ? "text-blue-400" : pkt.protocol === "TCP" ? "text-[#FFD600]" : "text-slate-400"}>{pkt.protocol}</span>
              <span className={pkt.isMalicious ? "text-red-300" : "text-slate-400"}>{pkt.source}</span>
              <span className="text-slate-400">{pkt.destination}</span>
              <span className="text-slate-500">{pkt.length} B</span>
              <span className={pkt.isMalicious ? "text-red-400 font-bold" : "text-green-400"}>
                {pkt.isMalicious ? "⚠ MALICIOUS" : "✓ CLEAN"}
              </span>
            </div>
          ))}
          <div className="text-[10px] text-slate-600 font-mono pt-1">
            {packets.filter(p => p.isMalicious).length} malicious · {packets.filter(p => !p.isMalicious).length} clean
          </div>
        </div>
      )}

      {/* Vulnerabilities Tab */}
      {tab === "vulns" && (
        <div className="space-y-3">
          {SIMULATED_VULNS.map(v => (
            <div key={v.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#05080F] border border-white/8 rounded-xl px-4 py-3">
              <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20 shrink-0">
                <Package className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[10px] text-[#FFD600] font-mono font-bold">{v.id}</code>
                  <span className="text-sm font-semibold text-white">{v.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Affected: {v.affected}</div>
              </div>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${SEV_BADGE[v.severity]}`}>{v.severity}</span>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${v.patched ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-red-400 border-red-500/30 bg-red-500/10"}`}>
                {v.patched ? "PATCHED" : "UNPATCHED"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
