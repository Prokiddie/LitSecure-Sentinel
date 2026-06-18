/**
 * LitSecure Sentinel — Reputation Checker (Phase 2)
 * Live lookup of IPs, domains, and Malawian phone numbers against
 * the local reputation database (/api/reputation).
 */
import React, { useState } from "react";
import {
  Search, Shield, AlertTriangle, CheckCircle2,
  Globe, Wifi, Phone, Loader2, Clock, Hash
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RepResult {
  type:         "ip" | "domain" | "phone";
  value:        string;
  score:        number;
  riskLevel:    "CRITICAL" | "HIGH" | "MEDIUM" | "CLEAN";
  flags:        string[];
  checkedAt:    string;
  // IP extras
  isBlocked?:   boolean;
  isMalawiASN?: boolean;
  geoCountry?:  string;
  geoISP?:      string;
  // Domain extras
  typosquatOf?: string | null;
  isMalawiDomain?: boolean;
  // Phone extras
  mwCarrier?:   string;
  telecomAlerts?: number;
  incidentCount?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const RISK_COLORS = {
  CRITICAL: { badge: "bg-red-500/15 text-red-400 border-red-500/30",       bar: "bg-red-500",      ring: "border-red-500/40 bg-red-500/8"     },
  HIGH:     { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", bar: "bg-orange-500", ring: "border-orange-500/40 bg-orange-500/8" },
  MEDIUM:   { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", bar: "bg-yellow-500", ring: "border-yellow-500/40 bg-yellow-500/8" },
  CLEAN:    { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", bar: "bg-emerald-500", ring: "border-emerald-500/40 bg-emerald-500/8" },
};

const QUICK_TESTS = [
  { label: "Known Malicious IP",  type: "ip",     value: "91.92.40.11"   },
  { label: "Airtel Typosquat",    type: "domain",  value: "airte1.mw"    },
  { label: "Legit MW Domain",     type: "domain",  value: "airtel.mw"    },
  { label: "MW Phone Number",     type: "phone",   value: "+265888001234" },
  { label: "Google DNS",          type: "ip",      value: "8.8.8.8"      },
  { label: "Phishing Domain",     type: "domain",  value: "sbm-malawi.tk"},
];

function authH() {
  const t = sessionStorage.getItem("sentinel_token");
  return { Authorization: `Bearer ${t}` };
}

// ─── Score gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score, riskLevel }: { score: number; riskLevel: string }) {
  const cols = RISK_COLORS[riskLevel as keyof typeof RISK_COLORS] ?? RISK_COLORS.CLEAN;
  const angle = (score / 100) * 180;
  const r = 40;
  const cx = 60; const cy = 55;
  const toRad = (d: number) => (d - 180) * (Math.PI / 180);
  const x = cx + r * Math.cos(toRad(angle));
  const y = cy + r * Math.sin(toRad(angle));

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="65" viewBox="0 0 120 65">
        {/* Track */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" strokeLinecap="round" />
        {/* Fill */}
        {score > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${angle > 90 ? 1 : 0} 1 ${x} ${y}`}
            fill="none"
            stroke={cols.bar.replace("bg-", "").includes("red") ? "#ef4444" : cols.bar.includes("orange") ? "#f97316" : cols.bar.includes("yellow") ? "#eab308" : "#10b981"}
            strokeWidth="8" strokeLinecap="round" />
        )}
        {/* Needle */}
        <circle cx={x} cy={y} r="4" fill="white" opacity="0.9" />
        {/* Score text */}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="monospace">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">/100</text>
      </svg>
      <span className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${cols.badge}`}>{riskLevel}</span>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

interface ResultCardProps { result: RepResult; }

const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const cols = RISK_COLORS[result.riskLevel] ?? RISK_COLORS.CLEAN;
  const TypeIcon = result.type === "ip" ? Wifi : result.type === "domain" ? Globe : Phone;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${cols.ring}`}>
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cols.badge}`}>
          <TypeIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold font-mono text-white truncate">{result.value}</p>
          <p className="text-[10px] text-slate-500 font-mono uppercase">
            {result.type} reputation • checked {new Date(result.checkedAt).toLocaleTimeString()}
          </p>
        </div>
        <ScoreGauge score={result.score} riskLevel={result.riskLevel} />
      </div>

      {/* Risk flags */}
      {result.flags.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Risk Flags</p>
          {result.flags.map((flag, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
              <span className="text-xs font-mono text-slate-300">{flag}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-xs font-mono">No threat indicators found</span>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        {result.type === "ip" && <>
          <div className="bg-white/3 rounded px-2 py-1.5">
            <span className="text-slate-600">Blocked</span>
            <div className={`font-bold mt-0.5 ${result.isBlocked ? "text-red-400" : "text-emerald-400"}`}>
              {result.isBlocked ? "YES" : "NO"}
            </div>
          </div>
          <div className="bg-white/3 rounded px-2 py-1.5">
            <span className="text-slate-600">Malawi ASN</span>
            <div className={`font-bold mt-0.5 ${result.isMalawiASN ? "text-blue-400" : "text-slate-400"}`}>
              {result.isMalawiASN ? "YES" : "NO"}
            </div>
          </div>
          {result.geoCountry && (
            <div className="bg-white/3 rounded px-2 py-1.5">
              <span className="text-slate-600">Country</span>
              <div className="font-bold text-slate-300 mt-0.5">{result.geoCountry}</div>
            </div>
          )}
          {result.geoISP && result.geoISP !== "Unknown" && (
            <div className="bg-white/3 rounded px-2 py-1.5">
              <span className="text-slate-600">ISP</span>
              <div className="font-bold text-slate-300 mt-0.5 truncate">{result.geoISP}</div>
            </div>
          )}
        </>}
        {result.type === "domain" && <>
          <div className="bg-white/3 rounded px-2 py-1.5">
            <span className="text-slate-600">.mw Domain</span>
            <div className={`font-bold mt-0.5 ${result.isMalawiDomain ? "text-blue-400" : "text-slate-400"}`}>
              {result.isMalawiDomain ? "YES" : "NO"}
            </div>
          </div>
          <div className="bg-white/3 rounded px-2 py-1.5">
            <span className="text-slate-600">Typosquat Of</span>
            <div className={`font-bold mt-0.5 truncate ${result.typosquatOf ? "text-orange-400" : "text-slate-500"}`}>
              {result.typosquatOf ?? "—"}
            </div>
          </div>
        </>}
        {result.type === "phone" && <>
          <div className="bg-white/3 rounded px-2 py-1.5">
            <span className="text-slate-600">Carrier</span>
            <div className="font-bold text-slate-300 mt-0.5">{result.mwCarrier ?? "Unknown"}</div>
          </div>
          <div className="bg-white/3 rounded px-2 py-1.5">
            <span className="text-slate-600">Telecom Alerts</span>
            <div className={`font-bold mt-0.5 ${(result.telecomAlerts ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {result.telecomAlerts ?? 0}
            </div>
          </div>
        </>}
        <div className="bg-white/3 rounded px-2 py-1.5">
          <span className="text-slate-600">Incidents</span>
          <div className={`font-bold mt-0.5 ${(result.incidentCount ?? 0) > 0 ? "text-yellow-400" : "text-slate-500"}`}>
            {result.incidentCount ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReputationChecker() {
  const [inputType,  setInputType]  = useState<"ip" | "domain" | "phone">("ip");
  const [inputValue, setInputValue] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [results,    setResults]    = useState<RepResult[]>([]);
  const [error,      setError]      = useState<string | null>(null);

  const lookup = async (type: string = inputType, value: string = inputValue) => {
    const v = value.trim();
    if (!v) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reputation/${type}/${encodeURIComponent(v)}`, { headers: authH() });
      if (!r.ok) { setError(`API error: ${r.status}`); return; }
      const data = await r.json();
      const result: RepResult = { type: type as any, value: v, ...data };
      setResults(prev => [result, ...prev.filter(x => !(x.type === type && x.value === v))].slice(0, 8));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const quickTest = (t: typeof QUICK_TESTS[0]) => {
    setInputType(t.type as any);
    setInputValue(t.value);
    lookup(t.type, t.value);
  };

  return (
    <div className="space-y-5" id="reputation-checker">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#100e1a] to-[#0A0E1A] border border-purple-500/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-purple-500/50 via-blue-500/30 to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Search className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">MALAWIAN REPUTATION DATABASE</h2>
              <p className="text-[10px] text-slate-500 font-mono">IP · Domain · Phone · AbuseIPDB · Blocklist · Incident History · Typosquat Detection</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="rounded-xl border border-white/10 bg-[#05080F]/80 p-4 space-y-3">
        {/* Type selector */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs font-mono">
          {([
            { id: "ip",     label: "IP Address", icon: Wifi   },
            { id: "domain", label: "Domain",     icon: Globe  },
            { id: "phone",  label: "Phone",       icon: Phone  },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setInputType(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition ${
                inputType === t.id ? "bg-purple-500/20 text-purple-300" : "text-slate-500 hover:text-slate-300"
              }`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && lookup()}
            placeholder={
              inputType === "ip" ? "e.g. 91.92.40.11" :
              inputType === "domain" ? "e.g. airte1.mw" :
              "e.g. +265888001234"
            }
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/40"
          />
          <button
            onClick={() => lookup()}
            disabled={loading || !inputValue.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold font-mono transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Check
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}
      </div>

      {/* Quick tests */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Quick Tests</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_TESTS.map(t => (
            <button key={t.value} onClick={() => quickTest(t)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-[10px] font-mono text-slate-400 hover:text-white hover:border-white/20 hover:bg-white/5 transition">
              {t.type === "ip" ? <Wifi className="w-3 h-3" /> : t.type === "domain" ? <Globe className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{results.length} Lookup{results.length !== 1 ? "s" : ""}</p>
            <button onClick={() => setResults([])} className="text-[10px] font-mono text-slate-600 hover:text-slate-400 transition">
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {results.map((r, i) => (
              <ResultCard key={`${r.type}-${r.value}-${i}`} result={r} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !loading && (
        <div className="text-center py-16 text-slate-700">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-mono">Enter an IP, domain, or Malawian phone number<br />to check its reputation score</p>
          <p className="text-[10px] font-mono mt-2 opacity-60">Cross-references AbuseIPDB · Blocklist · Watchlist · Incident history</p>
        </div>
      )}
    </div>
  );
}
