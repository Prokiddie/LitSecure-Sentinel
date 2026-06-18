/**
 * LitSecure Sentinel — AI Learning Panel
 *
 * Lets analysts:
 *  • Rate AI responses (👍/👎) and submit corrections
 *  • Add knowledge base entries to teach the AI Malawi-specific facts
 *  • View training dataset stats and download the JSONL
 *  • Approve/reject pending KB entries (admin)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Brain, ThumbsUp, ThumbsDown, CheckCircle2, XCircle,
  Plus, Trash2, BookOpen, Database, Download, Loader2,
  RefreshCw, ChevronDown, Sparkles, AlertTriangle,
  MessageSquare, Edit3, Save, X, Lock, FileText
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  feedback: { total: number; positive: number; negative: number; corrected: number; accuracy: number };
  training: { samples: number; fileSizeKb: number };
  knowledgeBase: { total: number; approved: number; pending: number };
}

interface KbEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  author: string;
  approved: number;
  used_count: number;
  created_at: string;
}

interface FeedbackEntry {
  id: string;
  user_message: string;
  ai_response: string;
  rating: string;
  correction: string | null;
  topic: string;
  analyst_name: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "threat_tactic",  label: "Threat Tactic",    color: "text-red-400    border-red-500/30    bg-red-500/10" },
  { value: "ioc_pattern",    label: "IOC Pattern",      color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { value: "local_context",  label: "Local Context",    color: "text-blue-400   border-blue-500/30   bg-blue-500/10" },
  { value: "sop",            label: "SOP / Procedure",  color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { value: "case_study",     label: "Case Study",       color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
];

function catMeta(val: string) {
  return CATEGORIES.find(c => c.value === val) ?? { label: val, color: "text-slate-400 border-slate-500/30 bg-slate-500/10" };
}

// ─── Add KB Entry Modal ───────────────────────────────────────────────────────

function AddKbModal({ token, onClose, onAdded }: { token: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    title: "", category: "threat_tactic", content: "",
    trainingQuestion: "", addToTraining: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const submit = async () => {
    if (!form.title || !form.content) { setError("Title and content are required."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/ai-learning/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Error"); return; }
      onAdded(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[#FFD600]/30 bg-[#05080F] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 p-5 border-b border-white/8 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div><h3 className="font-grotesk font-bold text-white text-sm">Teach SENTINEL AI</h3>
            <p className="text-[9px] text-slate-500 font-mono">Add knowledge to the AI's learning base</p></div>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && <div className="text-red-400 text-xs font-mono p-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>}

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Airtel SIM Swap Attack Pattern in Lilongwe"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40" />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40">
              {CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#0A0E1A]">{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Knowledge Content</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={6}
              placeholder="Write specific Malawi cyber threat knowledge here. Be precise — the AI will use this exactly as written. Example: 'SIM swap attacks in Malawi typically involve insiders at TNM or Airtel retail shops. The attacker needs: National ID copy, customer account number, phone number. After swap, they immediately try Airtel Money (*211#) password reset.'"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40 resize-none" />
          </div>

          <div className="border border-white/8 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.addToTraining} onChange={e => setForm(f => ({ ...f, addToTraining: e.target.checked }))}
                className="w-3.5 h-3.5 rounded accent-[#FFD600]" />
              <span className="text-xs text-slate-300 font-mono">Also add as a training sample (for fine-tuning)</span>
            </label>
            {form.addToTraining && (
              <div>
                <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Training Question</label>
                <input value={form.trainingQuestion}
                  onChange={e => setForm(f => ({ ...f, trainingQuestion: e.target.value }))}
                  placeholder="e.g. How do SIM swap attacks work in Malawi?"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40" />
                <p className="text-[9px] text-slate-600 mt-1">The content above becomes the model answer to this question in the JSONL training file.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-white/8 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white transition">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold transition disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            Add Knowledge
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { token: string; role: string; }

export default function AiLearningPanel({ token, role }: Props) {
  const [tab,      setTab]      = useState<"kb" | "feedback" | "training">("kb");
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [kb,       setKb]       = useState<KbEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);

  const isAdmin = ["admin","super_admin","gov_admin","soc_manager"].includes(role);

  const headers = { Authorization: `Bearer ${token}` };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, kRes, fRes] = await Promise.all([
        fetch("/api/ai-learning/stats",    { headers }),
        fetch("/api/ai-learning/kb",       { headers }),
        fetch("/api/ai-learning/feedback", { headers }),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (kRes.ok) setKb(await kRes.json());
      if (fRes.ok) setFeedback(await fRes.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const approveKb = async (id: string) => {
    await fetch(`/api/ai-learning/kb/${id}/approve`, { method: "PATCH", headers });
    loadAll();
  };

  const deleteKb = async (id: string) => {
    await fetch(`/api/ai-learning/kb/${id}`, { method: "DELETE", headers });
    setKb(k => k.filter(e => e.id !== id));
  };

  const downloadTraining = () => {
    const a = document.createElement("a");
    a.href = `/api/ai-learning/training/export`;
    (a as any).headers = { Authorization: `Bearer ${token}` };
    a.download = "sentinel_training_data.jsonl";
    a.click();
  };

  return (
    <div className="space-y-5" id="ai-learning-panel">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a051a] via-[#0e0a1a] to-[#050a1a] border border-purple-500/25 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-purple-500/50 via-blue-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">AI LEARNING CENTER</h2>
              <p className="text-[10px] text-slate-500 font-mono">Teach · Correct · Improve — Continuous AI intelligence growth</p>
            </div>
          </div>
          <div className="sm:ml-auto flex gap-2">
            <button onClick={loadAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-white text-xs font-mono transition">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold transition">
              <Plus className="w-3.5 h-3.5" /> Teach AI
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "AI Accuracy",       val: `${stats.feedback.accuracy}%`,  color: stats.feedback.accuracy >= 80 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-orange-400 bg-orange-500/10 border-orange-500/20" },
            { label: "Good Responses",    val: stats.feedback.positive,        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
            { label: "Corrections Made",  val: stats.feedback.corrected,       color: "text-[#FFD600]  bg-[#FFD600]/10  border-[#FFD600]/20" },
            { label: "KB Entries",        val: `${stats.knowledgeBase.approved}/${stats.knowledgeBase.total}`, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
            { label: "Training Samples",  val: stats.training.samples,         color: "text-blue-400   bg-blue-500/10   border-blue-500/20" },
          ].map(({ label, val, color }) => (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <div className="text-[9px] uppercase font-mono tracking-wider opacity-60">{label}</div>
              <div className="text-xl font-bold font-mono mt-0.5">{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="card p-5">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-purple-400" /> How SENTINEL AI Learns
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: "1", icon: MessageSquare, title: "AI Responds",       desc: "Analyst asks a question. SENTINEL AI answers using live DB data.", color: "border-blue-500/30 bg-blue-500/5" },
            { step: "2", icon: ThumbsDown,    title: "Analyst Corrects",  desc: "If wrong, analyst rates 👎 and types the correct answer.", color: "border-orange-500/30 bg-orange-500/5" },
            { step: "3", icon: Brain,          title: "Correction Saved",  desc: "Correction is stored. It's injected into EVERY future prompt automatically.", color: "border-purple-500/30 bg-purple-500/5" },
            { step: "4", icon: FileText,       title: "Fine-tuning JSONL", desc: "All corrections are saved to a JSONL file for future Gemini model fine-tuning.", color: "border-[#FFD600]/30 bg-[#FFD600]/5" },
          ].map(({ step, icon: Icon, title, desc, color }) => (
            <div key={step} className={`rounded-xl border p-4 ${color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-white/10 text-[9px] font-bold font-mono flex items-center justify-center text-slate-400">{step}</span>
                <Icon className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-white">{title}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {[
          { id: "kb",       label: "Knowledge Base", icon: BookOpen,    count: stats?.knowledgeBase.total },
          { id: "feedback", label: "AI Feedback",    icon: ThumbsUp,    count: stats?.feedback.total },
          { id: "training", label: "Training Data",  icon: Database,    count: stats?.training.samples },
        ].map(({ id, label, icon: Icon, count }) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono border-b-2 transition whitespace-nowrap ${
              tab === id ? "text-[#FFD600] border-[#FFD600]" : "text-slate-500 border-transparent hover:text-slate-300"
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
            {count !== undefined && <span className="ml-1 text-[9px] bg-white/10 px-1.5 py-0.5 rounded-full">{count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="py-16 flex items-center justify-center gap-3 text-slate-500 font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading...
        </div>
      ) : (

        <>
          {/* ── Knowledge Base ── */}
          {tab === "kb" && (
            <div className="space-y-3">
              {stats && stats.knowledgeBase.pending > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FFD600]/8 border border-[#FFD600]/20 text-[#FFD600] text-xs font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {stats.knowledgeBase.pending} KB entry/entries pending admin approval before the AI uses them.
                </div>
              )}
              {kb.length === 0 ? (
                <div className="py-16 text-center text-slate-600">
                  <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-mono">No knowledge base entries yet. Click "Teach AI" to add the first entry.</p>
                </div>
              ) : kb.map(entry => {
                const cat = catMeta(entry.category);
                return (
                  <div key={entry.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-bold text-white">{entry.title}</span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${cat.color}`}>{cat.label}</span>
                          {entry.approved === 1
                            ? <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 flex items-center gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" /> LIVE</span>
                            : <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border text-yellow-400 border-yellow-500/30 bg-yellow-500/10">PENDING</span>
                          }
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed mb-2">{entry.content.slice(0, 200)}{entry.content.length > 200 ? "…" : ""}</p>
                        <div className="flex items-center gap-3 text-[9px] font-mono text-slate-600">
                          <span>by {entry.author}</span>
                          <span>used {entry.used_count}×</span>
                          <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && entry.approved === 0 && (
                          <button onClick={() => approveKb(entry.id)} title="Approve — makes it active"
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => deleteKb(entry.id)} title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── AI Feedback ── */}
          {tab === "feedback" && (
            <div className="space-y-3">
              {feedback.length === 0 ? (
                <div className="py-16 text-center text-slate-600">
                  <ThumbsUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-mono">No feedback yet. Use the AI chat and rate responses to start training.</p>
                </div>
              ) : feedback.map(f => (
                <div key={f.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      f.rating === "positive" ? "bg-emerald-500/15 border border-emerald-500/30" :
                      f.rating === "negative" ? "bg-red-500/15 border border-red-500/30" :
                      "bg-white/5 border border-white/10"
                    }`}>
                      {f.rating === "positive" ? <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" /> :
                       f.rating === "negative" ? <ThumbsDown className="w-3.5 h-3.5 text-red-400" /> :
                       <MessageSquare className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white mb-0.5 truncate">Q: {f.user_message.slice(0, 120)}</div>
                      <div className="text-[10px] text-slate-500 mb-1 truncate">AI: {f.ai_response.slice(0, 100)}</div>
                      {f.correction && (
                        <div className="text-[10px] text-[#FFD600] font-mono bg-[#FFD600]/5 border border-[#FFD600]/15 rounded p-2 mt-1">
                          ✏️ Correction: {f.correction.slice(0, 150)}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-slate-600">
                        <span>{f.analyst_name}</span>
                        <span className="capitalize">{f.topic}</span>
                        <span>{new Date(f.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Training Data ── */}
          {tab === "training" && stats && (
            <div className="space-y-4">
              <div className="card p-6 space-y-5">
                <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" /> Training Dataset Status
                </h3>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Training Samples", val: stats.training.samples },
                    { label: "File Size", val: `${stats.training.fileSizeKb} KB` },
                    { label: "Target for Fine-tune", val: "1,000 samples" },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-xl bg-white/4 border border-white/8 p-4">
                      <div className="text-[9px] uppercase font-mono text-slate-600">{label}</div>
                      <div className="text-lg font-bold font-mono text-white mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>

                {/* Progress to 1000 samples */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1.5">
                    <span>Fine-tuning readiness</span>
                    <span>{Math.min(100, Math.round((stats.training.samples / 1000) * 100))}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (stats.training.samples / 1000) * 100)}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-600 font-mono mt-1">
                    {1000 - stats.training.samples > 0 ? `${1000 - stats.training.samples} more samples needed` : "Ready for fine-tuning!"} — each analyst correction adds 1 sample
                  </p>
                </div>

                {/* Fine-tuning Instructions */}
                <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-4 space-y-2">
                  <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> How to Fine-tune with This Data
                  </h4>
                  <ol className="text-[10px] text-slate-400 space-y-1 leading-relaxed list-decimal list-inside">
                    <li>Download the JSONL file below (need ~1,000 samples minimum)</li>
                    <li>Go to <span className="text-blue-400 font-mono">console.cloud.google.com</span> → Vertex AI → Generative AI Studio</li>
                    <li>Select <span className="font-mono text-white">gemini-1.5-flash</span> → Tune → Supervised Fine-tuning</li>
                    <li>Upload the JSONL file as training data</li>
                    <li>Training takes ~1-2 hours, costs ~$5-20 depending on dataset size</li>
                    <li>Deploy the tuned model and update <span className="font-mono text-white">GEMINI_API_KEY</span> + model ID in .env</li>
                  </ol>
                </div>

                {isAdmin ? (
                  <button onClick={downloadTraining}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold transition">
                    <Download className="w-4 h-4" />
                    Download Training JSONL ({stats.training.samples} samples, {stats.training.fileSizeKb} KB)
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 p-3 bg-white/3 rounded-lg border border-white/8">
                    <Lock className="w-3.5 h-3.5" /> Admin access required to download training data
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAdd && <AddKbModal token={token} onClose={() => setShowAdd(false)} onAdded={loadAll} />}
    </div>
  );
}
