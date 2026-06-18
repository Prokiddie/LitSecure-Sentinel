import React, { useState, useEffect } from "react";
import { Code2, Zap, Upload, CheckCircle, AlertTriangle, Loader2, RefreshCw, Trash2, Plus } from "lucide-react";

interface Rule {
  id: string; title: string; language: string;
  content: string; status: string; nodes_deployed: number; created_at: string;
}

const LANG_COLORS: Record<string, string> = {
  YARA:  "text-purple-400 bg-purple-500/10 border-purple-500/25",
  Sigma: "text-blue-400 bg-blue-500/10 border-blue-500/25",
  Snort: "text-orange-400 bg-orange-500/10 border-orange-500/25",
};

const TEMPLATES: Record<string, string> = {
  YARA: `rule MalwareName {
  meta:
    description = "Detects [description here]"
    author = "LitSecure Sentinel"
  strings:
    $str1 = "malicious-string" ascii
    $hex1 = { 8A 02 D3 4B FD }
  condition:
    any of them
}`,
  Sigma: `title: Attack Detection Rule
status: stable
description: Detects [describe the attack]
logsource:
  product: linux
  service: sshd
detection:
  selection:
    event.id: ssh_login_failed
  timeframe: 1m
  condition: selection | count() > 10
level: high`,
  Snort: `alert tcp any any -> $HOME_NET 80 (
  msg:"Suspicious HTTP request detected";
  content:"malicious-pattern";
  nocase;
  sid:1000999;
  rev:1;
)`,
};

export default function SecurityRulesOrchestrator() {
  const [rules, setRules]         = useState<Rule[]>([]);
  const [language, setLanguage]   = useState("YARA");
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState(TEMPLATES.YARA);
  const [deploying, setDeploying] = useState(false);
  const [feedback, setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading]     = useState(true);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  const loadRules = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/rules", { headers: authHeaders() });
      if (r.ok) setRules(await r.json());
    } finally { setLoading(false); }
  };

  // Watchlist states — defined BEFORE useEffect to avoid temporal dead zone
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [wlType, setWlType] = useState("phone");
  const [wlValue, setWlValue] = useState("");
  const [wlRisk, setWlRisk] = useState("High");
  const [wlReason, setWlReason] = useState("");
  const [wlLoading, setWlLoading] = useState(false);
  const [wlFeedback, setWlFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadWatchlist = async () => {
    setWlLoading(true);
    try {
      const r = await fetch("/api/cyber/watchlist", { headers: authHeaders() });
      if (r.ok) setWatchlist(await r.json());
    } catch (e) {
      console.error("Failed to load watchlist:", e);
    } finally {
      setWlLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    loadWatchlist();
  }, []);

  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wlValue.trim() || !wlReason.trim()) {
      setWlFeedback({ ok: false, msg: "Indicator value and reason are required." });
      return;
    }
    setWlFeedback(null);
    try {
      const res = await fetch("/api/cyber/watchlist", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ type: wlType, value: wlValue, risk_level: wlRisk, reason: wlReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setWlFeedback({ ok: true, msg: "Indicator successfully added to national threat watchlist." });
        setWlValue("");
        setWlReason("");
        await loadWatchlist();
      } else {
        setWlFeedback({ ok: false, msg: data.error || "Addition failed." });
      }
    } catch (e: any) {
      setWlFeedback({ ok: false, msg: e.message });
    }
  };

  const handleDeleteWatchlist = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this indicator from the watchlist?")) return;
    try {
      const res = await fetch(`/api/cyber/watchlist/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        setWlFeedback({ ok: true, msg: "Indicator removed from watchlist." });
        await loadWatchlist();
      } else {
        const data = await res.json();
        setWlFeedback({ ok: false, msg: data.error || "Removal failed." });
      }
    } catch (e: any) {
      setWlFeedback({ ok: false, msg: e.message });
    }
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    setContent(TEMPLATES[lang] || "");
    setFeedback(null);
  };

  const deploy = async () => {
    if (!title.trim() || !content.trim()) {
      setFeedback({ ok: false, msg: "Rule title and content are required before deploying." });
      return;
    }
    setDeploying(true); setFeedback(null);
    try {
      const res = await fetch("/api/rules/deploy", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ title, language, content }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ ok: true, msg: `Rule '${title}' compiled and deployed to ${data.rule?.nodes_deployed} sensor nodes.` });
        setTitle(""); setContent(TEMPLATES[language]);
        await loadRules();
      } else {
        setFeedback({ ok: false, msg: data.message || "Compilation failed." });
      }
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message });
    } finally { setDeploying(false); }
  };

  return (
    <div className="space-y-6" id="security-rules-orchestrator">

      {/* ─── Rule Composer ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-purple-400 rounded" />
          Security Rule Compiler & Orchestrator
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Write detection rules in YARA (malware signatures), Sigma (log patterns), or Snort (network intrusion). Push them across all active sensor nodes with one click.
        </p>

        {/* Language selector */}
        <div className="flex items-center gap-2">
          {["YARA", "Sigma", "Snort"].map(lang => (
            <button
              key={lang}
              id={`rule-lang-${lang.toLowerCase()}`}
              onClick={() => handleLanguageChange(lang)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition ${
                language === lang
                  ? LANG_COLORS[lang]
                  : "text-slate-500 border-white/10 hover:text-slate-300"
              }`}
            >
              {lang}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-600 font-mono hidden sm:block">
            {language === "YARA" ? "Matches malicious files by binary signature" :
             language === "Sigma" ? "Matches suspicious log events in real time" :
             "Matches dangerous network packets at the gateway"}
          </span>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Rule title — e.g. 'Detect TNM Mpamba Phishing Dropper'"
          className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/50 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition"
          id="rule-title-input"
        />

        {/* Editor */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={14}
          className="w-full bg-[#030508] border border-white/10 focus:border-[#FFD600]/40 rounded-xl px-4 py-3 text-xs text-green-400 placeholder-slate-700 outline-none transition font-mono resize-y"
          id="rule-content-editor"
        />

        {feedback && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs border ${
            feedback.ok ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-red-500/10 border-red-500/25 text-red-400"
          }`}>
            {feedback.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        <button
          id="deploy-rule-btn"
          onClick={deploy}
          disabled={deploying}
          className="btn-accent w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {deploying ? "Deploying to sensor network..." : `Compile & Deploy ${language} Rule`}
        </button>
      </div>

      {/* ─── Deployed Rules Library ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-blue-400 rounded" />
          Deployed Rules Library
          <button onClick={loadRules} className="ml-auto p-1 text-slate-600 hover:text-slate-300 transition"><RefreshCw className="w-3.5 h-3.5" /></button>
        </h3>

        {loading ? (
          <div className="text-center py-8 text-slate-600 text-xs font-mono">Loading rule library...</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-xs">No rules deployed yet.</div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="bg-[#05080F]/60 border border-white/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Code2 className="w-4 h-4 text-slate-500 shrink-0" />
                  <h4 className="text-sm font-semibold text-white flex-1">{rule.title}</h4>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${LANG_COLORS[rule.language]}`}>{rule.language}</span>
                  <span className="text-[9px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">{rule.status}</span>
                  <span className="text-[10px] font-mono text-slate-500">{rule.nodes_deployed} nodes</span>
                </div>
                <pre className="text-[10px] font-mono text-slate-500 bg-[#030508] rounded-lg p-3 overflow-x-auto leading-relaxed border border-white/5">
                  {rule.content.slice(0, 300)}{rule.content.length > 300 ? "\n..." : ""}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── National Threat Watchlist Manager ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-orange-400 rounded" />
          National Threat Watchlist Manager
          <button onClick={loadWatchlist} className="ml-auto p-1 text-slate-600 hover:text-slate-300 transition text-xs flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Monitor and track high-risk phone numbers, IP addresses, or domains. Any incoming incident containing these indicators will auto-trigger a +30 risk boost and critical flagging in the system pipeline.
        </p>

        {/* Add Watchlist Entry Form */}
        <form onSubmit={handleAddWatchlist} className="bg-[#05080F]/60 border border-white/5 rounded-xl p-4 space-y-3">
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Add Watchlist Indicator</span>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1 font-mono">Indicator Type</label>
              <select
                value={wlType}
                onChange={e => setWlType(e.target.value)}
                className="w-full bg-[#0A0E1A] border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600]"
              >
                <option value="phone">Phone Number</option>
                <option value="ip">IP Address</option>
                <option value="domain">Domain</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] text-slate-500 uppercase mb-1 font-mono">Value (e.g. +265... or 41.221...)</label>
              <input
                type="text"
                value={wlValue}
                onChange={e => setWlValue(e.target.value)}
                placeholder="e.g. +265991004112"
                className="w-full bg-[#0A0E1A] border border-white/10 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600] font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1 font-mono">Risk Level</label>
              <select
                value={wlRisk}
                onChange={e => setWlRisk(e.target.value)}
                className="w-full bg-[#0A0E1A] border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600]"
              >
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase mb-1 font-mono">Reason / Associated Threat Group</label>
            <input
              type="text"
              value={wlReason}
              onChange={e => setWlReason(e.target.value)}
              placeholder="e.g. TNM Mpamba SIM swap fraud ring perpetrator"
              className="w-full bg-[#0A0E1A] border border-white/10 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600]"
            />
          </div>

          {wlFeedback && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
              wlFeedback.ok ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}>
              {wlFeedback.msg}
            </div>
          )}

          <button
            type="submit"
            className="px-4 py-1.5 bg-[#FFD600] hover:bg-[#FFD600]/80 text-[#05080F] font-bold text-xs rounded transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add to Watchlist
          </button>
        </form>

        {/* Watchlist Table */}
        {wlLoading ? (
          <div className="text-center py-6 text-slate-600 text-xs font-mono">Loading threat watchlist...</div>
        ) : watchlist.length === 0 ? (
          <div className="text-center py-6 text-slate-600 text-xs italic">Watchlist is currently empty.</div>
        ) : (
          <div className="overflow-x-auto border border-white/5 rounded-xl">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#05080F]/80 border-b border-white/10 text-slate-400">
                  <th className="p-3">Type</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Risk</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Added</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-[#05080F]/20">
                {watchlist.map(item => (
                  <tr key={item.id} className="text-slate-300 hover:bg-white/2">
                    <td className="p-3 font-bold uppercase text-slate-500">{item.type}</td>
                    <td className="p-3 text-white font-bold">{item.value}</td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        item.risk_level === "Critical" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                        item.risk_level === "High" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                        "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      }`}>{item.risk_level}</span>
                    </td>
                    <td className="p-3 text-slate-400 truncate max-w-xs" title={item.reason}>{item.reason}</td>
                    <td className="p-3 text-slate-500">{new Date(item.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteWatchlist(item.id)}
                        className="p-1 rounded text-red-400 hover:bg-red-500/10 transition"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
