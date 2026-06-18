/**
 * LitSecure Sentinel — Security Policy Management (Phase 2)
 * CRUD interface for sector security policies with rule builder,
 * deployment engine, and live evaluation simulator.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, Plus, Pencil, Trash2, Play, CheckCircle2,
  AlertTriangle, ChevronRight, Loader2, RefreshCw,
  Server, Globe, BarChart3, Zap, Lock, Bell, X, Save
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PolicyRule {
  field:    string;
  operator: "EQ" | "IN" | "LIKE";
  value:    string | string[];
}

interface PolicyAction {
  type:    string;
  message?: string;
  target?: string;
}

interface Policy {
  id:          string;
  name:        string;
  description: string;
  sector:      string;
  category:    "DETECTION" | "RESPONSE" | "ESCALATION" | "COMPLIANCE";
  rules:       PolicyRule[];
  actions:     PolicyAction[];
  status:      "ACTIVE" | "DISABLED" | "DRAFT";
  priority:    number;
  created_by:  string;
  created_at:  string;
  updated_at:  string;
}

interface PolicyStats {
  total:      number;
  active:     number;
  deployed:   number;
  byCategory: Array<{ category: string; count: number }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTORS = ["all", "Banking", "Telecom", "Government", "Healthcare", "Energy", "NGO", "Media"];
const CATEGORIES = ["DETECTION", "RESPONSE", "ESCALATION", "COMPLIANCE"];
const FIELDS    = ["severity", "category", "sector", "title", "description"];
const OPERATORS = ["EQ", "IN", "LIKE"];
const ACTION_TYPES = ["ALERT", "ESCALATE", "QUARANTINE_AGENT", "NOTIFY_SMS", "NOTIFY_ALL", "WARROOM_ACTIVATE", "BLOCK_IP"];

const CATEGORY_META: Record<string, { color: string; icon: React.ElementType; badge: string }> = {
  DETECTION:  { color: "text-blue-400 bg-blue-500/10 border-blue-500/25",    icon: BarChart3,     badge: "DETECT"  },
  RESPONSE:   { color: "text-red-400 bg-red-500/10 border-red-500/25",       icon: Zap,           badge: "RESPOND" },
  ESCALATION: { color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/25", icon: Bell,       badge: "ESCALATE"},
  COMPLIANCE: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", icon: Lock,    badge: "COMPLY"  },
};

const STATUS_META: Record<string, string> = {
  ACTIVE:   "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  DISABLED: "text-slate-500 bg-white/5 border-white/10",
  DRAFT:    "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authH() {
  const t = sessionStorage.getItem("sentinel_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

// ─── Policy Card ──────────────────────────────────────────────────────────────

interface PolicyCardProps {
  policy:   Policy;
  onEdit:   (p: Policy) => void;
  onDelete: (id: string) => void;
  onDeploy: (p: Policy) => void;
  onToggle: (id: string, status: string) => void;
}

const PolicyCard: React.FC<PolicyCardProps> = ({
  policy, onEdit, onDelete, onDeploy, onToggle
}) => {
  const cat = CATEGORY_META[policy.category] ?? CATEGORY_META.DETECTION;
  const CatIcon = cat.icon;

  return (
    <div className={`rounded-xl border bg-[#05080F]/60 p-4 space-y-3 transition-all hover:border-white/15 ${
      policy.status === "ACTIVE" ? "border-white/10" : "border-white/5 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${cat.color}`}>
            <CatIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100 truncate">{policy.name}</p>
            <p className="text-[10px] text-slate-500 font-mono truncate">{policy.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${STATUS_META[policy.status]}`}>
            {policy.status}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${cat.color}`}>{cat.badge}</span>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-blue-500/20 text-blue-400/80 bg-blue-500/5">
          {policy.sector === "all" ? "ALL SECTORS" : policy.sector.toUpperCase()}
        </span>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-white/10 text-slate-500">
          PRI {policy.priority}
        </span>
      </div>

      {/* Rules preview */}
      {policy.rules.length > 0 && (
        <div className="bg-white/3 rounded-lg px-3 py-2 space-y-1">
          {policy.rules.slice(0, 2).map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span className="text-slate-600">IF</span>
              <span className="text-blue-400">{r.field}</span>
              <span className="text-slate-600">{r.operator}</span>
              <span className="text-[#FFD600]/80">{JSON.stringify(r.value)}</span>
            </div>
          ))}
          {policy.rules.length > 2 && (
            <p className="text-[9px] text-slate-600 font-mono">+{policy.rules.length - 2} more conditions</p>
          )}
        </div>
      )}

      {/* Actions preview */}
      <div className="flex flex-wrap gap-1">
        {policy.actions.map((a, i) => (
          <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/8 text-red-400/70 border border-red-500/15">
            → {a.type}
          </span>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
        <button
          onClick={() => onEdit(policy)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-slate-400 hover:text-white hover:bg-white/5 transition"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button
          onClick={() => onDeploy(policy)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition"
        >
          <Server className="w-3 h-3" /> Deploy
        </button>
        <button
          onClick={() => onToggle(policy.id, policy.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition ${
            policy.status === "ACTIVE"
              ? "text-yellow-400 hover:bg-yellow-500/10"
              : "text-emerald-400 hover:bg-emerald-500/10"
          }`}
        >
          {policy.status === "ACTIVE" ? "Disable" : "Enable"}
        </button>
        <button
          onClick={() => onDelete(policy.id)}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ─── Policy Form Modal ────────────────────────────────────────────────────────

function PolicyFormModal({
  policy, onSave, onClose
}: {
  policy:  Policy | null;
  onSave:  () => void;
  onClose: () => void;
}) {
  const isEdit = !!policy?.id;
  const [form, setForm] = useState({
    name:        policy?.name        ?? "",
    description: policy?.description ?? "",
    sector:      policy?.sector      ?? "all",
    category:    policy?.category    ?? "DETECTION",
    status:      policy?.status      ?? "ACTIVE",
    priority:    policy?.priority    ?? 50,
    rules:       policy?.rules       ?? [] as PolicyRule[],
    actions:     policy?.actions     ?? [] as PolicyAction[],
  });
  const [saving, setSaving] = useState(false);

  const addRule = () => setForm(f => ({ ...f, rules: [...f.rules, { field: "severity", operator: "EQ", value: "" }] }));
  const removeRule = (i: number) => setForm(f => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }));
  const updateRule = (i: number, key: keyof PolicyRule, val: any) =>
    setForm(f => ({ ...f, rules: f.rules.map((r, j) => j === i ? { ...r, [key]: val } : r) }));

  const addAction = () => setForm(f => ({ ...f, actions: [...f.actions, { type: "ALERT", message: "" }] }));
  const removeAction = (i: number) => setForm(f => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }));
  const updateAction = (i: number, key: keyof PolicyAction, val: any) =>
    setForm(f => ({ ...f, actions: f.actions.map((a, j) => j === i ? { ...a, [key]: val } : a) }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = isEdit ? `/api/policies/${policy!.id}` : "/api/policies";
      const method = isEdit ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: authH(), body: JSON.stringify(form) });
      if (r.ok) { onSave(); onClose(); }
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#05080F] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-grotesk font-bold text-white">{isEdit ? "Edit Policy" : "New Security Policy"}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Basic fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Policy Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                placeholder="e.g. Telecom SIM Swap Response"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                placeholder="Briefly describe what this policy does"
              />
            </div>
            {[
              { label: "Sector", key: "sector", opts: SECTORS },
              { label: "Category", key: "category", opts: CATEGORIES },
              { label: "Status", key: "status", opts: ["ACTIVE", "DISABLED", "DRAFT"] },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</label>
                <select
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                >
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Priority (0–100)</label>
              <input
                type="number" min={0} max={100}
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 50 }))}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Conditions (ALL must match)</label>
              <button onClick={addRule} className="flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:text-blue-300">
                <Plus className="w-3 h-3" /> Add Rule
              </button>
            </div>
            <div className="space-y-2">
              {form.rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/3 rounded-lg px-3 py-2">
                  <span className="text-[9px] font-mono text-slate-600 shrink-0">IF</span>
                  <select
                    value={rule.field}
                    onChange={e => updateRule(i, "field", e.target.value)}
                    className="bg-transparent text-xs font-mono text-blue-400 border-none focus:outline-none"
                  >
                    {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select
                    value={rule.operator}
                    onChange={e => updateRule(i, "operator", e.target.value as any)}
                    className="bg-transparent text-xs font-mono text-slate-500 border-none focus:outline-none"
                  >
                    {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input
                    value={Array.isArray(rule.value) ? rule.value.join(",") : rule.value}
                    onChange={e => updateRule(i, "value", rule.operator === "IN" ? e.target.value.split(",") : e.target.value)}
                    placeholder={rule.operator === "IN" ? "val1,val2,..." : "value"}
                    className="flex-1 bg-transparent text-xs font-mono text-[#FFD600]/80 border-none focus:outline-none placeholder-slate-700 min-w-0"
                  />
                  <button onClick={() => removeRule(i)} className="text-red-500/40 hover:text-red-400 transition shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {form.rules.length === 0 && (
                <p className="text-[10px] font-mono text-slate-600 text-center py-2">No conditions — policy matches all events</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Actions (on match)</label>
              <button onClick={addAction} className="flex items-center gap-1 text-[10px] font-mono text-red-400 hover:text-red-300">
                <Plus className="w-3 h-3" /> Add Action
              </button>
            </div>
            <div className="space-y-2">
              {form.actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                  <span className="text-[9px] font-mono text-slate-600 shrink-0">→</span>
                  <select
                    value={action.type}
                    onChange={e => updateAction(i, "type", e.target.value)}
                    className="bg-transparent text-xs font-mono text-red-400 border-none focus:outline-none shrink-0"
                  >
                    {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    value={action.message || action.target || ""}
                    onChange={e => updateAction(i, action.type === "ESCALATE" ? "target" : "message", e.target.value)}
                    placeholder={action.type === "ESCALATE" ? "target role" : "message..."}
                    className="flex-1 bg-transparent text-xs font-mono text-slate-400 border-none focus:outline-none placeholder-slate-700 min-w-0"
                  />
                  <button onClick={() => removeAction(i)} className="text-red-500/40 hover:text-red-400 transition shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {form.actions.length === 0 && (
                <p className="text-[10px] font-mono text-slate-600 text-center py-2">No actions configured</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition font-mono">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEdit ? "Save Changes" : "Create Policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evaluate Simulator ───────────────────────────────────────────────────────

function EvaluatePanel() {
  const [incident, setIncident] = useState({ category: "Ransomware", severity: "Critical", sector: "Banking" });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const evaluate = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/policies/evaluate", {
        method: "POST", headers: authH(), body: JSON.stringify({ incident }),
      });
      setResult(await r.json());
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-xl border border-white/8 bg-[#05080F]/60 p-5 space-y-4">
      <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest flex items-center gap-2">
        <Play className="w-3.5 h-3.5 text-[#FFD600]" /> Policy Simulator
      </h3>
      <p className="text-[10px] text-slate-500 font-mono">Test which policies would fire against a hypothetical incident.</p>

      <div className="grid grid-cols-3 gap-2">
        {(["category", "severity", "sector"] as const).map(field => (
          <div key={field}>
            <label className="text-[9px] font-mono text-slate-600 uppercase">{field}</label>
            <input
              value={(incident as any)[field]}
              onChange={e => setIncident(prev => ({ ...prev, [field]: e.target.value }))}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500/40"
              placeholder={field}
            />
          </div>
        ))}
      </div>

      <button
        onClick={evaluate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-xs font-bold font-mono hover:bg-[#FFD600]/25 transition disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
        Evaluate
      </button>

      {result && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-slate-500">
            {result.total === 0 ? "No policies triggered." : `${result.total} polic${result.total === 1 ? "y" : "ies"} would trigger:`}
          </p>
          {result.triggered.map((t: any) => {
            const cat = CATEGORY_META[t.policy.category] ?? CATEGORY_META.DETECTION;
            const CIcon = cat.icon;
            return (
              <div key={t.policy.id} className={`rounded-lg border px-3 py-2.5 space-y-1 ${cat.color}`}>
                <div className="flex items-center gap-2">
                  <CIcon className="w-3 h-3 shrink-0" />
                  <span className="text-xs font-bold font-mono">{t.policy.name}</span>
                  <span className="ml-auto text-[9px] font-mono opacity-70">PRI {t.policy.priority}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.actions.map((a: any, i: number) => (
                    <span key={i} className="text-[9px] font-mono opacity-80">→ {a.type}{a.message ? `: ${a.message.slice(0, 30)}` : ""}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PolicyManagement() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [stats,    setStats]    = useState<PolicyStats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<string>("ALL");
  const [editPolicy, setEditPolicy] = useState<Policy | null | "new">(null);
  const [tab,      setTab]      = useState<"list" | "simulate">("list");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        fetch("/api/policies", { headers: authH() }),
        fetch("/api/policies/meta/stats", { headers: authH() }),
      ]);
      if (pr.ok) setPolicies(await pr.json());
      if (sr.ok) setStats(await sr.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deletePolicy = async (id: string) => {
    if (!confirm("Delete this policy?")) return;
    await fetch(`/api/policies/${id}`, { method: "DELETE", headers: authH() });
    load();
  };

  const togglePolicy = async (id: string, status: string) => {
    const p = policies.find(x => x.id === id);
    if (!p) return;
    await fetch(`/api/policies/${id}`, {
      method: "PUT", headers: authH(),
      body: JSON.stringify({ ...p, status, rules: p.rules, actions: p.actions }),
    });
    load();
  };

  const deployPolicy = async (p: Policy) => {
    await fetch(`/api/policies/${p.id}/deploy`, {
      method: "POST", headers: authH(),
      body: JSON.stringify({ sector: p.sector }),
    });
    alert(`Policy "${p.name}" deployment queued for ${p.sector === "all" ? "all sectors" : p.sector}`);
  };

  const filtered = filter === "ALL" ? policies : policies.filter(p =>
    filter === "ACTIVE" ? p.status === "ACTIVE" : p.category === filter
  );

  return (
    <div className="space-y-5" id="policy-management">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0e1224] to-[#0A0E1A] border border-emerald-500/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-emerald-500/50 via-blue-500/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">SECURITY POLICY ENGINE</h2>
              <p className="text-[10px] text-slate-500 font-mono">Sector rules · Auto-response · Endpoint deployment · Compliance enforcement</p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-2 shrink-0">
            <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setEditPolicy("new")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition"
            >
              <Plus className="w-3.5 h-3.5" /> New Policy
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Policies",  val: stats.total,    color: "text-slate-300  bg-white/5 border-white/10"             },
            { label: "Active",          val: stats.active,   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
            { label: "Deployed",        val: stats.deployed, color: "text-blue-400    bg-blue-500/10 border-blue-500/20"      },
            { label: "Categories",      val: stats.byCategory.length, color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20" },
          ].map(({ label, val, color }) => (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <div className="text-[10px] uppercase font-mono tracking-wider opacity-60">{label}</div>
              <div className="text-2xl font-bold font-mono mt-0.5">{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {([
          { id: "list",     label: "Policies",  icon: Shield },
          { id: "simulate", label: "Simulator", icon: Play   },
        ] as const).map(t => (
          <button
            key={t.id}
            id={`policy-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono font-bold transition-all ${
              tab === t.id
                ? "text-emerald-400 border-b-2 border-emerald-400 -mb-px"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* POLICIES TAB */}
      {tab === "list" && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2">
            {["ALL", "ACTIVE", ...CATEGORIES].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border transition ${
                  filter === f
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
                }`}
              >
                {f}
              </button>
            ))}
            <span className="ml-auto text-[10px] font-mono text-slate-600 self-center">{filtered.length} policies</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-600">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-mono">No policies found</p>
              <button onClick={() => setEditPolicy("new")} className="mt-3 text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mx-auto">
                <Plus className="w-3 h-3" /> Create your first policy
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(p => (
                <PolicyCard
                  key={p.id}
                  policy={p}
                  onEdit={setEditPolicy}
                  onDelete={deletePolicy}
                  onDeploy={deployPolicy}
                  onToggle={togglePolicy}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* SIMULATE TAB */}
      {tab === "simulate" && (
        <div className="max-w-lg">
          <EvaluatePanel />
        </div>
      )}

      {/* Modal */}
      {editPolicy !== null && (
        <PolicyFormModal
          policy={editPolicy === "new" ? null : editPolicy as Policy}
          onSave={load}
          onClose={() => setEditPolicy(null)}
        />
      )}
    </div>
  );
}
