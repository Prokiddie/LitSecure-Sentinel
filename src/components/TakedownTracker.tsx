/**
 * LitSecure Sentinel — Takedown Tracker (Phase 2)
 * Coordinates domain/IP takedown requests with ISPs, MACRA, ZICTA, and
 * international registrars. Tracks status from REQUEST → IN_REVIEW → ACTIONED.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Gavel, Plus, RefreshCw, Loader2, Globe, Wifi,
  CheckCircle2, Clock, XCircle, X,
  Send, ExternalLink, ChevronRight, Filter
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TakedownRequest {
  id:          string;
  type:        "DOMAIN" | "IP" | "URL" | "PHONE";
  target:      string;
  reason:      string;
  category:    string;
  status:      "PENDING" | "IN_REVIEW" | "ACTIONED" | "REJECTED" | "WITHDRAWN";
  priority:    "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  assignedTo:  string;
  submittedBy: string;
  incidentId?: string;
  notes:       string;
  createdAt:   string;
  updatedAt:   string;
  actionedAt?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const AUTHORITIES: Record<string, { name: string; handles: string[] }> = {
  "MACRA":      { name: "Malawi Communications Regulatory Authority", handles: ["DOMAIN", "IP", "PHONE"] },
  "MACERT":     { name: "Malawi CERT — National Cyber Emergency Team",  handles: ["IP", "URL", "DOMAIN"] },
  "ZICTA":      { name: "Zambia ICT Authority (regional)",              handles: ["IP", "DOMAIN"] },
  "Airtel":     { name: "Airtel Malawi NOC",                           handles: ["IP", "PHONE"] },
  "TNM":        { name: "TNM — Telekom Networks Malawi",               handles: ["IP", "PHONE"] },
  "ICANN":      { name: "ICANN WHOIS / Registrar",                     handles: ["DOMAIN"] },
  "Cloudflare": { name: "Cloudflare Abuse",                            handles: ["IP", "URL", "DOMAIN"] },
};

const STATUS_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING:   { color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",   icon: Clock,         label: "Pending"   },
  IN_REVIEW: { color: "text-blue-400 bg-blue-500/10 border-blue-500/30",         icon: RefreshCw,     label: "In Review" },
  ACTIONED:  { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",icon: CheckCircle2,  label: "Actioned"  },
  REJECTED:  { color: "text-red-400 bg-red-500/10 border-red-500/30",            icon: XCircle,       label: "Rejected"  },
  WITHDRAWN: { color: "text-slate-500 bg-white/5 border-white/10",               icon: X,             label: "Withdrawn" },
};

const PRIORITY_META: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/10 border-red-500/30",
  HIGH:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  MEDIUM:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  LOW:      "text-slate-400 bg-white/5 border-white/10",
};

// Generates client-side IDs (no API key)
function localId() {
  return "td-" + Math.random().toString(36).slice(2, 10);
}

// ─── Storage: localStorage (no backend table needed for demo) ─────────────────
function loadRequests(): TakedownRequest[] {
  try { return JSON.parse(localStorage.getItem("td_requests") ?? "[]"); } catch { return []; }
}
function saveRequests(r: TakedownRequest[]) {
  localStorage.setItem("td_requests", JSON.stringify(r));
}

// Seed demo data if empty
function ensureSeeded(): TakedownRequest[] {
  const existing = loadRequests();
  if (existing.length > 0) return existing;
  const now = new Date();
  const seeds: TakedownRequest[] = [
    {
      id: localId(), type: "DOMAIN", target: "airte1.mw", reason: "Phishing site impersonating Airtel Malawi",
      category: "Phishing", status: "IN_REVIEW", priority: "CRITICAL", assignedTo: "MACRA",
      submittedBy: "analyst@airtel.mw", notes: "Users receiving fraudulent SMS directing to this domain",
      createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(), updatedAt: now.toISOString(),
    },
    {
      id: localId(), type: "IP", target: "91.92.40.11", reason: "Active C2 server detected by AbuseIPDB",
      category: "Malware C2", status: "PENDING", priority: "HIGH", assignedTo: "MACERT",
      submittedBy: "admin@macra.mw", notes: "200+ abuse reports. Kaspersky OpenTIP confirms active botnet",
      createdAt: new Date(now.getTime() - 3600000 * 5).toISOString(), updatedAt: now.toISOString(),
    },
    {
      id: localId(), type: "PHONE", target: "+265888001234", reason: "SIM swap fraud — reported by RBM",
      category: "SIM Swap", status: "ACTIONED", priority: "CRITICAL", assignedTo: "Airtel",
      submittedBy: "investigator@police.mw", notes: "Number suspended. Forensic hold applied.",
      createdAt: new Date(now.getTime() - 86400000 * 5).toISOString(), updatedAt: now.toISOString(),
      actionedAt: new Date(now.getTime() - 86400000 * 3).toISOString(),
    },
    {
      id: localId(), type: "URL", target: "https://sbm-malawi-login.tk/secure", reason: "Fake SBM banking portal harvesting credentials",
      category: "Phishing", status: "PENDING", priority: "CRITICAL", assignedTo: "Cloudflare",
      submittedBy: "admin@macra.mw", notes: "Multiple customers reported credential theft",
      createdAt: new Date(now.getTime() - 3600000).toISOString(), updatedAt: now.toISOString(),
    },
  ];
  saveRequests(seeds);
  return seeds;
}

// ─── New Request Form ─────────────────────────────────────────────────────────

function NewRequestModal({ onSave, onClose }: { onSave: (r: TakedownRequest) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    type: "DOMAIN" as TakedownRequest["type"],
    target: "", reason: "", category: "Phishing",
    priority: "HIGH" as TakedownRequest["priority"],
    assignedTo: "MACRA", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const availableAuthorities = Object.entries(AUTHORITIES)
    .filter(([, v]) => v.handles.includes(form.type))
    .map(([k]) => k);

  const submit = async () => {
    if (!form.target.trim() || !form.reason.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400)); // simulate latency
    const now = new Date().toISOString();
    const req: TakedownRequest = {
      id: localId(), ...form,
      status: "PENDING",
      submittedBy: sessionStorage.getItem("sentinel_email") || "admin@macra.mw",
      incidentId: undefined, createdAt: now, updatedAt: now,
    };
    onSave(req);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#05080F] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-grotesk font-bold text-white flex items-center gap-2">
            <Gavel className="w-4 h-4 text-[#FFD600]" /> New Takedown Request
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any, assignedTo: availableAuthorities[0] ?? "MACRA" }))}
                className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40">
                {["DOMAIN", "IP", "URL", "PHONE"].map(t => <option key={t} value={t} className="bg-[#0A0E1A] text-white">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))}
                className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40">
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(p => <option key={p} value={p} className="bg-[#0A0E1A] text-white">{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Target *</label>
            <input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
              placeholder={form.type === "DOMAIN" ? "malicious-site.tk" : form.type === "IP" ? "1.2.3.4" : form.type === "PHONE" ? "+265888..." : "https://..."}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40" />
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Reason *</label>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Brief reason for takedown request"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40">
                {["Phishing", "Malware C2", "SIM Swap", "Fraud", "Ransomware", "DDoS", "Scam", "Other"].map(c => <option key={c} value={c} className="bg-[#0A0E1A] text-white">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Submit To</label>
              <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40">
                {Object.entries(AUTHORITIES)
                  .filter(([, v]) => v.handles.includes(form.type))
                  .map(([k, v]) => <option key={k} value={k} className="bg-[#0A0E1A] text-white">{k} — {v.name.slice(0, 25)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Evidence / Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              placeholder="Links to evidence, incident IDs, threat feed references..."
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white font-mono transition">Cancel</button>
          <button onClick={submit} disabled={saving || !form.target.trim() || !form.reason.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FFD600] hover:bg-[#FFD600]/90 text-black text-xs font-bold font-mono transition disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Request Card ──────────────────────────────────────────────────────────────

interface RequestCardProps {
  req:            TakedownRequest;
  onStatusChange: (id: string, s: TakedownRequest["status"]) => void;
}

const RequestCard: React.FC<RequestCardProps> = ({ req, onStatusChange }) => {
  const sm = STATUS_META[req.status];
  const StatusIcon = sm.icon;
  const pm = PRIORITY_META[req.priority];
  const typeIcon = req.type === "DOMAIN" ? Globe : req.type === "IP" ? Wifi : req.type === "PHONE" ? Send : ExternalLink;
  const TypeIcon = typeIcon;
  const hoursAgo = Math.round((Date.now() - new Date(req.createdAt).getTime()) / 3600000);

  return (
    <div className={`rounded-xl border bg-[#05080F]/60 p-4 space-y-3 transition-all hover:border-white/15 ${
      req.status === "ACTIONED" ? "border-emerald-500/15" : req.status === "REJECTED" ? "border-red-500/10 opacity-60" : "border-white/8"
    }`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <TypeIcon className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-mono text-slate-100 truncate">{req.target}</p>
          <p className="text-[10px] text-slate-500 truncate">{req.reason}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${pm}`}>{req.priority}</span>
          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${sm.color}`}>
            <StatusIcon className="w-2.5 h-2.5" /> {sm.label}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
        <span className="text-slate-600">{req.type}</span>
        <span className="text-slate-700">·</span>
        <span className="text-slate-500">{req.category}</span>
        <span className="text-slate-700">·</span>
        <span className="text-slate-500">→ {req.assignedTo}</span>
        <span className="ml-auto text-slate-700">{hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo/24)}d ago`}</span>
      </div>

      {req.notes && (
        <p className="text-[10px] font-mono text-slate-500 bg-white/3 rounded px-2 py-1.5 truncate">{req.notes}</p>
      )}

      {/* Status actions */}
      {req.status !== "ACTIONED" && req.status !== "REJECTED" && req.status !== "WITHDRAWN" && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
          {req.status === "PENDING" && (
            <button onClick={() => onStatusChange(req.id, "IN_REVIEW")}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-blue-400 hover:bg-blue-500/10 transition">
              <ChevronRight className="w-3 h-3" /> Mark In Review
            </button>
          )}
          {req.status === "IN_REVIEW" && (
            <button onClick={() => onStatusChange(req.id, "ACTIONED")}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-emerald-400 hover:bg-emerald-500/10 transition">
              <CheckCircle2 className="w-3 h-3" /> Mark Actioned
            </button>
          )}
          <button onClick={() => onStatusChange(req.id, "REJECTED")}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition">
            <XCircle className="w-3 h-3" /> Reject
          </button>
          <button onClick={() => onStatusChange(req.id, "WITHDRAWN")}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-slate-500 hover:text-slate-300 hover:bg-white/5 transition">
            <X className="w-3 h-3" /> Withdraw
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TakedownTracker() {
  const [requests,  setRequests]  = useState<TakedownRequest[]>([]);
  const [showNew,   setShowNew]   = useState(false);
  const [filter,    setFilter]    = useState<string>("ALL");

  const load = useCallback(() => setRequests(ensureSeeded()), []);
  useEffect(() => { load(); }, [load]);

  const addRequest = (r: TakedownRequest) => {
    const next = [r, ...requests];
    saveRequests(next); setRequests(next);
  };

  const changeStatus = (id: string, status: TakedownRequest["status"]) => {
    const next = requests.map(r => r.id === id
      ? { ...r, status, updatedAt: new Date().toISOString(), ...(status === "ACTIONED" ? { actionedAt: new Date().toISOString() } : {}) }
      : r
    );
    saveRequests(next); setRequests(next);
  };

  const filtered = filter === "ALL" ? requests : requests.filter(r => r.status === filter || r.priority === filter || r.type === filter);

  // Stats
  const stats = {
    total:   requests.length,
    pending: requests.filter(r => r.status === "PENDING").length,
    active:  requests.filter(r => r.status === "IN_REVIEW").length,
    done:    requests.filter(r => r.status === "ACTIONED").length,
    critical:requests.filter(r => r.priority === "CRITICAL" && r.status !== "ACTIONED").length,
  };

  return (
    <div className="space-y-5" id="takedown-tracker">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#140e0a] to-[#0A0E1A] border border-[#FFD600]/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-[#FFD600]/50 via-orange-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
              <Gavel className="w-5 h-5 text-[#FFD600]" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">TAKEDOWN COORDINATOR</h2>
              <p className="text-[10px] text-slate-500 font-mono">Domain · IP · Phone · URL — MACRA · MACERT · ISPs · ICANN</p>
            </div>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="sm:ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD600] hover:bg-[#FFD600]/90 text-black text-xs font-bold font-mono transition"
          >
            <Plus className="w-3.5 h-3.5" /> New Request
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total",    val: stats.total,    color: "text-slate-300  bg-white/5 border-white/10" },
          { label: "Pending",  val: stats.pending,  color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
          { label: "Active",   val: stats.active,   color: "text-blue-400   bg-blue-500/10 border-blue-500/20" },
          { label: "Actioned", val: stats.done,     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
          { label: "Critical",  val: stats.critical, color: "text-red-400   bg-red-500/10 border-red-500/20" },
        ].map(({ label, val, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${color}`}>
            <div className="text-[10px] uppercase font-mono tracking-wider opacity-60">{label}</div>
            <div className="text-2xl font-bold font-mono mt-0.5">{val}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-3.5 h-3.5 text-slate-600" />
        {["ALL", "PENDING", "IN_REVIEW", "ACTIONED", "CRITICAL", "DOMAIN", "IP", "PHONE"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border transition ${
              filter === f ? "bg-[#FFD600]/15 border-[#FFD600]/40 text-[#FFD600]" : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
            }`}>
            {f}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-slate-600">{filtered.length} requests</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-600">
          <Gavel className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-mono">No takedown requests</p>
          <button onClick={() => setShowNew(true)} className="mt-3 text-xs font-mono text-[#FFD600]/70 hover:text-[#FFD600] flex items-center gap-1 mx-auto">
            <Plus className="w-3 h-3" /> Submit first request
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(r => (
            <RequestCard key={r.id} req={r} onStatusChange={changeStatus} />
          ))}
        </div>
      )}

      {/* Authority reference */}
      <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-4">
        <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-3">Authority Reference</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(AUTHORITIES).map(([key, auth]) => (
            <div key={key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/3 border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FFD600]/60 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold font-mono text-slate-300">{key}</p>
                <p className="text-[9px] font-mono text-slate-600 truncate">{auth.name}</p>
              </div>
              <div className="ml-auto flex flex-wrap gap-0.5 shrink-0">
                {auth.handles.map(h => (
                  <span key={h} className="text-[8px] font-mono text-slate-600 border border-white/8 px-1 rounded">{h}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showNew && <NewRequestModal onSave={addRequest} onClose={() => setShowNew(false)} />}
    </div>
  );
}
