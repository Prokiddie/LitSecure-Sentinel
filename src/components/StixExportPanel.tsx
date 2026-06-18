/**
 * LitSecure Sentinel — STIX/TAXII Export Panel (Phase 3)
 * Dashboard for sharing threat intelligence with MACERT and partner CERTs
 * in STIX 2.1 format. Calls /api/stix/* endpoints.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Share2, Download, RefreshCw, Loader2, CheckCircle2,
  Globe, Wifi, Hash, Link, Upload, AlertTriangle,
  Shield, Database, ChevronRight, Copy, ExternalLink
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StixStats {
  indicators:  number;
  incidents:   number;
  byType:      Array<{ type: string; count: number }>;
  bySource:    Array<{ source: string; count: number }>;
  lastExport:  string;
  formats:     string[];
  partners:    string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authH() {
  const t = sessionStorage.getItem("sentinel_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  ip: Wifi, domain: Globe, hash: Hash, url: Link,
};

// ─── Partner list ─────────────────────────────────────────────────────────────

const PARTNERS = [
  { id: "macert",   name: "MACERT",         country: "🇲🇼", status: "active",   lastSync: "2 hours ago"   },
  { id: "zicta",    name: "ZICTA-CERT",     country: "🇿🇲", status: "active",   lastSync: "6 hours ago"   },
  { id: "kecirt",   name: "KE-CIRT/CC",     country: "🇰🇪", status: "pending",  lastSync: "2 days ago"    },
  { id: "tzcert",   name: "TZ-CERT",        country: "🇹🇿", status: "active",   lastSync: "1 day ago"     },
  { id: "africa",   name: "AfricaCERT",     country: "🌍", status: "active",   lastSync: "3 hours ago"   },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StixExportPanel() {
  const [stats,    setStats]    = useState<StixStats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [copying,  setCopying]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [ingestResult, setIngestResult] = useState<{ ingested: number; total: number } | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [tab,      setTab]      = useState<"overview" | "export" | "ingest" | "partners">("overview");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/stix/stats", { headers: authH() });
      if (r.ok) setStats(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyBundle = async () => {
    setCopying(true);
    try {
      const r = await fetch("/api/stix/bundle?limit=50", { headers: authH() });
      const text = JSON.stringify(await r.json(), null, 2);
      await navigator.clipboard.writeText(text);
      setTimeout(() => setCopying(false), 1500);
    } catch { setCopying(false); }
  };

  const downloadBundle = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/stix/bundle?limit=500", { headers: authH() });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `litsecure-stix-bundle-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const submitIngest = async () => {
    if (!ingestText.trim()) return;
    setIngesting(true); setIngestResult(null);
    try {
      const parsed = JSON.parse(ingestText);
      const objects = parsed.objects ?? (Array.isArray(parsed) ? parsed : [parsed]);
      const r = await fetch("/api/stix/ingest", {
        method: "POST", headers: authH(),
        body: JSON.stringify({ objects }),
      });
      if (r.ok) setIngestResult(await r.json());
    } catch (e: any) { setError("Invalid JSON or STIX bundle: " + e.message); }
    finally { setIngesting(false); }
  };

  return (
    <div className="space-y-5" id="stix-export-panel">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0a0e18] to-[#0A0E1A] border border-cyan-500/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-cyan-500/50 via-blue-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">STIX 2.1 / TAXII INTELLIGENCE SHARING</h2>
              <p className="text-[10px] text-slate-500 font-mono">Export · Ingest · Partner CERTs · TLP:WHITE/GREEN/AMBER</p>
            </div>
          </div>
          <div className="sm:ml-auto flex gap-2 shrink-0">
            <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={downloadBundle} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition disabled:opacity-50">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export Bundle
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* KPI strip */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Indicators",  val: stats.indicators, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",     icon: Shield   },
            { label: "Incidents",   val: stats.incidents,  color: "text-blue-400 bg-blue-500/10 border-blue-500/20",     icon: Database },
            { label: "Partners",    val: stats.partners.length, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: Globe },
            { label: "Formats",     val: stats.formats.join(" · "), color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20", icon: Share2 },
          ].map(({ label, val, color, icon: I }) => (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <div className="flex items-center gap-2 mb-1">
                <I className="w-3 h-3 opacity-60" />
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-60">{label}</span>
              </div>
              <div className="text-xl font-bold font-mono">{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {([
          { id: "overview", label: "Overview",  icon: Shield   },
          { id: "export",   label: "Export",    icon: Download },
          { id: "ingest",   label: "Ingest",    icon: Upload   },
          { id: "partners", label: "Partners",  icon: Globe    },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono font-bold transition-all ${
              tab === t.id ? "text-cyan-400 border-b-2 border-cyan-400 -mb-px" : "text-slate-500 hover:text-slate-300"
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By type */}
          <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4 space-y-3">
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Indicators by Type</h3>
            {stats.byType.length === 0 ? (
              <p className="text-xs font-mono text-slate-600">No typed indicators in database yet</p>
            ) : (
              <div className="space-y-2">
                {stats.byType.map(({ type, count }) => {
                  const Icon = TYPE_ICONS[type] ?? Shield;
                  const pct = Math.round((count / stats.indicators) * 100) || 0;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-xs font-mono text-slate-400 w-16 shrink-0">{type}</span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 w-10 text-right shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* By source */}
          <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4 space-y-3">
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Indicators by Source</h3>
            {stats.bySource.length === 0 ? (
              <p className="text-xs font-mono text-slate-600">No sourced indicators yet</p>
            ) : (
              <div className="space-y-2">
                {stats.bySource.slice(0, 8).map(({ source, count }) => (
                  <div key={source} className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400 truncate">{source}</span>
                    <span className="text-slate-600 ml-2 shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* STIX spec info */}
          <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4 space-y-3 lg:col-span-2">
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Bundle Specification</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "STIX Version",  val: "2.1" },
                { label: "TAXII Version", val: "2.1" },
                { label: "TLP Support",   val: "WHITE / GREEN / AMBER" },
                { label: "Object Types",  val: "indicator, observed-data, identity, relationship" },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/3 rounded-lg px-3 py-2">
                  <p className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">{label}</p>
                  <p className="text-[10px] font-mono text-slate-300 mt-0.5">{val}</p>
                </div>
              ))}
            </div>
            <div className="bg-white/3 border border-white/5 rounded-lg p-3 font-mono text-[10px] text-slate-500">
              <p className="text-slate-400 mb-1">GET <span className="text-cyan-400">/api/stix/bundle</span>  — Full STIX 2.1 bundle (indicators + incidents)</p>
              <p className="text-slate-400 mb-1">GET <span className="text-cyan-400">/api/stix/indicators?limit=50&source=AbuseIPDB</span>  — Paginated feed</p>
              <p className="text-slate-400 mb-1">POST <span className="text-cyan-400">/api/stix/ingest</span>  — Ingest partner STIX bundle</p>
              <p className="text-slate-400">GET <span className="text-cyan-400">/api/stix/stats</span>  — Collection statistics</p>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT */}
      {tab === "export" && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-xl border border-white/10 bg-[#05080F]/60 p-4 space-y-4">
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Export Options</h3>

            {[
              { label: "Full Bundle (all indicators + incidents)", url: "/api/stix/bundle?limit=500",        desc: "STIX 2.1 JSON — all threat data, TLP:WHITE" },
              { label: "Indicators Only",                          url: "/api/stix/bundle?type=indicators",  desc: "Only network indicators (IPs, domains, hashes)" },
              { label: "Incidents Only",                           url: "/api/stix/bundle?type=incidents",   desc: "Observed-data objects from incident log" },
              { label: "Last 50 Indicators",                       url: "/api/stix/indicators?limit=50",     desc: "Paginated indicator feed" },
            ].map(opt => (
              <div key={opt.url} className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/5 hover:border-white/10 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-200">{opt.label}</p>
                  <p className="text-[10px] font-mono text-slate-500 truncate">{opt.desc}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={async () => {
                      const r = await fetch(opt.url, { headers: authH() });
                      const text = JSON.stringify(await r.json(), null, 2);
                      await navigator.clipboard.writeText(text);
                    }}
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/10 transition"
                    title="Copy JSON"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      const r = await fetch(opt.url, { headers: authH() });
                      const blob = await r.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `stix-export-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-1.5 rounded text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[#FFD600]/15 bg-[#FFD600]/5 p-4 space-y-1 text-[10px] font-mono">
            <p className="text-[#FFD600] font-bold uppercase tracking-wider text-[9px] mb-2">🔐 TLP Guidance</p>
            <p><span className="text-white">TLP:WHITE</span> — Share publicly. For awareness campaigns and OSINT.</p>
            <p><span className="text-white">TLP:GREEN</span> — Share within the community (MACERT partners).</p>
            <p><span className="text-white">TLP:AMBER</span> — Restricted to named organisations only.</p>
          </div>
        </div>
      )}

      {/* INGEST */}
      {tab === "ingest" && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-xl border border-white/10 bg-[#05080F]/60 p-4 space-y-3">
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Ingest Partner STIX Bundle</h3>
            <p className="text-[10px] text-slate-500 font-mono">Paste a STIX 2.1 bundle JSON from a partner CERT. New indicators will be added to the local threat database.</p>
            <textarea
              value={ingestText}
              onChange={e => setIngestText(e.target.value)}
              rows={10}
              placeholder={'{\n  "type": "bundle",\n  "spec_version": "2.1",\n  "objects": [...]\n}'}
              className="w-full bg-white/3 border border-white/10 rounded-lg px-3 py-2.5 text-[10px] font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-cyan-500/40 resize-y"
            />
            {ingestResult && (
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 rounded px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Ingested {ingestResult.ingested} of {ingestResult.total} objects into the threat database.
              </div>
            )}
            <button onClick={submitIngest} disabled={ingesting || !ingestText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition disabled:opacity-50">
              {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Ingest Bundle
            </button>
          </div>
        </div>
      )}

      {/* PARTNERS */}
      {tab === "partners" && (
        <div className="space-y-3 max-w-2xl">
          <div className="rounded-xl border border-white/8 bg-[#05080F]/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8">
              <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Sharing Partners</h3>
            </div>
            <div className="divide-y divide-white/5">
              {PARTNERS.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl shrink-0">{p.country}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-200">{p.name}</p>
                    <p className="text-[10px] font-mono text-slate-600">Last sync: {p.lastSync}</p>
                  </div>
                  <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
                    p.status === "active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" : "text-yellow-400 bg-yellow-500/10 border-yellow-500/25"
                  }`}>{p.status.toUpperCase()}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4 text-[10px] font-mono text-slate-500 space-y-1">
            <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider mb-2">📡 TAXII 2.1 Collection URL</p>
            <code className="text-cyan-400 break-all block bg-white/3 rounded px-2 py-1.5">
              {window.location.origin}/api/stix/bundle
            </code>
            <p className="text-slate-600 mt-1">Share this URL with partner CERTs — they can consume it directly with any TAXII 2.1-compatible client.</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      )}
    </div>
  );
}
