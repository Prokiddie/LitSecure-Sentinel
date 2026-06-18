/**
 * LitSecure Sentinel — CyberIntelligence Hub
 * Real working OSINT, Reconnaissance, Scanner & Digital Forensics tools.
 * Uses /api/cyber/* server-side proxies to real public APIs.
 */
import React, { useState, useCallback, useRef } from "react";
import {
  Search, Globe, Wifi, Shield, FileSearch, Hash,
  Terminal, AlertTriangle, CheckCircle, Loader2,
  ChevronRight, Copy, ExternalLink, RefreshCw,
  Layers, Server, Lock, Scan, Database, Eye,
  Network, Fingerprint, Clock, MapPin, Activity
} from "lucide-react";

interface Props { token: string; }

type ToolTab = "osint" | "recon" | "scanner" | "forensics";

// ── Shared fetch helper ──────────────────────────────────────────────────────
async function cyberFetch(token: string, path: string, opts?: RequestInit) {
  const res = await fetch(`/api/cyber${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

// ── Result renderer ──────────────────────────────────────────────────────────
function ResultBox({ data, error, loading }: { data: any; error: string; loading: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = data ? JSON.stringify(data, null, 2) : "";

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) return (
    <div className="tool-result-box flex items-center gap-3">
      <Loader2 className="w-4 h-4 animate-spin text-[#FFD600]" />
      <span className="text-[#FFD600]">Running query...</span>
    </div>
  );
  if (error) return (
    <div className="tool-result-box">
      <span className="err">⚠ Error: {error}</span>
    </div>
  );
  if (!data) return null;

  return (
    <div className="relative group">
      <button
        onClick={copy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
        title="Copy result"
      >
        {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
      <pre className="tool-result-box">{text}</pre>
    </div>
  );
}

// ── IP Lookup panel ──────────────────────────────────────────────────────────
function IpLookup({ token }: { token: string }) {
  const [ip, setIp] = useState("8.8.8.8");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, `/ip/${ip.trim()}`);
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const quickIPs = ["8.8.8.8", "1.1.1.1", "41.70.0.1", "196.44.0.0"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={ip} onChange={e => setIp(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="IP address (e.g. 41.70.0.1)"
          className="flex-1 glass-input px-3 py-2 text-sm font-mono"
          id="ip-lookup-input"
        />
        <button onClick={run} disabled={loading || !ip.trim()}
          className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Lookup
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {quickIPs.map(q => (
          <button key={q} onClick={() => { setIp(q); }}
            className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 text-slate-400 hover:border-[#FFD600]/30 hover:text-[#FFD600] transition">
            {q}
          </button>
        ))}
      </div>
      {data && !loading && (() => {
        const abuse = data.abuse;
        const score = abuse?.abuseConfidenceScore ?? null;
        const isMalawi = data.countryCode === "MW";
        const scoreColor = score === null ? "text-slate-400"
          : score >= 50 ? "text-red-400"
          : score >= 20 ? "text-orange-400"
          : "text-green-400";
        const scoreBg = score === null ? "border-slate-500/20 bg-slate-500/5"
          : score >= 50 ? "border-red-500/30 bg-red-500/8"
          : score >= 20 ? "border-orange-500/30 bg-orange-500/8"
          : "border-green-500/30 bg-green-500/8";
        const scoreLabel = score === null ? "No Data"
          : score >= 75 ? "MALICIOUS"
          : score >= 50 ? "SUSPICIOUS"
          : score >= 20 ? "LOW RISK"
          : "CLEAN";
        return (
          <div className="space-y-3">
            {/* ── AbuseIPDB Threat Card ── */}
            {abuse !== undefined && (
              <div className={`rounded-xl border p-4 ${scoreBg}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 ${scoreColor}`} />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">AbuseIPDB Intelligence</span>
                    {isMalawi && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 animate-pulse">
                        ⚠️ MALAWI ORIGIN
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${scoreBg} ${scoreColor}`}>
                    {scoreLabel}
                  </span>
                </div>
                {abuse ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <div className={`text-3xl font-black font-mono ${scoreColor}`}>{score}%</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">Abuse Score</div>
                      {/* Score bar */}
                      <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${score >= 50 ? "bg-red-500" : score >= 20 ? "bg-orange-500" : "bg-green-500"}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-black font-mono text-orange-400">{abuse.totalReports ?? 0}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">Total Reports</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold font-mono text-slate-300">{abuse.domain || "—"}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">ISP Domain</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold font-mono text-slate-300">{abuse.usageType || "—"}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">Usage Type</div>
                      {abuse.lastReportedAt && (
                        <div className="text-[8px] text-slate-600 mt-1">Last: {new Date(abuse.lastReportedAt).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 font-mono">
                    Add <code className="text-[#FFD600] bg-[#FFD600]/10 px-1 rounded">ABUSEIPDB_API_KEY</code> to .env.local to enable threat scoring
                  </p>
                )}
              </div>
            )}
            {/* ── Geo Details Grid ── */}
            <div className="responsive-2col">
              {[
                { label: "Country",  val: `${data.country} (${data.countryCode})`, icon: "🌍" },
                { label: "City",     val: `${data.city || "—"}, ${data.regionName || ""}`.trim().replace(/,$/, ""), icon: "🏙️" },
                { label: "ISP",      val: data.isp || "—",   icon: "📡" },
                { label: "ASN",      val: data.as || "—",    icon: "🔢" },
                { label: "Timezone", val: data.timezone || "—", icon: "🕐" },
                { label: "Proxy / VPN", val: data.proxy ? "⚠️ YES — likely hiding" : "✅ No proxy detected", icon: "🔒" },
                { label: "Hosting",  val: data.hosting ? "⚠️ Data Center / Cloud" : "🏠 Residential ISP", icon: "🖥️" },
                { label: "Mobile",   val: data.mobile ? "📱 Mobile carrier" : "🖥️ Fixed line", icon: "📶" },
              ].map(r => (
                <div key={r.label} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/3 border border-white/5">
                  <span className="text-base shrink-0">{r.icon}</span>
                  <div>
                    <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">{r.label}</div>
                    <div className="text-[11px] text-slate-200 font-mono font-semibold break-all">{r.val}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <ResultBox data={data} error={error} loading={loading} />
    </div>
  );
}

// ── DNS Lookup panel ─────────────────────────────────────────────────────────
function DnsLookup({ token }: { token: string }) {
  const [domain, setDomain] = useState("google.com");
  const [dnsType, setDnsType] = useState("A");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const types = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"];

  const run = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, `/dns/${encodeURIComponent(domain.trim())}/${dnsType}`);
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input value={domain} onChange={e => setDomain(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="Domain (e.g. malawi.gov.mw)"
          className="flex-1 min-w-[200px] glass-input px-3 py-2 text-sm font-mono"
          id="dns-lookup-input" />
        <select value={dnsType} onChange={e => setDnsType(e.target.value)}
          className="glass-input px-3 py-2 text-sm font-mono bg-transparent">
          {types.map(t => <option key={t} value={t} className="bg-[#0A0E1A]">{t}</option>)}
        </select>
        <button onClick={run} disabled={loading || !domain.trim()}
          className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          Resolve
        </button>
      </div>
      {data?.Answer && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wide mb-2">
            {data.Answer.length} record{data.Answer.length !== 1 ? "s" : ""} found
          </div>
          {data.Answer.map((rec: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white/3 border border-white/5 font-mono text-xs">
              <span className="text-cyan-400 shrink-0 text-[10px]">{types[rec.type - 1] || `T${rec.type}`}</span>
              <span className="text-slate-200 flex-1 break-all">{rec.data}</span>
              <span className="text-slate-600 shrink-0 text-[10px]">TTL {rec.TTL}s</span>
            </div>
          ))}
        </div>
      )}
      <ResultBox data={data?.Answer ? null : data} error={error} loading={loading && !data} />
    </div>
  );
}

// ── WHOIS / RDAP panel ───────────────────────────────────────────────────────
function WhoisLookup({ token }: { token: string }) {
  const [domain, setDomain] = useState("macra.mw");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, `/rdap/${encodeURIComponent(domain.trim())}`);
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const extract = (d: any) => ({
    "Domain":      d?.ldhName || d?.unicodeName || "—",
    "Status":      (d?.status || []).join(", ") || "—",
    "Registrar":   d?.entities?.find((e: any) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] || "—",
    "Created":     d?.events?.find((e: any) => e.eventAction === "registration")?.eventDate?.split("T")[0] || "—",
    "Expires":     d?.events?.find((e: any) => e.eventAction === "expiration")?.eventDate?.split("T")[0] || "—",
    "Last Changed":d?.events?.find((e: any) => e.eventAction === "last changed")?.eventDate?.split("T")[0] || "—",
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={domain} onChange={e => setDomain(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="Domain (e.g. malawi.gov.mw)"
          className="flex-1 glass-input px-3 py-2 text-sm font-mono"
          id="whois-lookup-input" />
        <button onClick={run} disabled={loading || !domain.trim()}
          className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          WHOIS
        </button>
      </div>
      {data && Object.entries(extract(data)).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white/3 border border-white/5 font-mono text-xs">
          <span className="text-slate-500 shrink-0">{k}</span>
          <span className="text-slate-200 text-right break-all">{v as string}</span>
        </div>
      ))}
      <ResultBox data={data && !Object.keys(extract(data)).length ? data : null} error={error} loading={loading} />
    </div>
  );
}

// ── Header Analysis panel ─────────────────────────────────────────────────────
function HeaderAnalysis({ token }: { token: string }) {
  const [url, setUrl] = useState("https://malawi.gov.mw");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, "/headers", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="https://target.com"
          className="flex-1 glass-input px-3 py-2 text-sm font-mono"
          id="headers-url-input" />
        <button onClick={run} disabled={loading || !url.trim()}
          className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
          Analyze
        </button>
      </div>
      {data?.securityAnalysis && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">Security Headers</div>
          <div className="responsive-2col">
            {Object.entries(data.securityAnalysis).map(([k, v]) => (
              <div key={k} className={`p-2.5 rounded-lg border font-mono text-[11px] ${(v as string).includes("✅") ? "border-green-500/20 bg-green-500/5 text-green-400" : "border-orange-500/20 bg-orange-500/5 text-orange-400"}`}>
                <div className="text-[9px] text-slate-500 mb-0.5">{k}</div>
                {v as string}
              </div>
            ))}
          </div>
          <div className="flex gap-4 text-[11px] font-mono mt-2 p-2.5 rounded-lg bg-white/3 border border-white/5">
            <span className="text-slate-500">Status:</span><span className="text-[#FFD600] font-bold">{data.status} {data.statusText}</span>
            <span className="text-slate-500">Server:</span><span className="text-slate-300">{data.server}</span>
          </div>
        </div>
      )}
      <ResultBox data={data?.headers} error={error} loading={loading} />
    </div>
  );
}

// ── SSL Certs panel ───────────────────────────────────────────────────────────
function CertSearch({ token }: { token: string }) {
  const [domain, setDomain] = useState("*.malawi.gov.mw");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, `/certs/${encodeURIComponent(domain.trim())}`);
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={domain} onChange={e => setDomain(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="domain.com or %.domain.com"
          className="flex-1 glass-input px-3 py-2 text-sm font-mono"
          id="cert-search-input" />
        <button onClick={run} disabled={loading || !domain.trim()}
          className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Search Certs
        </button>
      </div>
      {data?.certs?.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
          <div className="text-[10px] font-mono text-slate-500">{data.count} certificate(s) found in CT logs</div>
          {data.certs.map((c: any) => (
            <div key={c.id} className="p-2.5 rounded-lg bg-white/3 border border-white/5 font-mono text-[11px] space-y-1">
              <div className="text-cyan-400 break-all">{c.subject}</div>
              <div className="flex gap-4 text-slate-500 text-[10px] flex-wrap">
                <span>Issuer: <span className="text-slate-400">{c.issuer?.split(",")[0]}</span></span>
                <span>Valid: <span className="text-green-400">{c.notBefore?.split("T")[0]}</span> → <span className="text-orange-400">{c.notAfter?.split("T")[0]}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
      <ResultBox data={null} error={error} loading={loading} />
    </div>
  );
}

// ── Port Scanner panel ────────────────────────────────────────────────────────
function PortScanner({ token }: { token: string }) {
  const [host, setHost] = useState("scanme.nmap.org");
  const [portsStr, setPortsStr] = useState("21,22,23,25,53,80,443,445,3306,3389,8080,8443");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const COMMON_SETS = [
    { label: "Web",   ports: "80,443,8080,8443" },
    { label: "Mail",  ports: "25,110,143,465,587,993,995" },
    { label: "DB",    ports: "1433,1521,3306,5432,6379,27017" },
    { label: "All Common", ports: "21,22,23,25,53,80,110,143,443,445,3306,3389,8080,8443" },
  ];

  const run = async () => {
    const ports = portsStr.split(",").map(p => parseInt(p.trim())).filter(p => !isNaN(p));
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, "/portscan", { method: "POST", body: JSON.stringify({ host: host.trim(), ports }) });
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const statusColor = (s: string) =>
    s === "open" ? "text-green-400 border-green-500/30 bg-green-500/5" :
    s === "closed" ? "text-slate-600 border-slate-700/30 bg-slate-700/5" :
    "text-orange-400 border-orange-500/30 bg-orange-500/5";

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5 text-orange-400 text-[11px] font-mono flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Only scan targets you own or have explicit authorization to test. Unauthorized scanning may be illegal.
      </div>
      <div className="flex gap-2 flex-wrap">
        <input value={host} onChange={e => setHost(e.target.value)}
          placeholder="IP or hostname"
          className="flex-1 min-w-[160px] glass-input px-3 py-2 text-sm font-mono"
          id="port-scan-host" />
        <input value={portsStr} onChange={e => setPortsStr(e.target.value)}
          placeholder="80,443,22,..."
          className="flex-1 min-w-[180px] glass-input px-3 py-2 text-sm font-mono"
          id="port-scan-ports" />
      </div>
      <div className="flex flex-wrap gap-2">
        {COMMON_SETS.map(s => (
          <button key={s.label} onClick={() => setPortsStr(s.ports)}
            className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 text-slate-400 hover:border-[#FFD600]/30 hover:text-[#FFD600] transition">
            {s.label}
          </button>
        ))}
        <button onClick={run} disabled={loading || !host.trim()}
          className="btn-accent px-4 py-1.5 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40 ml-auto">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
          {loading ? "Scanning..." : "Scan Ports"}
        </button>
      </div>
      {data?.results && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-slate-500 mb-2">
            {data.results.filter((r: any) => r.status === "open").length} open / {data.scanned} scanned on {data.host}
          </div>
          <div className="responsive-4col">
            {data.results.map((r: any) => (
              <div key={r.port} className={`flex items-center justify-between px-2.5 py-2 rounded-lg border font-mono text-[11px] ${statusColor(r.status)}`}>
                <span className="font-bold">{r.port}</span>
                <span className="uppercase text-[9px]">{r.status}</span>
                {r.banner && <span className="text-[9px] text-slate-500 ml-1 truncate max-w-[60px]" title={r.banner}>{r.banner}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <ResultBox data={null} error={error} loading={loading} />
    </div>
  );
}

// ── Hash Calculator panel ─────────────────────────────────────────────────────
function HashCalc({ token }: { token: string }) {
  const [input, setInput] = useState("");
  const [algo, setAlgo] = useState("sha256");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(""); setData(null);
    try {
      const r = await cyberFetch(token, "/hash", { method: "POST", body: JSON.stringify({ data: input, algorithm: algo }) });
      setData(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={algo} onChange={e => setAlgo(e.target.value)}
          className="glass-input px-3 py-2 text-sm font-mono bg-transparent w-28">
          {["sha256","sha1","sha512","md5"].map(a => <option key={a} value={a} className="bg-[#0A0E1A]">{a.toUpperCase()}</option>)}
        </select>
        <button onClick={run} disabled={loading || !input.trim()}
          className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40 ml-auto">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
          Hash
        </button>
      </div>
      <textarea value={input} onChange={e => setInput(e.target.value)}
        placeholder="Paste text, file content, or any data to hash..."
        rows={5}
        className="w-full glass-input px-3 py-2 text-sm font-mono resize-y"
        id="hash-input" />
      {data && (
        <div className="p-3 rounded-lg bg-[#020409] border border-cyan-500/20">
          <div className="text-[9px] font-mono text-slate-500 mb-1">{data.algorithm} HASH · {data.length} chars · Input: {data.inputLength} bytes</div>
          <div className="font-mono text-cyan-400 text-[11px] break-all select-all">{data.hash}</div>
        </div>
      )}
      <ResultBox data={null} error={error} loading={loading} />
    </div>
  );
}

// ── Log Parser / IOC Extractor ────────────────────────────────────────────────
function LogParser() {
  const [logs, setLogs] = useState("");
  const [results, setResults] = useState<any>(null);

  const SAMPLE = `2026-06-15T08:23:11Z [WARN] Failed login from 196.201.214.12 for user admin@macra.mw
2026-06-15T08:23:14Z [WARN] Failed login from 196.201.214.12 for user root
2026-06-15T08:23:17Z [CRIT] Brute force detected from 196.201.214.12 - blocking
2026-06-15T08:24:02Z [INFO] DNS query: malware-c2.onion.ws from 192.168.1.45
2026-06-15T08:24:08Z [WARN] Outbound connection to 91.192.103.43:4444 (known Cobalt Strike)
2026-06-15T08:25:00Z [INFO] File hash: 44d88612fea8a8f36de82e1278abb02f downloaded by 192.168.1.45`;

  const parse = () => {
    const ipRegex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
    const domainRegex = /\b([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g;
    const hashRegex = /\b[0-9a-f]{32,64}\b/gi;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const tsRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g;
    const portRegex = /:\d{2,5}\b/g;

    const ips     = [...new Set(logs.match(ipRegex) || [])];
    const domains = [...new Set((logs.match(domainRegex) || []).filter(d => !d.match(/^\d+\./) && d.includes(".")))];
    const hashes  = [...new Set(logs.match(hashRegex) || [])];
    const emails  = [...new Set(logs.match(emailRegex) || [])];
    const timestamps = logs.match(tsRegex) || [];
    const ports   = [...new Set((logs.match(portRegex) || []).map(p => p.slice(1)))];

    const lines = logs.split("\n").filter(Boolean);
    const critLines = lines.filter(l => /CRIT|ERROR|FAIL|BLOCK|DETECT|ATTACK|WARN/i.test(l));

    setResults({ ips, domains, hashes, emails, timestamps: { first: timestamps[0], last: timestamps[timestamps.length - 1], count: timestamps.length }, ports, criticalEvents: critLines, totalLines: lines.length });
  };

  const IOCSection = ({ title, items, color }: { title: string; items: string[]; color: string }) =>
    items.length > 0 ? (
      <div>
        <div className={`text-[10px] font-mono font-bold uppercase tracking-wide mb-2 ${color}`}>{title} ({items.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {items.map(item => (
            <span key={item} className={`text-[10px] font-mono px-2 py-0.5 rounded border ${color.replace("text-", "border-").replace("400", "500/30")} ${color.replace("text-", "bg-").replace("400", "500/10")}`}>{item}</span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-between items-center">
        <span className="text-[11px] font-mono text-slate-500">Paste log output to extract IOCs, IPs, domains, hashes</span>
        <button onClick={() => setLogs(SAMPLE)}
          className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 text-slate-400 hover:border-[#FFD600]/30 hover:text-[#FFD600] transition">
          Load Sample
        </button>
      </div>
      <textarea value={logs} onChange={e => setLogs(e.target.value)}
        placeholder="Paste raw logs, firewall output, SIEM alerts..."
        rows={8}
        className="w-full glass-input px-3 py-2 text-[12px] font-mono resize-y"
        id="log-parser-input" />
      <button onClick={parse} disabled={!logs.trim()}
        className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
        <Fingerprint className="w-4 h-4" /> Extract IOCs
      </button>
      {results && (
        <div className="space-y-4">
          <div className="responsive-4col">
            {[
              { label: "Total Lines",     val: results.totalLines,            color: "text-slate-400" },
              { label: "IPs Found",       val: results.ips.length,            color: "text-orange-400" },
              { label: "Domains",         val: results.domains.length,        color: "text-cyan-400" },
              { label: "Critical Events", val: results.criticalEvents.length, color: "text-red-400" },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-lg bg-white/3 border border-white/5 text-center">
                <div className={`text-xl font-bold font-mono ${s.color}`}>{s.val}</div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wide font-mono mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <IOCSection title="🌐 IP Addresses" items={results.ips} color="text-orange-400" />
          <IOCSection title="🔗 Domains" items={results.domains} color="text-cyan-400" />
          <IOCSection title="#️⃣ Hashes" items={results.hashes} color="text-purple-400" />
          <IOCSection title="📧 Emails" items={results.emails} color="text-green-400" />
          <IOCSection title="🔌 Ports" items={results.ports} color="text-yellow-400" />
          {results.criticalEvents.length > 0 && (
            <div>
              <div className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-wide mb-2">🚨 Critical Events ({results.criticalEvents.length})</div>
              <div className="space-y-1">
                {results.criticalEvents.map((line: string, i: number) => (
                  <div key={i} className="text-[10px] font-mono text-red-300/80 bg-red-500/5 border border-red-500/10 rounded px-2 py-1 break-all">{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Email Header Analyzer ─────────────────────────────────────────────────────
function EmailHeaderAnalyzer() {
  const [headers, setHeaders] = useState("");
  const [results, setResults] = useState<any>(null);

  const SAMPLE = `Received: from mail.evil.ru (mail.evil.ru [91.192.103.43])
        by mx1.macra.mw (Postfix) with ESMTP id 4A2B31C0D3
        for <admin@macra.mw>; Mon, 15 Jun 2026 08:23:11 +0200 (CAT)
Received: from [192.168.0.5] (unknown [196.201.214.12])
        by mail.evil.ru with SMTP; Mon, 15 Jun 2026 07:23:10 +0100
From: "MACRA IT Support" <support@macra-mw.ru>
To: admin@macra.mw
Subject: URGENT: Password Reset Required
Date: Mon, 15 Jun 2026 08:23:10 +0200
Message-ID: <CABc123def456@mail.evil.ru>
X-Mailer: PHPMailer 6.1.5
Authentication-Results: mx1.macra.mw; spf=fail smtp.mailfrom=macra-mw.ru`;

  const analyze = () => {
    const receivedHops = (headers.match(/^Received:.*$/gm) || []).map(h => h.trim());
    const from    = headers.match(/^From:(.+)$/m)?.[1]?.trim() || "—";
    const to      = headers.match(/^To:(.+)$/m)?.[1]?.trim() || "—";
    const subject = headers.match(/^Subject:(.+)$/m)?.[1]?.trim() || "—";
    const date    = headers.match(/^Date:(.+)$/m)?.[1]?.trim() || "—";
    const msgId   = headers.match(/^Message-ID:(.+)$/m)?.[1]?.trim() || "—";
    const mailer  = headers.match(/^X-Mailer:(.+)$/m)?.[1]?.trim() || "Not disclosed";
    const spf     = headers.match(/spf=(\w+)/)?.[1] || "unknown";
    const dkim    = headers.match(/dkim=(\w+)/)?.[1] || "unknown";
    const ipRegex = /\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/g;
    const ips     = [...new Set([...(headers.matchAll(ipRegex))].map(m => m[1]))];

    const warnings = [];
    if (spf === "fail" || spf === "softfail") warnings.push("⚠️ SPF FAIL — sender domain mismatch");
    if (dkim === "fail" || dkim === "none") warnings.push("⚠️ DKIM not valid — email may be spoofed");
    if (from.includes(".ru") || from.includes(".cn") || from.includes(".tk")) warnings.push("🚨 Suspicious sender TLD");
    if (subject.match(/URGENT|WARNING|ACCOUNT|VERIFY|SUSPENDED/i)) warnings.push("🎣 Possible phishing subject line");
    if (mailer.includes("PHPMailer") && !mailer.includes("latest")) warnings.push("⚠️ Bulk mail tool detected");

    setResults({ from, to, subject, date, msgId, mailer, spf, dkim, ips, receivedHops, warnings });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-mono text-slate-500">Paste full email headers to trace the path and detect spoofing</span>
        <button onClick={() => setHeaders(SAMPLE)}
          className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 text-slate-400 hover:border-[#FFD600]/30 hover:text-[#FFD600] transition">
          Load Sample
        </button>
      </div>
      <textarea value={headers} onChange={e => setHeaders(e.target.value)}
        placeholder="Paste email headers here..."
        rows={7}
        className="w-full glass-input px-3 py-2 text-[11px] font-mono resize-y"
        id="email-header-input" />
      <button onClick={analyze} disabled={!headers.trim()}
        className="btn-accent px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-40">
        <Eye className="w-4 h-4" /> Analyze Headers
      </button>
      {results && (
        <div className="space-y-4">
          {results.warnings.length > 0 && (
            <div className="space-y-1.5">
              {results.warnings.map((w: string, i: number) => (
                <div key={i} className="px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/20 text-red-300 text-[11px] font-mono">{w}</div>
              ))}
            </div>
          )}
          <div className="responsive-2col">
            {[
              { k: "From",      v: results.from },
              { k: "To",        v: results.to },
              { k: "Subject",   v: results.subject },
              { k: "Date",      v: results.date },
              { k: "SPF",       v: results.spf, color: results.spf === "pass" ? "text-green-400" : "text-red-400" },
              { k: "DKIM",      v: results.dkim, color: results.dkim === "pass" ? "text-green-400" : "text-red-400" },
              { k: "Mailer",    v: results.mailer },
              { k: "Message-ID",v: results.msgId },
            ].map(r => (
              <div key={r.k} className="p-2.5 rounded-lg bg-white/3 border border-white/5 font-mono text-[11px]">
                <div className="text-[9px] text-slate-500 mb-0.5">{r.k}</div>
                <div className={`break-all ${(r as any).color || "text-slate-200"}`}>{r.v}</div>
              </div>
            ))}
          </div>
          {results.ips.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-orange-400 font-bold mb-2">🌐 IP Hops ({results.ips.length})</div>
              <div className="flex flex-wrap gap-2">
                {results.ips.map((ip: string) => (
                  <span key={ip} className="text-[11px] font-mono px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/8 text-orange-300">{ip}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-mono text-cyan-400 font-bold mb-2">📍 Received Hops ({results.receivedHops.length})</div>
            <div className="space-y-1">
              {results.receivedHops.map((hop: string, i: number) => (
                <div key={i} className="text-[10px] font-mono text-slate-400 bg-white/2 rounded px-2 py-1 break-all">{i + 1}. {hop}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CyberIntelligence({ token }: Props) {
  const [tab, setTab] = useState<ToolTab>("osint");
  const [osintTool, setOsintTool] = useState<"ip" | "dns" | "whois">("ip");
  const [reconTool, setReconTool] = useState<"headers" | "certs">("headers");

  const TABS: { id: ToolTab; icon: React.ElementType; label: string; desc: string; color: string }[] = [
    { id: "osint",    icon: Globe,        label: "OSINT",            desc: "IP · DNS · WHOIS", color: "text-cyan-400" },
    { id: "recon",    icon: Network,      label: "Reconnaissance",   desc: "Headers · Certs",  color: "text-purple-400" },
    { id: "scanner",  icon: Scan,         label: "Port Scanner",     desc: "TCP Probe",         color: "text-orange-400" },
    { id: "forensics",icon: Fingerprint,  label: "Digital Forensics",desc: "Hash · Logs · Email", color: "text-green-400" },
  ];

  const [forensicsTool, setForensicsTool] = useState<"hash" | "logs" | "email">("hash");

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white tracking-wide flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center glow-cyan">
              <Shield className="w-4 h-4 text-white" />
            </div>
            CYBER INTELLIGENCE HUB
          </h1>
          <p className="text-slate-500 text-xs font-mono mt-1.5 ml-11">
            Real-time OSINT · Recon · Scanner · Digital Forensics — Powered by public APIs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-mono text-green-400">ALL SYSTEMS ONLINE</span>
        </div>
      </div>

      {/* ── Tool Category Tabs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} id={`cyber-tab-${t.id}`}
              className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                active
                  ? `border-current/40 bg-current/5 ${t.color}`
                  : "border-white/5 bg-white/2 text-slate-500 hover:border-white/10 hover:bg-white/4"
              }`}>
              <Icon className={`w-5 h-5 mb-2 ${active ? "" : "opacity-50"}`} />
              <div className="font-orbitron text-[11px] font-bold">{t.label}</div>
              <div className="text-[9px] mt-0.5 opacity-70 font-mono">{t.desc}</div>
            </button>
          );
        })}
      </div>

      {/* ── OSINT Tab ── */}
      {tab === "osint" && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="font-orbitron text-xs font-bold text-cyan-400">OPEN SOURCE INTELLIGENCE</span>
            <div className="flex gap-1.5 ml-auto">
              {(["ip","dns","whois"] as const).map(t => (
                <button key={t} onClick={() => setOsintTool(t)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition ${osintTool === t ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {osintTool === "ip"    && <IpLookup token={token} />}
          {osintTool === "dns"   && <DnsLookup token={token} />}
          {osintTool === "whois" && <WhoisLookup token={token} />}
        </div>
      )}

      {/* ── Reconnaissance Tab ── */}
      {tab === "recon" && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4">
            <Network className="w-4 h-4 text-purple-400" />
            <span className="font-orbitron text-xs font-bold text-purple-400">RECONNAISSANCE</span>
            <div className="flex gap-1.5 ml-auto">
              {(["headers","certs"] as const).map(t => (
                <button key={t} onClick={() => setReconTool(t)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition ${reconTool === t ? "border-purple-500/50 bg-purple-500/10 text-purple-400" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
                  {t === "headers" ? "HTTP HEADERS" : "SSL CERTS"}
                </button>
              ))}
            </div>
          </div>
          {reconTool === "headers" && <HeaderAnalysis token={token} />}
          {reconTool === "certs"   && <CertSearch token={token} />}
        </div>
      )}

      {/* ── Port Scanner Tab ── */}
      {tab === "scanner" && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4">
            <Scan className="w-4 h-4 text-orange-400" />
            <span className="font-orbitron text-xs font-bold text-orange-400">PORT SCANNER</span>
            <span className="ml-auto text-[9px] font-mono text-slate-600">TCP Connect · Up to 20 ports · 1.5s timeout</span>
          </div>
          <PortScanner token={token} />
        </div>
      )}

      {/* ── Digital Forensics Tab ── */}
      {tab === "forensics" && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4">
            <Fingerprint className="w-4 h-4 text-green-400" />
            <span className="font-orbitron text-xs font-bold text-green-400">DIGITAL FORENSICS</span>
            <div className="flex gap-1.5 ml-auto flex-wrap justify-end">
              {(["hash","logs","email"] as const).map(t => (
                <button key={t} onClick={() => setForensicsTool(t)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition ${forensicsTool === t ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
                  {t === "hash" ? "HASH CALC" : t === "logs" ? "LOG PARSER" : "EMAIL HEADERS"}
                </button>
              ))}
            </div>
          </div>
          {forensicsTool === "hash"  && <HashCalc token={token} />}
          {forensicsTool === "logs"  && <LogParser />}
          {forensicsTool === "email" && <EmailHeaderAnalyzer />}
        </div>
      )}

      {/* ── Reference Links ── */}
      <div className="card p-4">
        <div className="font-orbitron text-[10px] text-slate-500 mb-3 tracking-wide">EXTERNAL RESOURCES</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "VirusTotal",  url: "https://www.virustotal.com" },
            { label: "Shodan",      url: "https://www.shodan.io" },
            { label: "Censys",      url: "https://search.censys.io" },
            { label: "MXToolbox",   url: "https://mxtoolbox.com" },
            { label: "RDAP.org",    url: "https://rdap.org" },
            { label: "crt.sh",      url: "https://crt.sh" },
            { label: "AbuseIPDB",   url: "https://www.abuseipdb.com" },
            { label: "Hybrid Analysis", url: "https://www.hybrid-analysis.com" },
          ].map(r => (
            <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/2 text-slate-400 hover:border-[#FFD600]/30 hover:text-[#FFD600] hover:bg-[#FFD600]/5 transition">
              <ExternalLink className="w-3 h-3" />
              {r.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
