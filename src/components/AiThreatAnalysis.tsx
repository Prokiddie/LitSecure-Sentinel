import React, { useState } from "react";
import {
  Brain, Zap, Search, AlertTriangle, CheckCircle, Loader2,
  TrendingUp, Shield, Globe, Smartphone, Activity,
  ChevronRight, RefreshCw, Target, BarChart3, Users
} from "lucide-react";

// ─── Threat Pattern Analysis ──────────────────────────────────────────────────

interface Pattern {
  title: string;
  description: string;
  affectedSectors: string[];
  severity: string;
  incidentIds?: string[];
}
interface Recommendation { priority: string; action: string; owner: string; }
interface PatternResult {
  aiPowered: boolean;
  summary: string;
  riskScore: number;
  dominantThreatActor: string;
  patterns: Pattern[];
  recommendations: Recommendation[];
}

function PatternAnalysis() {
  const [result, setResult]   = useState<PatternResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const run = async () => {
    const token = sessionStorage.getItem("sentinel_token");
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error (${res.status}) — check your session`);
      }
      setResult(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const riskColor = (score: number) =>
    score >= 75 ? "text-red-400" : score >= 50 ? "text-orange-400" : score >= 25 ? "text-[#FFD600]" : "text-green-400";

  const sevBadge = (s: string) => {
    const map: Record<string, string> = {
      Critical: "bg-red-500/15 text-red-400 border-red-500/30",
      High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
      Medium:   "bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/30",
      Low:      "bg-slate-500/10 text-slate-400 border-slate-500/30",
    };
    return map[s] || map.Low;
  };

  const priColor = (p: string) =>
    p === "Critical" ? "text-red-400" : p === "High" ? "text-orange-400" : "text-[#FFD600]";

  return (
    <div className="space-y-5">
      {/* CTA */}
      <div className="bg-[#05080F] border border-white/8 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-[#FFD600] rounded-full" />
            <h3 className="font-grotesk font-bold text-white text-sm">National Threat Pattern Analysis</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Gemini AI analyzes all incidents in the database to identify coordinated attack campaigns, sector vulnerabilities, and emerging threat actors across Malawi's digital infrastructure.
          </p>
        </div>
        <button
          id="run-pattern-analysis-btn"
          onClick={run}
          disabled={loading}
          className="btn-accent px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 shrink-0 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {loading ? "Analyzing..." : "Run AI Analysis"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Risk header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#05080F] border border-white/8 rounded-xl p-4 text-center">
              <div className={`font-bebas text-5xl ${riskColor(result.riskScore)}`}>{result.riskScore}</div>
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-1">National Risk Score / 100</div>
              <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#FFD600] transition-all" style={{ width: `${result.riskScore}%` }} />
              </div>
            </div>
            <div className="bg-[#05080F] border border-white/8 rounded-xl p-4 text-center">
              <Target className="w-8 h-8 text-[#FFD600] mx-auto mb-2" />
              <div className="text-sm font-bold text-white">{result.dominantThreatActor}</div>
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-1">Dominant Threat Actor</div>
            </div>
            <div className="bg-[#05080F] border border-white/8 rounded-xl p-4 text-center">
              <BarChart3 className="w-8 h-8 text-[#FFD600] mx-auto mb-2" />
              <div className="text-2xl font-bebas text-white">{result.patterns.length}</div>
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-1">Attack Patterns Detected</div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#FFD600]/5 border border-[#FFD600]/15 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-[#FFD600]" />
              <span className="text-[10px] font-mono font-bold text-[#FFD600] uppercase tracking-wider">AI Strategic Assessment</span>
              {result.aiPowered && <span className="ml-auto text-[9px] bg-[#FFD600]/15 text-[#FFD600] border border-[#FFD600]/20 px-2 py-0.5 rounded-full font-mono">GEMINI POWERED</span>}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
          </div>

          {/* Patterns */}
          {result.patterns.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-[#FFD600]" /> Identified Attack Patterns
              </h4>
              <div className="space-y-3">
                {result.patterns.map((p, i) => (
                  <div key={i} className="bg-[#05080F] border border-white/8 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#FFD600]/15 text-[#FFD600] text-[10px] font-bold flex items-center justify-center font-mono shrink-0">{i + 1}</span>
                        <h5 className="text-sm font-semibold text-white">{p.title}</h5>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${sevBadge(p.severity)} shrink-0`}>{p.severity}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed ml-7 mb-2">{p.description}</p>
                    <div className="flex flex-wrap gap-1.5 ml-7">
                      {p.affectedSectors.map(s => (
                        <span key={s} className="text-[9px] font-mono bg-slate-800/60 text-slate-400 border border-white/8 px-2 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#FFD600]" /> Strategic Recommendations
              </h4>
              <div className="space-y-2">
                {result.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 bg-[#05080F] border border-white/8 rounded-lg px-4 py-3">
                    <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 ${priColor(r.priority)}`} />
                    <div className="flex-1">
                      <p className="text-xs text-slate-200 leading-relaxed">{r.action}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[9px] font-bold font-mono ${priColor(r.priority)}`}>{r.priority} PRIORITY</span>
                        <span className="text-[9px] text-slate-600 font-mono">→ {r.owner}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── IOC Enrichment ───────────────────────────────────────────────────────────

interface IocResult {
  indicator: string; type: string; riskLevel: string;
  analysis: string; relatedThreats: string[]; mitigations: string[];
  geolocation?: string; confidence?: number; aiPowered: boolean;
}

function IocEnrichment() {
  const [indicator, setIndicator] = useState("");
  const [type, setType]           = useState<"phone" | "ip" | "domain" | "hash">("phone");
  const [result, setResult]       = useState<IocResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  const run = async () => {
    if (!indicator.trim()) return;
    const token = sessionStorage.getItem("sentinel_token");
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/ai/enrich-ioc", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ indicator: indicator.trim(), type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error (${res.status}) — check your session`);
      }
      setResult(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const riskBadge = (r: string) => {
    const map: Record<string, string> = {
      Critical: "bg-red-500/15 text-red-400 border-red-500/30",
      High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
      Medium:   "bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/30",
      Low:      "bg-slate-500/10 text-slate-400 border-slate-500/30",
      Unknown:  "bg-slate-700/30 text-slate-500 border-slate-700/30",
    };
    return map[r] || map.Unknown;
  };

  const typeIcon = () => {
    if (type === "phone")  return <Smartphone className="w-4 h-4 text-[#FFD600]" />;
    if (type === "ip")     return <Activity className="w-4 h-4 text-blue-400" />;
    if (type === "domain") return <Globe className="w-4 h-4 text-purple-400" />;
    return <Shield className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#05080F] border border-white/8 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-[#FFD600] rounded-full" />
          <h3 className="font-grotesk font-bold text-white text-sm">IOC Deep Enrichment</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Submit a phone number, IP address, domain, or file hash. SENTINEL AI will analyze it against known Malawian and Southern African threat patterns.
        </p>

        <div className="flex gap-3 flex-col sm:flex-row">
          <select
            value={type}
            onChange={e => setType(e.target.value as any)}
            className="bg-[#0A0E1A] border border-white/10 text-xs text-slate-300 rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#FFD600]/50 shrink-0"
            id="ioc-type-select"
          >
            <option value="phone">📱 Phone Number</option>
            <option value="ip">🌐 IP Address</option>
            <option value="domain">🔗 Domain</option>
            <option value="hash">🔐 File Hash</option>
          </select>
          <input
            type="text"
            value={indicator}
            onChange={e => setIndicator(e.target.value)}
            onKeyDown={e => e.key === "Enter" && run()}
            placeholder={type === "phone" ? "+265991234567" : type === "ip" ? "192.168.1.1" : type === "domain" ? "mra-portal-secure.online" : "d41d8cd98f00b204..."}
            className="flex-1 bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/50 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono"
            id="ioc-indicator-input"
          />
          <button
            id="enrich-ioc-btn"
            onClick={run}
            disabled={loading || !indicator.trim()}
            className="btn-accent px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-40 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Enrich
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="bg-[#05080F] border border-white/8 rounded-xl p-5 space-y-4 animate-fade-in">
          {/* IOC header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {typeIcon()}
              <code className="font-mono text-sm text-white bg-[#0A0E1A] border border-white/10 px-3 py-1 rounded">{result.indicator}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${riskBadge(result.riskLevel)}`}>{result.riskLevel} RISK</span>
              {result.aiPowered && <span className="text-[9px] bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 px-2 py-0.5 rounded-full font-mono">GEMINI</span>}
            </div>
          </div>

          {result.confidence !== undefined && (
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
                <span>AI Confidence</span><span>{Math.round(result.confidence * 100)}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#FFD600] rounded-full" style={{ width: `${result.confidence * 100}%` }} />
              </div>
            </div>
          )}

          <div className="bg-[#FFD600]/5 border border-[#FFD600]/15 rounded-lg p-3">
            <p className="text-xs text-slate-300 leading-relaxed">{result.analysis}</p>
          </div>

          {result.geolocation && (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Globe className="w-3.5 h-3.5 text-[#FFD600]" /> {result.geolocation}
            </div>
          )}

          {result.relatedThreats.length > 0 && (
            <div>
              <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">Related Threat Families</p>
              <div className="flex flex-wrap gap-1.5">
                {result.relatedThreats.map((t, i) => (
                  <span key={i} className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}

          {result.mitigations.length > 0 && (
            <div>
              <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">Recommended Mitigations</p>
              <ul className="space-y-1.5">
                {result.mitigations.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle className="w-3.5 h-3.5 text-[#FFD600] shrink-0 mt-0.5" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Log Anomaly Detection ────────────────────────────────────────────────────

interface Anomaly {
  logEntry: string; anomalyType: string;
  riskScore: number; explanation: string; recommended: string;
}
interface AnomalyResult {
  aiPowered: boolean; overallRisk: string;
  summary: string; anomalies: Anomaly[];
}

function AnomalyDetection() {
  const [result, setResult]   = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const run = async () => {
    const token = sessionStorage.getItem("sentinel_token");
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/ai/anomaly", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ logs: [] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error (${res.status}) — check your session`);
      }
      setResult(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const scoreColor = (s: number) =>
    s >= 8 ? "text-red-400 bg-red-500/10 border-red-500/25" :
    s >= 5 ? "text-orange-400 bg-orange-500/10 border-orange-500/25" :
    "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25";

  return (
    <div className="space-y-5">
      <div className="bg-[#05080F] border border-white/8 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-[#FFD600] rounded-full" />
            <h3 className="font-grotesk font-bold text-white text-sm">AI Log Anomaly Detection</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            SENTINEL AI scans infrastructure and simulated CCTV/network logs for attack signatures, unusual access patterns, and behavioral anomalies.
          </p>
        </div>
        <button
          id="run-anomaly-btn"
          onClick={run}
          disabled={loading}
          className="btn-accent px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 shrink-0 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {loading ? "Scanning..." : "Scan Logs"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-4 bg-[#05080F] border border-white/8 rounded-xl p-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded border ${
                  result.overallRisk === "Critical" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                  result.overallRisk === "High" ? "text-orange-400 border-orange-500/30 bg-orange-500/10" :
                  "text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10"
                }`}>{result.overallRisk} Risk</span>
                {result.aiPowered && <span className="text-[9px] bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 px-2 py-0.5 rounded-full font-mono">GEMINI</span>}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{result.summary}</p>
            </div>
            <div className="text-center shrink-0">
              <div className="font-bebas text-4xl text-[#FFD600]">{result.anomalies.length}</div>
              <div className="text-[9px] text-slate-500 font-mono uppercase">Anomalies</div>
            </div>
          </div>

          {result.anomalies.length > 0 && (
            <div className="space-y-3">
              {result.anomalies.map((a, i) => (
                <div key={i} className="bg-[#05080F] border border-white/8 rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border shrink-0 ${scoreColor(a.riskScore)}`}>
                      {a.riskScore}/10
                    </span>
                    <code className="text-[10px] font-mono text-slate-400 bg-[#0A0E1A] px-2 py-1 rounded border border-white/8 flex-1 break-all">{a.logEntry}</code>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">{a.anomalyType}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">{a.explanation}</p>
                  <div className="flex items-start gap-1.5 text-xs text-slate-300 bg-[#FFD600]/5 border border-[#FFD600]/10 rounded-lg px-3 py-2">
                    <CheckCircle className="w-3.5 h-3.5 text-[#FFD600] shrink-0 mt-0.5" />
                    <span>{a.recommended}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

type SubTab = "patterns" | "ioc" | "anomaly";

export default function AiThreatAnalysis() {
  const [tab, setTab] = useState<SubTab>("patterns");

  const TABS = [
    { id: "patterns" as SubTab, label: "Pattern Analysis", icon: TrendingUp },
    { id: "ioc"      as SubTab, label: "IOC Enrichment",   icon: Search     },
    { id: "anomaly"  as SubTab, label: "Anomaly Detection",icon: Zap        },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 bg-[#05080F] border border-white/8 rounded-xl p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`ai-subtab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                tab === t.id
                  ? "bg-[#FFD600] text-[#05080F]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "patterns" && <PatternAnalysis />}
      {tab === "ioc"      && <IocEnrichment />}
      {tab === "anomaly"  && <AnomalyDetection />}
    </div>
  );
}
