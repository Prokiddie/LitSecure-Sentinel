import React, { useState, useCallback } from "react";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from "recharts";
import { 
  TrendingUp, Shield, AlertCircle, AlertOctagon,
  Users, CheckCircle2, ShieldAlert, Zap, Layers, Landmark,
  Bot, Loader2, Sparkles, RefreshCw
} from "lucide-react";
import { NationalStats } from "../types";

interface AnalyticsDashboardProps {
  stats: NationalStats;
}

// Gorgeous High-Contrast Colors
const COLORS = {
  Fraud: "#f43f5e", // Rose
  Phishing: "#ec4899", // Pink
  Malware: "#a855f7", // Purple
  "Unauthorized Access": "#3b82f6", // Blue
  "System Breach": "#ef4444", // Crimson Red
  "Network Intrusion": "#06b6d4", // Cyan
  Unknown: "#64748b", // Slate
};

const SEV_COLORS: { [key: string]: string } = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#FFD600"
};

export default function AnalyticsDashboard({ stats }: AnalyticsDashboardProps) {

  const total = stats.totalIncidents;
  const percentChange = "+14.8%";

  // AI Insights state
  const [insights, setInsights]     = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError,   setInsightError]   = useState("");

  const generateInsights = useCallback(async () => {
    const token = sessionStorage.getItem("sentinel_token");
    setInsights(""); setInsightError(""); setInsightLoading(true);
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) throw new Error("AI insights request failed");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.chunk) { full += p.chunk; setInsights(full); }
            if (p.error) setInsightError(p.error);
          } catch {}
        }
      }
    } catch (err: any) {
      setInsightError(err.message || "Insights failed");
    } finally {
      setInsightLoading(false);
    }
  }, [stats]);

  return (
    <div className="space-y-6" id="analytics-dashboard">
      
      {/* Dynamic Telemetry Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 shadow-lg flex items-center gap-4">
          <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 block">Identified Incidents</span>
            <span className="text-2xl font-bold text-slate-100 font-mono block">{total}</span>
            <span className="text-[10px] text-red-400 font-semibold flex items-center gap-1 font-sans">
              <TrendingUp className="w-3 h-3" /> {percentChange} versus May
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 shadow-lg flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 block">Pending / Investigating</span>
            <span className="text-2xl font-bold text-slate-100 font-mono block">
              {stats.reportedCount + stats.investigatingCount}
            </span>
            <span className="text-[10px] text-slate-400 font-sans block mt-1">
              Active forensics, surveillance cases
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 shadow-lg flex items-center gap-4">
          <div className="p-3 bg-[#FFD600]/10 text-[#FFD600] rounded-lg border border-[#FFD600]/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 block">Contained & Resolved</span>
            <span className="text-2xl font-bold text-slate-100 font-mono block">
              {stats.containedCount + stats.resolvedCount}
            </span>
            <span className="text-[10px] text-[#FFD600] font-semibold block mt-1">
              {total > 0 ? Math.round(((stats.containedCount + stats.resolvedCount) / total) * 100) : 0}% National Containment Rate
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 shadow-lg flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 block">Secured Sectors</span>
            <span className="text-2xl font-bold text-slate-100 font-mono block">8</span>
            <span className="text-[10px] text-blue-400 font-semibold block mt-1">
              Banks, Telecoms, National Portal
            </span>
          </div>
        </div>
      </div>

      {/* Graphs Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Graph 1: Sector / Category Breakdown (Donut) */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-rose-500" /> Vector Threat Landscape
            </h3>
            <p className="text-xs text-slate-500 mt-1">AI-assisted categorization distribution across the digital sphere</p>
          </div>
          
          <div className="h-60 mt-4 relative">
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <PieChart>
                <Pie
                  data={stats.categoryStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {stats.categoryStats.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={(COLORS as any)[entry.name] || COLORS.Unknown} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  itemStyle={{ color: "#cbd5e1" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <span className="text-2xl font-bold text-slate-100 font-mono">{total}</span>
                <span className="text-[10px] text-slate-400 block uppercase tracking-widest">Reports</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 border-t border-white/10 pt-3">
            {stats.categoryStats.map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span 
                  className="w-2.5 h-2.5 rounded-full shrink-0" 
                  style={{ backgroundColor: (COLORS as any)[entry.name] || COLORS.Unknown }} 
                />
                <span className="text-slate-400 truncate">{entry.name}</span>
                <span className="font-mono text-slate-300 ml-auto font-semibold">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph 2: National Severity Distribution */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#FFD600]" /> Severity Index Allocation
            </h3>
            <p className="text-xs text-slate-500 mt-1">National priority mapping from critical system hostage cases down to minor fraud</p>
          </div>

          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <BarChart
                data={stats.severityStats}
                margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Bar dataKey="value">
                  {stats.severityStats.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={(SEV_COLORS as any)[entry.name] || "#3b82f6"} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="border-t border-white/10 pt-3 flex text-xs text-slate-400 leading-normal gap-2 italic">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>High and Critical priority cases route real-time SMS pager notifications to corresponding sector team responders automatically.</span>
          </div>
        </div>

        {/* Graph 3: Timeline Progress Tracker */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-blue-500" /> Threat Vector Development Trend
            </h3>
            <p className="text-xs text-slate-500 mt-1">Active cumulative growth metrics of leading threat vectors for year 2026</p>
          </div>

          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <AreaChart
                data={stats.trendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorFraud" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.Fraud} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={COLORS.Fraud} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPhish" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.Phishing} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={COLORS.Phishing} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="fraud" name="Mobile Money Fraud" stroke={COLORS.Fraud} fillOpacity={1} fill="url(#colorFraud)" />
                <Area type="monotone" dataKey="phishing" name="Phishing Web Scams" stroke={COLORS.Phishing} fillOpacity={1} fill="url(#colorPhish)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="border-t border-white/10 pt-3 flex items-center justify-between text-xs text-slate-400">
            <span>Primary Catalyst:</span>
            <span className="font-mono text-rose-400 font-bold">Unregistered SIM network clusters</span>
          </div>
        </div>

      </div>

      {/* Sector Risk Map - Bento Grid Item */}
      <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3">
          National Regional Cyber Threat Risk Assessments (Malawi Sector Coordinates)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#05080F]/40 border border-white/10/80 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200">Blantyre Core (Southern District)</span>
              <span className="text-[10px] bg-red-950/65 text-red-400 font-mono px-2 py-0.5 rounded-full font-bold">HIGH RISK</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-sans mb-3">
              Focuses the majority of commercial bank targets. Dominated by highly targeted financial spear-phishing web clones spoofing local banks.
            </p>
            <div className="bg-[#05080F]/80 rounded p-2 text-[10px] font-mono text-slate-500">
              Targeted Entities: Standard Bank, FDH, National Bank offices.
            </div>
          </div>

          <div className="bg-[#05080F]/40 border border-white/10/80 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200">Lilongwe (Administrative Capital)</span>
              <span className="text-[10px] bg-rose-950/65 text-rose-400 font-mono px-2 py-0.5 rounded-full font-bold">CRITICAL</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-sans mb-3">
              Coordinates government mainframes. Susceptible to malicious ransomware lockouts on payroll (HRMS) systems, and brute SSH credential sweeps.
            </p>
            <div className="bg-[#05080F]/80 rounded p-2 text-[10px] font-mono text-slate-500">
              Targeted Entities: Capital Hill Servers, Ministry Networks, Zomba Councils.
            </div>
          </div>

          <div className="bg-[#05080F]/40 border border-white/10/80 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200">Mzuzu & Northern Hubs</span>
              <span className="text-[10px] bg-amber-950/65 text-amber-400 font-mono px-2 py-0.5 rounded-full font-bold">MODERATE RISK</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-sans mb-3">
              Surveillance reports high incident distribution of localized mobile money (Mpamba, Airtel) fraud. Fraudsters spoof merchant balances.
            </p>
            <div className="bg-[#05080F]/80 rounded p-2 text-[10px] font-mono text-slate-500">
              Targeted Entities: Local Mobile money agents, cash out nodes.
            </div>
          </div>
        </div>
      </div>

      {/* ─── AI Insights Panel ─── */}
      <div className="card p-5 space-y-4" id="analytics-ai-insights">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FFD600] to-[#FF9800] flex items-center justify-center">
            <Bot className="w-4 h-4 text-[#05080F]" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">AI Strategic Insights</div>
            <div className="text-[9px] text-slate-500 font-mono">Gemini 2.0 Flash · Malawi MACERT Analytics Engine</div>
          </div>
          <button
            onClick={generateInsights}
            disabled={insightLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#FFD600]/30 bg-[#FFD600]/10 hover:bg-[#FFD600]/20 text-[#FFD600] text-[10px] font-mono font-bold transition disabled:opacity-50"
            id="generate-insights-btn"
          >
            {insightLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {insightLoading ? "ANALYSING..." : insights ? "Regenerate" : "Generate AI Insights"}
          </button>
        </div>

        {!insights && !insightLoading && !insightError && (
          <div className="text-center py-8 text-slate-600">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-mono">Click “Generate AI Insights” to get Gemini-powered strategic recommendations based on your live incident data.</p>
          </div>
        )}

        {insightLoading && !insights && (
          <div className="flex items-center gap-2 text-[#FFD600] text-xs font-mono py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analysing {stats.totalIncidents} incidents… generating insights…
          </div>
        )}

        {insightError && (
          <div className="text-red-400 text-xs font-mono p-3 bg-red-500/10 rounded-lg border border-red-500/20">
            ⚠ {insightError}
          </div>
        )}

        {insights && (
          <div className="whitespace-pre-wrap text-[12px] text-slate-300 leading-relaxed font-mono">
            {insights}
          </div>
        )}
      </div>

    </div>
  );
}
