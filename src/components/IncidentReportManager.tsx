/**
 * LitSecure Sentinel — Incident Report Manager
 * Full CRUD management UI for all submitted incident reports.
 * Analysts and investigators can view, filter, update, assign,
 * add notes, change status, and delete incidents.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Eye, Edit3, Trash2,
  RefreshCw, Search, Filter, ChevronDown, X, Save, Loader2,
  Shield, Zap, Globe, Phone, MapPin, User, Building2,
  FileText, ExternalLink, Plus, Tag, MessageSquare,
  ChevronRight, ArrowUpDown, Download, Siren
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Incident {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  status: string;
  reporterName: string;
  reporterContact: string;
  reporterOrg: string;
  incidentDate: string;
  assignedInvestigator?: string;
  mitigationAdvice?: string;
  analysisSummary?: string;
  compromisedIndicators?: {
    phoneNumbers?: string[];
    ips?: string[];
    domains?: string[];
    devices?: string[];
  };
  updates?: { timestamp: string; author: string; message: string }[];
  createdAt: string;
  updatedAt: string;
  priorityScore?: number;
  priorityLevel?: string;
  sector?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  Critical: { color: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/30",    dot: "bg-red-500"    },
  High:     { color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30", dot: "bg-orange-500" },
  Medium:   { color: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30", dot: "bg-yellow-500" },
  Low:      { color: "text-slate-400",  bg: "bg-slate-500/15",  border: "border-slate-500/30",  dot: "bg-slate-500"  },
};

const STATUS_META: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  Reported:      { color: "text-slate-400",  bg: "bg-slate-500/10",  icon: Clock       },
  Investigating: { color: "text-blue-400",   bg: "bg-blue-500/10",   icon: Search      },
  Contained:     { color: "text-orange-400", bg: "bg-orange-500/10", icon: Shield      },
  Resolved:      { color: "text-emerald-400",bg: "bg-emerald-500/10",icon: CheckCircle2},
  Closed:        { color: "text-slate-500",  bg: "bg-white/5",       icon: X           },
};

const STATUSES = ["Reported", "Investigating", "Contained", "Resolved", "Closed"];
const SEVERITIES = ["Critical", "High", "Medium", "Low"];
const CATEGORIES = ["phishing", "sim_swap", "ransomware", "fraud", "data_breach", "ddos", "malware", "social_engineering", "unknown"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Severity Badge ───────────────────────────────────────────────────────────

function SevBadge({ severity }: { severity: string }) {
  const m = SEVERITY_META[severity] || SEVERITY_META.Low;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${m.color} ${m.bg} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {severity}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.Reported;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${m.color} ${m.bg}`}>
      <Icon className="w-2.5 h-2.5" />
      {status}
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  incident,
  token,
  onClose,
  onSaved,
}: {
  incident: Incident;
  token: string;
  onClose: () => void;
  onSaved: (updated: Incident) => void;
}) {
  const [form, setForm] = useState({
    status:               incident.status,
    severity:             incident.severity,
    assignedInvestigator: incident.assignedInvestigator || "",
    mitigationAdvice:     incident.mitigationAdvice || "",
    analysisSummary:      incident.analysisSummary || "",
    note:                 "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status:               form.status,
          severity:             form.severity,
          assigned_investigator: form.assignedInvestigator,
          mitigation_advice:    form.mitigationAdvice,
          analysis_summary:     form.analysisSummary,
          note:                 form.note || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || `Error ${res.status}`);
        return;
      }
      const updated = await res.json();
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[#FFD600]/30 bg-[#05080F] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-white/8 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
            <Edit3 className="w-4 h-4 text-[#FFD600]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-grotesk font-bold text-white text-sm truncate">Edit Incident</h3>
            <p className="text-[9px] font-mono text-slate-500 truncate">{incident.id} · {incident.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && (
            <div className="text-red-400 text-xs font-mono p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40"
              >
                {STATUSES.map(s => <option key={s} value={s} className="bg-[#0A0E1A] text-white">{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Severity</label>
              <select
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value as any }))}
                className="mt-1 w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40"
              >
                {SEVERITIES.map(s => <option key={s} value={s} className="bg-[#0A0E1A] text-white">{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Assigned Investigator</label>
            <input
              value={form.assignedInvestigator}
              onChange={e => setForm(f => ({ ...f, assignedInvestigator: e.target.value }))}
              placeholder="investigator@macra.mw"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Analysis Summary</label>
            <textarea
              value={form.analysisSummary}
              onChange={e => setForm(f => ({ ...f, analysisSummary: e.target.value }))}
              rows={3}
              placeholder="Technical analysis of this incident..."
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40 resize-none"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Mitigation Advice</label>
            <textarea
              value={form.mitigationAdvice}
              onChange={e => setForm(f => ({ ...f, mitigationAdvice: e.target.value }))}
              rows={3}
              placeholder="Steps to contain and remediate..."
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40 resize-none"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Add Update Note</label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="Optional: describe what changed in this update..."
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/8 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white transition">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FFD600] text-black text-xs font-bold font-mono hover:bg-[#FFD600]/90 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ incident, onClose, onEdit }: { incident: Incident; onClose: () => void; onEdit: () => void }) {
  const sev = SEVERITY_META[incident.severity] || SEVERITY_META.Low;
  const ci  = incident.compromisedIndicators || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#05080F] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className={`p-5 border-b border-white/8 shrink-0 ${sev.bg}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg ${sev.bg} border ${sev.border} flex items-center justify-center shrink-0`}>
              <AlertTriangle className={`w-4 h-4 ${sev.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-grotesk font-bold text-white text-sm leading-tight">{incident.title}</h3>
              <p className="text-[9px] font-mono text-slate-500 mt-0.5">{incident.id}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-[10px] font-mono font-bold hover:bg-[#FFD600]/25 transition"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
              <button onClick={onClose} className="text-slate-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <SevBadge severity={incident.severity} />
            <StatBadge status={incident.status} />
            <span className="text-[9px] font-mono text-slate-500 ml-auto">{fmtCategory(incident.category)}</span>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Description */}
          <div>
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">Description</div>
            <p className="text-sm text-slate-300 leading-relaxed">{incident.description}</p>
          </div>

          {/* Reporter */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: User,     label: "Reporter",     val: incident.reporterName },
              { icon: Phone,    label: "Contact",      val: incident.reporterContact },
              { icon: Building2,label: "Organisation", val: incident.reporterOrg },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="bg-white/3 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[8px] text-slate-600 uppercase mb-1">
                  <Icon className="w-3 h-3" /> {label}
                </div>
                <div className="text-xs text-slate-300 font-mono truncate">{val}</div>
              </div>
            ))}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Incident Date", val: new Date(incident.incidentDate).toLocaleString() },
              { label: "Reported",      val: new Date(incident.createdAt).toLocaleString() },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/3 rounded-lg p-3">
                <div className="text-[8px] text-slate-600 uppercase mb-1">{label}</div>
                <div className="text-xs text-slate-300 font-mono">{val}</div>
              </div>
            ))}
          </div>

          {/* Assigned */}
          {incident.assignedInvestigator && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div>
                <div className="text-[8px] text-blue-500 uppercase">Assigned Investigator</div>
                <div className="text-xs text-blue-300 font-mono">{incident.assignedInvestigator}</div>
              </div>
            </div>
          )}

          {/* IOCs */}
          {(ci.phoneNumbers?.length || ci.ips?.length || ci.domains?.length || ci.devices?.length) ? (
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-2">Compromised Indicators</div>
              <div className="space-y-1.5">
                {ci.phoneNumbers?.map(p => (
                  <div key={p} className="flex items-center gap-2 px-2 py-1 rounded bg-red-500/5 border border-red-500/15 text-[10px] font-mono text-red-300">
                    <Phone className="w-3 h-3 text-red-500" /> {p}
                  </div>
                ))}
                {ci.ips?.map(ip => (
                  <div key={ip} className="flex items-center gap-2 px-2 py-1 rounded bg-orange-500/5 border border-orange-500/15 text-[10px] font-mono text-orange-300">
                    <Globe className="w-3 h-3 text-orange-500" /> {ip}
                  </div>
                ))}
                {ci.domains?.map(d => (
                  <div key={d} className="flex items-center gap-2 px-2 py-1 rounded bg-yellow-500/5 border border-yellow-500/15 text-[10px] font-mono text-yellow-300">
                    <ExternalLink className="w-3 h-3 text-yellow-500" /> {d}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Analysis summary */}
          {incident.analysisSummary && (
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">AI Analysis Summary</div>
              <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-3 text-xs text-slate-300 leading-relaxed">
                {incident.analysisSummary}
              </div>
            </div>
          )}

          {/* Mitigation */}
          {incident.mitigationAdvice && (
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">Mitigation Advice</div>
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {incident.mitigationAdvice}
              </div>
            </div>
          )}

          {/* Timeline */}
          {incident.updates && incident.updates.length > 0 && (
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-2">Update Timeline</div>
              <div className="space-y-2">
                {incident.updates.map((u, i) => (
                  <div key={i} className="flex gap-3 text-[10px]">
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="w-2 h-2 rounded-full bg-[#FFD600]/60 mt-0.5" />
                      {i < incident.updates!.length - 1 && <div className="w-px flex-1 bg-white/5" />}
                    </div>
                    <div className="pb-2">
                      <div className="font-mono text-slate-500 text-[8px]">{new Date(u.timestamp).toLocaleString()} · {u.author}</div>
                      <div className="text-slate-300 mt-0.5">{u.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { token: string; role: string; }

export default function IncidentReportManager({ token, role }: Props) {
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [loading,   setLoading]       = useState(true);
  const [search,    setSearch]        = useState("");
  const [filterSev, setFilterSev]     = useState("ALL");
  const [filterStat,setFilterStat]    = useState("ALL");
  const [filterCat, setFilterCat]     = useState("ALL");
  const [sortBy,    setSortBy]        = useState<"date" | "severity" | "status">("date");
  const [sortDir,   setSortDir]       = useState<"asc" | "desc">("desc");
  const [detail,    setDetail]        = useState<Incident | null>(null);
  const [editing,   setEditing]       = useState<Incident | null>(null);
  const [deleting,  setDeleting]      = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canEdit   = ["admin","super_admin","gov_admin","soc_manager","analyst","investigator"].includes(role);
  const canDelete = ["admin","super_admin","gov_admin"].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/incidents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIncidents(Array.isArray(data) ? data : (data.incidents ?? []));
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated: Incident) => {
    setIncidents(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
    if (detail?.id === updated.id) setDetail(prev => prev ? { ...prev, ...updated } : null);
  };

  const handleDelete = async (id: string) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setIncidents(prev => prev.filter(i => i.id !== id));
        setDeleting(null);
        if (detail?.id === id) setDetail(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtering + sorting
  const SEV_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const filtered = useMemo(() => {
    let list = incidents.filter(i => {
      if (filterSev  !== "ALL" && i.severity !== filterSev)  return false;
      if (filterStat !== "ALL" && i.status   !== filterStat) return false;
      if (filterCat  !== "ALL" && i.category !== filterCat)  return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.reporterOrg.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q)
        );
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date")     cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "severity") cmp = (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4);
      if (sortBy === "status")   cmp = a.status.localeCompare(b.status);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [incidents, filterSev, filterStat, filterCat, search, sortBy, sortDir]);

  // Stats
  const stats = useMemo(() => ({
    total:    incidents.length,
    open:     incidents.filter(i => !["Resolved","Closed"].includes(i.status)).length,
    critical: incidents.filter(i => i.severity === "Critical" && !["Resolved","Closed"].includes(i.status)).length,
    resolved: incidents.filter(i => ["Resolved","Closed"].includes(i.status)).length,
  }), [incidents]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  return (
    <div className="space-y-5" id="incident-manager">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0e0a1a] to-[#0A0E1A] border border-red-500/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-red-500/50 via-orange-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Siren className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">INCIDENT REPORT MANAGER</h2>
              <p className="text-[10px] text-slate-500 font-mono">View · Triage · Assign · Resolve — All submitted incidents</p>
            </div>
          </div>
          <button
            onClick={load}
            className="sm:ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition text-xs font-mono"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Reports",  val: stats.total,    color: "text-slate-300  bg-white/5 border-white/10" },
          { label: "Open",           val: stats.open,     color: "text-blue-400   bg-blue-500/10 border-blue-500/20" },
          { label: "Critical Active",val: stats.critical, color: "text-red-400    bg-red-500/10 border-red-500/20" },
          { label: "Resolved",       val: stats.resolved, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
        ].map(({ label, val, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${color}`}>
            <div className="text-[9px] uppercase font-mono tracking-wider opacity-60">{label}</div>
            <div className="text-2xl font-bold font-mono mt-0.5">{val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search incidents..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40"
          />
        </div>
        {[
          { label: "Severity", val: filterSev,  set: setFilterSev,  opts: ["ALL", ...SEVERITIES] },
          { label: "Status",   val: filterStat, set: setFilterStat, opts: ["ALL", ...STATUSES] },
          { label: "Category", val: filterCat,  set: setFilterCat,  opts: ["ALL", ...CATEGORIES] },
        ].map(({ label, val, set, opts }) => (
          <select
            key={label}
            value={val}
            onChange={e => set(e.target.value)}
            className="bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD600]/40"
          >
            {opts.map(o => <option key={o} value={o} className="bg-[#0A0E1A] text-white">{o === "ALL" ? `All ${label}` : fmtCategory(o)}</option>)}
          </select>
        ))}
        <span className="ml-auto text-[10px] font-mono text-slate-600">{filtered.length} / {incidents.length} shown</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-slate-400 font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading incidents...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-slate-700" />
          <p className="text-slate-500 text-sm font-mono">No incidents match your filters.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {[
                    { label: "Incident",   field: null        },
                    { label: "Severity",   field: "severity"  },
                    { label: "Status",     field: "status"    },
                    { label: "Category",   field: null        },
                    { label: "Reporter",   field: null        },
                    { label: "Date",       field: "date"      },
                    { label: "Actions",    field: null        },
                  ].map(({ label, field }) => (
                    <th
                      key={label}
                      onClick={() => field && toggleSort(field as any)}
                      className={`text-left text-[9px] font-mono uppercase text-slate-500 px-4 py-3 whitespace-nowrap ${field ? "cursor-pointer hover:text-slate-300 transition" : ""}`}
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        {field && <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(inc => (
                  <tr key={inc.id} className="hover:bg-white/2 transition group">
                    <td className="px-4 py-3 max-w-[240px]">
                      <div className="text-xs font-semibold text-white truncate">{inc.title}</div>
                      <div className="text-[9px] font-mono text-slate-600">{inc.id}</div>
                    </td>
                    <td className="px-4 py-3"><SevBadge severity={inc.severity} /></td>
                    <td className="px-4 py-3"><StatBadge status={inc.status} /></td>
                    <td className="px-4 py-3 text-[10px] text-slate-400 font-mono">{fmtCategory(inc.category)}</td>
                    <td className="px-4 py-3">
                      <div className="text-[10px] text-slate-300">{inc.reporterName}</div>
                      <div className="text-[9px] text-slate-600 font-mono">{inc.reporterOrg}</div>
                    </td>
                    <td className="px-4 py-3 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                      {timeAgo(inc.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => setDetail(inc)}
                          title="View"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => setEditing(inc)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#FFD600] hover:bg-[#FFD600]/10 transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleting(inc.id)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <DetailModal
          incident={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
        />
      )}

      {/* Edit Modal */}
      {editing && (
        <EditModal
          incident={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Delete Confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#05080F] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Delete Incident?</h3>
                <p className="text-[10px] text-slate-500 font-mono">{deleting}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">This action is permanent and cannot be undone. All evidence links will be orphaned.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white transition">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleting)}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
