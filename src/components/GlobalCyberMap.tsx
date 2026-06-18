/**
 * LitSecure Sentinel — Global Cyber Threat Map (Phase 1)
 * Kaspersky-inspired canvas world map showing country-level threat
 * intelligence with animated pulses, connecting lines from Malawi,
 * and a live top-threat leaderboard.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, AlertTriangle, Shield, TrendingUp,
  RefreshCw, Loader2, Wifi, Hash, Link, Server
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CountryThreat {
  countryCode: string;
  country:     string;
  threatLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  incidents:   number;
  topThreats:  string[];
  coordinates: { lat: number; lon: number };
  region:      string;
  indicatorCount: number;
}

interface GlobalSummary {
  totalThreatIntel:  number;
  blocklisted:       number;
  activeAgents:      number;
  quarantined:       number;
  topSectors:        Array<{ sector: string; count: number }>;
  threatsByCategory: Array<{ category: string; count: number }>;
  timestamp:         string;
}

interface FeedStats {
  totalIndicators: number;
  totalBlocklisted: number;
  bySource: Array<{ source: string; count: number; avg_confidence: number }>;
  feeds: Array<{ key: string; name: string; enabled: boolean; lastRunAt: string | null; intervalMin: number }>;
}

// ─── Country Code → Full Name ─────────────────────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CN: "China",     RU: "Russia",     IN: "India",
  BR: "Brazil",        GB: "UK",        DE: "Germany",    FR: "France",
  JP: "Japan",         KR: "South Korea", UA: "Ukraine",  IR: "Iran",
  PK: "Pakistan",      BD: "Bangladesh", VN: "Vietnam",   ZA: "South Africa",
  NG: "Nigeria",       KE: "Kenya",     GH: "Ghana",      ZM: "Zambia",
  TZ: "Tanzania",      MZ: "Mozambique", MW: "Malawi",
};

// ─── Threat Level Colors ─────────────────────────────────────────────────────

const THREAT_COLORS = {
  CRITICAL: { dot: "#ef4444", glow: "rgba(239,68,68,0.4)",  text: "text-red-400",    badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  HIGH:     { dot: "#f59e0b", glow: "rgba(245,158,11,0.3)", text: "text-yellow-400", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  MEDIUM:   { dot: "#3b82f6", glow: "rgba(59,130,246,0.3)", text: "text-blue-400",   badge: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  LOW:      { dot: "#10b981", glow: "rgba(16,185,129,0.2)", text: "text-emerald-400",badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function latLonToCanvas(lat: number, lon: number, w: number, h: number): [number, number] {
  const x = ((lon + 180) / 360) * w;
  const y = ((90  - lat)  / 180) * h;
  return [x, y];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GlobalCyberMap() {
  const [countries,    setCountries]    = useState<CountryThreat[]>([]);
  const [summary,      setSummary]      = useState<GlobalSummary | null>(null);
  const [feedStats,    setFeedStats]    = useState<FeedStats | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [timeRange,    setTimeRange]    = useState<"24h" | "7d" | "30d">("24h");
  const [selected,     setSelected]     = useState<CountryThreat | null>(null);
  const [activeTab,    setActiveTab]    = useState<"map" | "ips" | "hashes" | "feeds">("map");
  const [topIPs,       setTopIPs]       = useState<any[]>([]);
  const [topHashes,    setTopHashes]    = useState<any[]>([]);
  const [pulseFrame,   setPulseFrame]   = useState(0);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const animRef     = useRef<number>();
  const token       = () => sessionStorage.getItem("sentinel_token");
  const authH       = () => ({ Authorization: `Bearer ${token()}` });

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRes, sumRes, fsRes, ipRes, hashRes] = await Promise.all([
        fetch(`/api/global/threats?time=${timeRange}`,   { headers: authH() }),
        fetch("/api/global/national-summary",             { headers: authH() }),
        fetch("/api/threatfeeds/stats",                   { headers: authH() }),
        fetch("/api/global/top-ips?limit=15",             { headers: authH() }),
        fetch("/api/global/top-hashes?limit=15",          { headers: authH() }),
      ]);

      if (ctRes.ok)   setCountries(await ctRes.json());
      if (sumRes.ok)  setSummary(await sumRes.json());
      if (fsRes.ok)   setFeedStats(await fsRes.json());
      if (ipRes.ok)   setTopIPs(await ipRes.json());
      if (hashRes.ok) setTopHashes(await hashRes.json());
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  const draw = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas || countries.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#05080F");
    bg.addColorStop(1, "#060A14");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 12; i++) {
      ctx.beginPath(); ctx.moveTo((i / 12) * W, 0); ctx.lineTo((i / 12) * W, H); ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(0, (i / 6) * H); ctx.lineTo(W, (i / 6) * H); ctx.stroke();
    }

    // Malawi center
    const [mwX, mwY] = latLonToCanvas(-13.25, 34.30, W, H);

    // Draw connecting lines from Malawi to threat countries
    for (const c of countries) {
      if (c.incidents < 10) continue;
      const [cX, cY] = latLonToCanvas(c.coordinates.lat, c.coordinates.lon, W, H);
      const col = THREAT_COLORS[c.threatLevel];
      const alpha = Math.min(c.incidents / 100, 0.3);

      ctx.beginPath();
      ctx.moveTo(mwX, mwY);
      // Arc curve
      const midX = (mwX + cX) / 2;
      const midY = Math.min(mwY, cY) - 40;
      ctx.quadraticCurveTo(midX, midY, cX, cY);
      ctx.strokeStyle = col.dot + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw threat pulses
    for (const c of countries) {
      const [cX, cY] = latLonToCanvas(c.coordinates.lat, c.coordinates.lon, W, H);
      const col  = THREAT_COLORS[c.threatLevel];
      const base = 4 + Math.min(c.incidents / 8, 18);

      // Animated pulse ring
      if (c.threatLevel === "CRITICAL" || c.threatLevel === "HIGH") {
        const pulse = (frame % 60) / 60;
        const pr = base + pulse * 14;
        const gradient = ctx.createRadialGradient(cX, cY, 0, cX, cY, pr);
        gradient.addColorStop(0, col.dot + "60");
        gradient.addColorStop(0.4, col.dot + "20");
        gradient.addColorStop(1, col.dot + "00");
        ctx.beginPath();
        ctx.arc(cX, cY, pr, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Glow
      const glow = ctx.createRadialGradient(cX, cY, 0, cX, cY, base * 2);
      glow.addColorStop(0, col.glow);
      glow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cX, cY, base * 2, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(cX, cY, Math.max(base * 0.4, 2.5), 0, Math.PI * 2);
      ctx.fillStyle = col.dot;
      ctx.fill();

      // Country code label
      if (c.incidents > 15) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font      = "9px monospace";
        ctx.fillText(c.countryCode, cX + base * 0.5 + 2, cY + 3);
      }
    }

    // Malawi marker (home)
    const mwGlow = ctx.createRadialGradient(mwX, mwY, 0, mwX, mwY, 20);
    mwGlow.addColorStop(0, "rgba(6,182,212,0.6)");
    mwGlow.addColorStop(1, "transparent");
    ctx.beginPath(); ctx.arc(mwX, mwY, 20, 0, Math.PI * 2);
    ctx.fillStyle = mwGlow; ctx.fill();
    ctx.beginPath(); ctx.arc(mwX, mwY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#06b6d4"; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font      = "bold 9px monospace";
    ctx.fillText("🇲🇼 MW", mwX - 14, mwY - 10);

  }, [countries]);

  // Animation loop
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame++;
      draw(frame);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

  // Resize canvas on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = canvas.parentElement?.clientWidth  ?? 900;
      canvas.height = 420;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const critical = countries.filter(c => c.threatLevel === "CRITICAL").length;
  const high     = countries.filter(c => c.threatLevel === "HIGH").length;
  const total    = countries.reduce((s, c) => s + c.incidents, 0);
  const top5     = [...countries].sort((a, b) => b.incidents - a.incidents).slice(0, 5);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" id="global-cyber-map">

      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-blue-500/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">GLOBAL CYBER THREAT INTELLIGENCE</h2>
              <p className="text-[10px] text-slate-500 font-mono">
                Multi-source threat feed · AbuseIPDB · MalwareBazaar · AlienVault OTX · Kaspersky OpenTIP
              </p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-3 shrink-0">
            {/* Time range */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden text-[10px] font-mono">
              {(["24h", "7d", "30d"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 transition ${timeRange === r ? "bg-blue-500/20 text-blue-300" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Threat Indicators",  val: summary?.totalThreatIntel ?? 0,  icon: Shield,         color: "text-blue-400 bg-blue-500/10 border-blue-500/20"     },
          { label: "Auto-Blocklisted",   val: summary?.blocklisted       ?? 0,  icon: AlertTriangle,  color: "text-red-400 bg-red-500/10 border-red-500/20"        },
          { label: "Endpoint Agents",    val: summary?.activeAgents      ?? 0,  icon: Server,         color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
          { label: "Countries Tracked",  val: countries.length,                 icon: Globe,          color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20"  },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">{label}</div>
              <div className="text-xl font-bold font-mono text-slate-100">{val.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Sub-tabs ─── */}
      <div className="flex gap-1 border-b border-white/8">
        {([
          { id: "map",    label: "Threat Map",    icon: Globe    },
          { id: "ips",    label: "Top Malicious IPs",   icon: Wifi     },
          { id: "hashes", label: "Malware Hashes",icon: Hash     },
          { id: "feeds",  label: "Feed Status",   icon: Link     },
        ] as const).map(t => (
          <button
            key={t.id}
            id={`global-tab-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono font-bold transition-all ${
              activeTab === t.id
                ? "text-blue-400 border-b-2 border-blue-400 -mb-px"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── MAP TAB ─── */}
      {activeTab === "map" && (
        <div className="space-y-4">
          {/* Canvas map */}
          <div className="relative rounded-2xl overflow-hidden border border-white/8 bg-[#05080F]">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#05080F]/80">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto" />
                  <p className="text-xs text-slate-500 mt-3 font-mono">Loading threat intelligence…</p>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full block" style={{ height: 420 }} />

            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-[#05080F]/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
              {(["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(lvl => (
                <div key={lvl} className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ background: THREAT_COLORS[lvl].dot }} />
                  {lvl}
                </div>
              ))}
            </div>

            {/* Stats overlay */}
            <div className="absolute top-3 right-3 flex flex-col gap-1 text-[9px] font-mono">
              <span className="bg-red-500/20 border border-red-500/30 text-red-400 px-2 py-0.5 rounded">{critical} CRITICAL</span>
              <span className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded">{high} HIGH</span>
              <span className="bg-slate-800/80 border border-white/10 text-slate-400 px-2 py-0.5 rounded">{total.toLocaleString()} TOTAL IOCs</span>
            </div>
          </div>

          {/* Top threat countries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4">
              <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-red-400" /> Top Threat Origins
              </h3>
              <div className="space-y-2">
                {top5.map((c, i) => {
                  const col = THREAT_COLORS[c.threatLevel];
                  return (
                    <button
                      key={c.countryCode}
                      onClick={() => setSelected(selected?.countryCode === c.countryCode ? null : c)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                        selected?.countryCode === c.countryCode
                          ? "border-blue-500/30 bg-blue-500/10"
                          : "border-white/5 hover:border-white/15 hover:bg-white/3"
                      }`}
                    >
                      <span className="text-slate-600 font-mono text-xs w-4 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200 font-mono">{COUNTRY_NAMES[c.countryCode] ?? c.countryCode}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${col.badge}`}>{c.threatLevel}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min((c.incidents / (top5[0]?.incidents || 1)) * 100, 100)}%`, background: col.dot }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-400 shrink-0">{c.incidents}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected country detail */}
            <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4">
              {selected ? (
                <>
                  <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    {COUNTRY_NAMES[selected.countryCode] ?? selected.countryCode} · Detail
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-mono">Threat Level</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${THREAT_COLORS[selected.threatLevel].badge}`}>{selected.threatLevel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-mono">IOC Count</span>
                      <span className="text-xs font-bold font-mono text-slate-200">{selected.incidents}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-mono">Region</span>
                      <span className="text-xs font-mono text-slate-300">{selected.region}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-mono">Top Threats</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {selected.topThreats.map(t => (
                          <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-red-500/20 text-red-400/80 bg-red-500/5">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-8">
                  <Globe className="w-8 h-8 text-slate-700 mb-3" />
                  <p className="text-xs text-slate-600 font-mono">Select a country from the list<br />to see detailed intelligence</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TOP IPs TAB ─── */}
      {activeTab === "ips" && (
        <div className="rounded-xl border border-white/8 bg-[#05080F]/60 overflow-hidden">
          <div className="p-4 border-b border-white/8">
            <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest">Top Malicious IP Addresses</h3>
          </div>
          <div className="divide-y divide-white/5">
            {topIPs.length === 0 ? (
              <div className="py-12 text-center text-slate-600 text-xs font-mono">
                No IP threat data yet — AbuseIPDB feed running…
              </div>
            ) : topIPs.map((ip, i) => (
              <div key={ip.value} className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition">
                <span className="text-[10px] text-slate-700 font-mono w-5 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono font-bold text-slate-200">{ip.value}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{ip.description}</div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-[10px] font-mono text-slate-400">{ip.geo_country || "?"}</div>
                  <div className="text-[10px] font-mono text-slate-500">{ip.source}</div>
                </div>
                <div className={`text-xs font-bold font-mono px-2 py-0.5 rounded border shrink-0 ${
                  ip.confidence >= 80 ? "text-red-400 border-red-500/30 bg-red-500/10"
                  : ip.confidence >= 60 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                  : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                }`}>{ip.confidence}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── HASHES TAB ─── */}
      {activeTab === "hashes" && (
        <div className="rounded-xl border border-white/8 bg-[#05080F]/60 overflow-hidden">
          <div className="p-4 border-b border-white/8">
            <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest">Top Malware Hashes</h3>
          </div>
          <div className="divide-y divide-white/5">
            {topHashes.length === 0 ? (
              <div className="py-12 text-center text-slate-600 text-xs font-mono">
                No hash data yet — MalwareBazaar feed running…
              </div>
            ) : topHashes.map((h, i) => (
              <div key={h.value} className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition">
                <span className="text-[10px] text-slate-700 font-mono w-5 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-slate-300 truncate">{h.value}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{h.description}</div>
                </div>
                <div className={`text-xs font-bold font-mono px-2 py-0.5 rounded border shrink-0 ${
                  h.confidence >= 80 ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                }`}>{h.confidence}%</div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">{h.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── FEED STATUS TAB ─── */}
      {activeTab === "feeds" && feedStats && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {feedStats.feeds.map(f => (
              <div key={f.key} className={`rounded-xl border p-4 space-y-2 ${f.enabled ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/8 bg-white/2"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 font-mono">{f.name}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${f.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-500"}`}>
                    {f.enabled ? "● ACTIVE" : "○ DISABLED"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                  <div>Interval: every {f.intervalMin} min</div>
                  <div>Last run: {f.lastRunAt ? new Date(f.lastRunAt).toLocaleTimeString() : "pending"}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4">
            <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest mb-3">Indicators by Source</h3>
            <div className="space-y-2">
              {feedStats.bySource.map((s: any) => (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-400 w-36 shrink-0 truncate">{s.source}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500/70 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min((s.count / (feedStats.bySource[0]?.count || 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 w-12 text-right shrink-0">{s.count.toLocaleString()}</span>
                </div>
              ))}
              {feedStats.bySource.length === 0 && (
                <p className="text-xs text-slate-600 font-mono text-center py-4">Feeds initializing… check back in a few minutes.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
