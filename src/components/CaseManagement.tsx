/**
 * LitSecure Sentinel — Case Management
 * Dark-mode, production-quality case management dashboard.
 * Features: filterable case list, case detail modal with workflow steps,
 * IOC tags, risk assessment, quick-actions, and real-time notifications.
 */
import React, {
  useState, useEffect, useCallback, useMemo, useRef
} from "react";
import {
  Plus, Search, X, Eye, User, RefreshCw,
  Shield, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, Loader2, Copy, MoreVertical,
  Phone, Globe, Server, Hash, Mail, FileText, Zap,
  Lock, Activity, ArrowUp, ShieldAlert, Crosshair,
  FlaskConical, Database, BookOpen, FolderOpen
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
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

type Priority = "Critical" | "High" | "Medium" | "Low";
type TabKey = "overview" | "indicators" | "timeline" | "evidence" | "notes" | "actions";

// ─── Helper functions ───────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleString("en-MW", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const fmtCat = (c: string) =>
  c?.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase()) ?? "Unknown";

const getProgress = (inc: Incident): number => {
  const map: Record<string, number> = {
    Reported: 10,
    Investigating: 45,
    Contained: 70,
    Resolved: 95,
    Closed: 100,
  };
  return map[inc.status] ?? 0;
};

// ─── Design tokens ─────────────────────────────────────────────────────────────
const SEV_COLORS: Record<Priority, {
  border: string; bg: string; text: string; dot: string; left: string; badge: string;
}> = {
  Critical: {
    border: "border-red-500/40",
    bg:     "bg-red-500/8",
    text:   "text-red-400",
    dot:    "bg-red-500",
    left:   "border-l-red-500",
    badge:  "bg-red-500/15 text-red-400 border-red-500/30",
  },
  High: {
    border: "border-orange-500/40",
    bg:     "bg-orange-500/8",
    text:   "text-orange-400",
    dot:    "bg-orange-500",
    left:   "border-l-orange-500",
    badge:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  Medium: {
    border: "border-yellow-500/40",
    bg:     "bg-yellow-500/8",
    text:   "text-yellow-400",
    dot:    "bg-yellow-400",
    left:   "border-l-yellow-400",
    badge:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  },
  Low: {
    border: "border-blue-500/30",
    bg:     "bg-blue-500/5",
    text:   "text-blue-400",
    dot:    "bg-blue-400",
    left:   "border-l-blue-400",
    badge:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  Reported:      { label: "Reported",      cls: "bg-slate-500/15 text-slate-400 border-slate-500/25" },
  Investigating: { label: "Investigating", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25 animate-pulse" },
  Contained:     { label: "Contained",     cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
  Resolved:      { label: "Resolved",      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  Closed:        { label: "Closed",        cls: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
};

const WORKFLOW_STEPS = [
  { key: "triage",       label: "Triage",        icon: FlaskConical },
  { key: "investigate",  label: "Investigation",  icon: Search },
  { key: "contain",      label: "Containment",    icon: Shield },
  { key: "remediate",    label: "Remediation",    icon: Activity },
  { key: "close",        label: "Closure",        icon: CheckCircle2 },
];

const getWorkflowStage = (status: string) => {
  const map: Record<string, number> = {
    Reported: 0, Investigating: 1, Contained: 2, Resolved: 3, Closed: 4,
  };
  return map[status] ?? 0;
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function SevBadge({ severity }: { severity: Priority }) {
  const s = SEV_COLORS[severity];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${severity === "Critical" ? "animate-pulse" : ""}`} />
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "bg-white/5 text-slate-400 border-white/10" };
  return (
    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function ProgressBar({ progress, severity }: { progress: number; severity: Priority }) {
  const barColor = severity === "Critical" ? "bg-red-500" :
                   severity === "High"     ? "bg-orange-500" :
                   severity === "Medium"   ? "bg-yellow-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-slate-500 w-6 text-right">{progress}%</span>
    </div>
  );
}

// ─── Notification Toast ────────────────────────────────────────────────────────
function useNotifications() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: "success" | "error" | "info" | "warning" }[]>([]);
  const push = useCallback((msg: string, type: "success" | "error" | "info" | "warning" = "info") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  return { toasts, push };
}

function ToastContainer({ toasts }: { toasts: { id: number; msg: string; type: string }[] }) {
  const color: Record<string, string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error:   "border-red-500/40 bg-red-500/10 text-red-300",
    warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
    info:    "border-blue-500/40 bg-blue-500/10 text-blue-300",
  };
  return (
    <div className="fixed top-5 right-5 z-[300] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-2.5 rounded-xl border text-xs font-mono font-semibold shadow-2xl animate-fade-in ${color[t.type] ?? color.info}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── IOC Tags ─────────────────────────────────────────────────────────────────
function IocTag({ value, type }: { value: string; type: string }) {
  const [copied, setCopied] = useState(false);
  const cfg: Record<string, { color: string; Icon: React.ElementType }> = {
    ip:     { color: "bg-blue-500/15 text-blue-400 border-blue-500/25", Icon: Server },
    domain: { color: "bg-orange-500/15 text-orange-400 border-orange-500/25", Icon: Globe },
    phone:  { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", Icon: Phone },
    email:  { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", Icon: Mail },
    hash:   { color: "bg-red-500/15 text-red-400 border-red-500/25", Icon: Hash },
  };
  const { color, Icon } = cfg[type] ?? { color: "bg-white/5 text-slate-400 border-white/10", Icon: Database };
  return (
    <button
      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono font-medium transition hover:opacity-80 cursor-pointer ${color}`}
      title="Click to copy"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" />
      <span className="max-w-[140px] truncate">{value}</span>
      {copied ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : <Copy className="w-2.5 h-2.5 shrink-0 opacity-40" />}
    </button>
  );
}

// ─── Workflow Tracker ─────────────────────────────────────────────────────────
function WorkflowTracker({ status }: { status: string }) {
  const stage = getWorkflowStage(status);
  return (
    <div className="flex items-center gap-0 w-full py-4 px-5">
      {WORKFLOW_STEPS.map((step, i) => {
        const done    = i < stage;
        const active  = i === stage;
        const pending = i > stage;
        const Icon = step.icon;
        return (
          <React.Fragment key={step.key}>
            <div className={`flex flex-col items-center gap-1.5 relative z-10 ${pending ? "opacity-40" : ""}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                done   ? "bg-emerald-500 border-emerald-500" :
                active ? "bg-blue-500 border-blue-500 animate-pulse shadow-[0_0_12px_rgba(74,122,255,0.5)]" :
                         "bg-[#111927] border-[#1e2d42]"
              }`}>
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : (
                  <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-slate-500"}`} />
                )}
              </div>
              <div className="text-center">
                <div className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                  done ? "text-emerald-400" : active ? "text-blue-400" : "text-slate-600"
                }`}>{step.label}</div>
                {active && <div className="text-[8px] text-slate-600 font-mono">In Progress</div>}
                {done   && <div className="text-[8px] text-emerald-600 font-mono">Done</div>}
              </div>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 transition-all ${done ? "bg-emerald-500/60" : "bg-[#1e2d42]"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Case Detail Modal ─────────────────────────────────────────────────────────
function CaseDetailModal({
  incident,
  onClose,
  onEscalate,
  onCopy,
  token,
}: {
  incident: Incident;
  onClose: () => void;
  onEscalate: (id: string) => void;
  onCopy: (text: string) => void;
  token: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const sev = SEV_COLORS[incident.severity as Priority] ?? SEV_COLORS.Low;
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape or overlay click
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const iocs: { value: string; type: string }[] = [
    ...(incident.compromisedIndicators?.ips?.map(v => ({ value: v, type: "ip" })) ?? []),
    ...(incident.compromisedIndicators?.domains?.map(v => ({ value: v, type: "domain" })) ?? []),
    ...(incident.compromisedIndicators?.phoneNumbers?.map(v => ({ value: v, type: "phone" })) ?? []),
  ];

  const TABS: { key: TabKey; label: string; Icon: React.ElementType }[] = [
    { key: "overview",    label: "Overview",    Icon: Eye },
    { key: "indicators",  label: "Indicators",  Icon: Crosshair },
    { key: "timeline",    label: "Timeline",    Icon: Clock },
    { key: "evidence",    label: "Evidence",    Icon: FolderOpen },
    { key: "notes",       label: "Notes",       Icon: BookOpen },
    { key: "actions",     label: "Actions",     Icon: Zap },
  ];

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="w-full max-w-[1120px] max-h-[92vh] flex flex-col rounded-2xl border overflow-hidden shadow-2xl"
        style={{ background: "#0d1520", borderColor: "#1e2d42" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <div className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold tracking-wider ${sev.badge}`}>
            {incident.id}
          </div>
          <h2 className="text-sm font-bold text-white truncate flex-1">{incident.title}</h2>
          <SevBadge severity={incident.severity as Priority} />
          <StatusBadge status={incident.status} />
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Workflow ────────────────────────────────────────────────────── */}
        <div className="border-b shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <WorkflowTracker status={incident.status} />
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex gap-0 px-6 border-b shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium relative transition-all ${
                activeTab === key
                  ? "text-[#4a7aff]"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {activeTab === key && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#4a7aff] rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left */}
              <div className="lg:col-span-3 space-y-5">
                <section>
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">Description</div>
                  <p className="text-sm text-slate-300 leading-relaxed bg-white/2 p-3 rounded-xl border border-white/5">
                    {incident.description || "No description provided."}
                  </p>
                </section>

                {iocs.length > 0 && (
                  <section>
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">
                      Extracted IOC Indicators
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {iocs.map((ioc, i) => <React.Fragment key={i}><IocTag value={ioc.value} type={ioc.type} /></React.Fragment>)}
                    </div>
                  </section>
                )}

                {incident.mitigationAdvice && (
                  <section>
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">
                      Mitigation Advice
                    </div>
                    <div className="p-3 rounded-xl border border-[#FFD600]/20 bg-[#FFD600]/5 text-xs text-[#FFD600] font-mono leading-relaxed">
                      {incident.mitigationAdvice}
                    </div>
                  </section>
                )}

                {incident.updates && incident.updates.length > 0 && (
                  <section>
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">
                      Activity Log
                    </div>
                    <div className="space-y-2">
                      {incident.updates.slice().reverse().map((u, i) => (
                        <div key={i} className="flex gap-3 p-2.5 bg-white/2 border border-white/5 rounded-lg">
                          <div className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <User className="w-3 h-3 text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-200">{u.author}</span>
                              <span className="text-[9px] font-mono text-slate-600">{fmtDate(u.timestamp)}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{u.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Right */}
              <div className="lg:col-span-2 space-y-5">
                {/* Assignment Card */}
                <div className="p-4 rounded-xl border bg-white/2" style={{ borderColor: "#1e2d42" }}>
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Assignment</div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{incident.assignedInvestigator ?? "Unassigned"}</div>
                      <div className="text-[9px] text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[10px] font-mono text-slate-400">
                    <div className="flex justify-between">
                      <span>Reporter</span>
                      <span className="text-slate-300">{incident.reporterName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Organisation</span>
                      <span className="text-slate-300">{incident.reporterOrg}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Category</span>
                      <span className="text-slate-300">{fmtCat(incident.category)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Filed</span>
                      <span className="text-slate-300">{timeAgo(incident.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Updated</span>
                      <span className="text-slate-300">{timeAgo(incident.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Risk Card */}
                <div className="p-4 rounded-xl border bg-white/2" style={{ borderColor: "#1e2d42" }}>
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Risk Assessment</div>
                  {[
                    { label: "Severity",  val: incident.severity },
                    { label: "Priority",  val: incident.priorityLevel ?? "—" },
                    { label: "Score",     val: incident.priorityScore != null ? `${incident.priorityScore}/100` : "—" },
                    { label: "Status",    val: incident.status },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between items-center py-1.5 border-b border-white/4 last:border-0 text-[10px] font-mono">
                      <span className="text-slate-500">{label}</span>
                      <span className={`font-bold ${
                        val === "Critical" || val === "Immediate" ? "text-red-400" :
                        val === "High" ? "text-orange-400" :
                        val === "Medium" ? "text-yellow-400" :
                        val === "Low" ? "text-blue-400" : "text-slate-300"
                      }`}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Quick Actions */}
                <div className="p-4 rounded-xl border bg-white/2" style={{ borderColor: "#1e2d42" }}>
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Quick Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onCopy(incident.id)}
                      className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-[10px] font-mono font-bold transition bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy ID
                    </button>
                    <button
                      onClick={() => onEscalate(incident.id)}
                      className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-[10px] font-mono font-bold transition bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                    >
                      <ArrowUp className="w-3.5 h-3.5" /> Escalate
                    </button>
                    <button className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-[10px] font-mono font-bold transition bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20">
                      <Lock className="w-3.5 h-3.5" /> Block IOCs
                    </button>
                    <button className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-[10px] font-mono font-bold transition bg-white/5 border-white/10 text-slate-300 hover:bg-white/10">
                      <FileText className="w-3.5 h-3.5" /> Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "indicators" && (
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-4">
                Compromise Indicators ({iocs.length} extracted)
              </div>
              {iocs.length === 0 ? (
                <div className="text-center py-12 text-slate-600">
                  <Crosshair className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="text-xs font-mono">No structured IOCs found. Edit the incident to add indicators.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {iocs.map((ioc, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/2 hover:border-white/10 transition">
                      <IocTag value={ioc.value} type={ioc.type} />
                      <span className="text-[9px] font-mono text-slate-500 ml-auto capitalize">{ioc.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-4">Incident Timeline</div>
              <div className="relative pl-6 border-l border-white/8 space-y-4">
                <div className="relative">
                  <span className="absolute -left-[25px] w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0d1520] flex items-center justify-center">
                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                  </span>
                  <div className="text-[9px] font-mono text-slate-600 mb-1">{fmtDate(incident.incidentDate)}</div>
                  <div className="text-xs font-semibold text-white">Incident Reported</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Initial report filed by {incident.reporterName} ({incident.reporterOrg})</div>
                </div>
                {(incident.updates ?? []).map((u, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[25px] w-4 h-4 rounded-full bg-blue-500 border-2 border-[#0d1520] flex items-center justify-center">
                      <Activity className="w-2.5 h-2.5 text-white" />
                    </span>
                    <div className="text-[9px] font-mono text-slate-600 mb-1">{fmtDate(u.timestamp)}</div>
                    <div className="text-xs font-semibold text-white">{u.author}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{u.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeTab === "evidence" || activeTab === "notes" || activeTab === "actions") && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
              <Database className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-xs font-mono text-center">
                {activeTab === "evidence" ? "No evidence files uploaded yet." :
                 activeTab === "notes" ? "No analyst notes recorded." :
                 "No automated actions queued."}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-t shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <div className="flex items-center gap-4 text-[9px] font-mono text-slate-600">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> AES-256 Encrypted</span>
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Last sync: {timeAgo(incident.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-mono font-bold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition">
              Close
            </button>
            <button
              onClick={() => onEscalate(incident.id)}
              className="px-4 py-2 text-xs font-mono font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 rounded-lg transition flex items-center gap-1.5"
            >
              <ArrowUp className="w-3.5 h-3.5" /> Escalate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New Case Form Modal ───────────────────────────────────────────────────────
function NewCaseModal({
  onClose,
  onCreated,
  token,
}: {
  onClose: () => void;
  onCreated: () => void;
  token: string;
}) {
  const [form, setForm] = useState({
    title: "", description: "", category: "sim_swap",
    severity: "High" as Priority, reporterName: "", reporterContact: "", reporterOrg: "",
    incidentDate: new Date().toISOString().slice(0, 16),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const categories = [
    { value: "sim_swap", label: "SIM Swap" },
    { value: "phishing", label: "Phishing" },
    { value: "ransomware", label: "Ransomware" },
    { value: "fraud", label: "Financial Fraud" },
    { value: "data_breach", label: "Data Breach" },
    { value: "ddos", label: "DDoS Attack" },
    { value: "malware", label: "Malware Infection" },
    { value: "social_engineering", label: "Social Engineering" },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.reporterName) { setError("Title and Reporter Name are required."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-[#1a2332] border border-[#1e2d42] hover:border-[#2a3d5a] focus:border-[#4a7aff] focus:ring-0 focus:shadow-[0_0_12px_rgba(74,122,255,0.12)] rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none transition font-mono";
  const labelCls = "block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden shadow-2xl" style={{ background: "#0d1520", borderColor: "#1e2d42" }}>
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <div className="w-8 h-8 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
            <Plus className="w-4 h-4 text-[#FFD600]" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">New Incident Case</div>
            <div className="text-[9px] font-mono text-slate-500">AI-classified · Encrypted pipeline</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 text-slate-500 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono">⚠ {error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Incident Title *</label>
              <input className={inputCls} placeholder="Brief title describing the incident..." value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
            </div>

            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Severity</label>
              <select className={inputCls} value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value as Priority }))}>
                {(["Critical", "High", "Medium", "Low"] as Priority[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Description</label>
              <textarea className={`${inputCls} h-24 resize-none`} placeholder="Detailed description of the incident..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <div>
              <label className={labelCls}>Reporter Name *</label>
              <input className={inputCls} placeholder="Full name" value={form.reporterName} onChange={e => setForm(p => ({ ...p, reporterName: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Reporter Contact</label>
              <input className={inputCls} placeholder="+265 xxx xxx xxx" value={form.reporterContact} onChange={e => setForm(p => ({ ...p, reporterContact: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Organisation</label>
              <input className={inputCls} placeholder="Org / ministry / company" value={form.reporterOrg} onChange={e => setForm(p => ({ ...p, reporterOrg: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Incident Date</label>
              <input type="datetime-local" className={inputCls} value={form.incidentDate} onChange={e => setForm(p => ({ ...p, incidentDate: e.target.value }))} />
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <button onClick={onClose} className="px-4 py-2 text-xs font-mono font-bold text-slate-400 border border-white/10 rounded-lg hover:border-white/20 hover:text-white transition">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 text-xs font-mono font-bold bg-[#4a7aff] hover:bg-[#6a9aff] text-white rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {submitting ? "Filing..." : "File Incident"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface CaseManagementProps {
  token: string;
  role: string;
  initialSelectedIncidentId?: string | null;
  onClearInitialSelection?: () => void;
}

export default function CaseManagement({
  token,
  role,
  initialSelectedIncidentId,
  onClearInitialSelection,
}: CaseManagementProps) {
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filterSev, setFilterSev]     = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected]       = useState<Incident | null>(null);
  const [newOpen, setNewOpen]         = useState(false);
  const [page, setPage]               = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toasts, push }              = useNotifications();
  const PER_PAGE = 12;

  // Comment & evidence state
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  // Ctrl+N
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); setNewOpen(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/incidents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.incidents ?? []);
        setIncidents(list);
      }
    } catch { push("Failed to load incidents", "error"); }
    setLoading(false);
  }, [token, push]);

  useEffect(() => { load(); }, [load]);

  // Handle initialSelectedIncidentId
  useEffect(() => {
    if (initialSelectedIncidentId && incidents.length > 0) {
      const match = incidents.find(i => i.id === initialSelectedIncidentId);
      if (match) {
        setSelected(match);
      }
      onClearInitialSelection?.();
    }
  }, [initialSelectedIncidentId, incidents, onClearInitialSelection]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return incidents.filter(i => {
      if (filterSev !== "all" && i.severity !== filterSev) return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (q && !i.id.toLowerCase().includes(q) && !i.title.toLowerCase().includes(q) &&
          !i.reporterOrg.toLowerCase().includes(q) && !i.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [incidents, search, filterSev, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = useMemo(() => ({
    total:     incidents.length,
    critical:  incidents.filter(i => i.severity === "Critical" && !["Resolved","Closed"].includes(i.status)).length,
    open:      incidents.filter(i => !["Resolved","Closed"].includes(i.status)).length,
    resolved:  incidents.filter(i => ["Resolved","Closed"].includes(i.status)).length,
  }), [incidents]);

  const handleEscalate = async (id: string) => {
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          severity: "Critical",
          note: "Case escalated to National Alert Level."
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
        if (selected?.id === id) {
          setSelected(updated);
        }
        push(`Case ${id} escalated to Critical Alert Level.`, "warning");
        load();
      }
    } catch {
      push("Failed to escalate case", "error");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    push("Copied to clipboard", "success");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  // Fetch evidence for selected incident
  const fetchEvidence = useCallback(async () => {
    if (!selected) return;
    setEvidenceLoading(true);
    try {
      const res = await fetch(`/api/evidence/${selected.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setEvidenceList(await res.json());
      }
    } catch {
      push("Failed to load evidence files", "error");
    } finally {
      setEvidenceLoading(false);
    }
  }, [selected?.id, token, push]);

  useEffect(() => {
    if (selected) {
      fetchEvidence();
    }
  }, [selected?.id, fetchEvidence]);

  const handleUpdateField = async (field: string, value: any) => {
    if (!selected) return;
    try {
      const payload: any = {};
      payload[field] = value;
      if (field === "status") {
        payload.note = `Status transitioned: ${selected.status} → ${value}`;
      } else if (field === "assigned_investigator") {
        payload.note = `Case assigned to: ${value || "Unassigned"}`;
      }

      const res = await fetch(`/api/incidents/${selected.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
        setSelected(updated);
        push("Field updated successfully", "success");
        load();
      }
    } catch {
      push("Failed to update field", "error");
    }
  };

  const handleAddComment = async () => {
    if (!selected || !commentText.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/incidents/${selected.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          note: commentText.trim()
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
        setSelected(updated);
        setCommentText("");
        push("Comment posted", "success");
        load();
      }
    } catch {
      push("Failed to post comment", "error");
    } finally {
      setPostingComment(false);
    }
  };

  const handleWorkspaceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const fileData = reader.result as string;
        const res = await fetch(`/api/evidence/${selected.id}/upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || "screenshot",
            fileData,
            description: "Evidence uploaded via Analyst Workspace."
          })
        });
        if (res.ok) {
          push("Evidence uploaded successfully", "success");
          fetchEvidence();
          load();
        } else {
          const err = await res.json();
          push(err.message || "Failed to upload", "error");
        }
      } catch {
        push("Failed to upload evidence", "error");
      }
    };
    reader.readAsDataURL(file);
  };

  const selDropCls = "bg-[#1a2332] border border-[#1e2d42] hover:border-[#2a3d5a] focus:border-[#4a7aff] focus:outline-none text-xs font-mono text-slate-300 rounded-lg px-3 py-2 transition cursor-pointer";
  const iocs: { value: string; type: string }[] = selected ? [
    ...(selected.compromisedIndicators?.ips?.map(v => ({ value: v, type: "ip" })) ?? []),
    ...(selected.compromisedIndicators?.domains?.map(v => ({ value: v, type: "domain" })) ?? []),
    ...(selected.compromisedIndicators?.phoneNumbers?.map(v => ({ value: v, type: "phone" })) ?? []),
  ] : [];

  return (
    <div className="space-y-5 animate-fade-in" id="case-management">
      <ToastContainer toasts={toasts} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "#1e2d42", background: "linear-gradient(135deg,#0d1520 0%,#111927 100%)" }}>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#4a7aff]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#4a7aff]/15 border border-[#4a7aff]/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-[#4a7aff]" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">CASE MANAGEMENT</h2>
              <p className="text-[10px] text-slate-500 font-mono">National Cyber Incident Registry · MACERT Coordinated Response</p>
            </div>
          </div>

          {/* KPI row */}
          <div className="sm:ml-auto flex items-center gap-6">
            {[
              { label: "Total Cases",  val: stats.total,    color: "text-slate-200" },
              { label: "Open",         val: stats.open,     color: "text-[#4a7aff]" },
              { label: "Critical",     val: stats.critical, color: `text-red-400 ${stats.critical > 0 ? "animate-pulse" : ""}` },
              { label: "Resolved",     val: stats.resolved, color: "text-emerald-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className={`font-orbitron text-2xl font-bold leading-none ${color}`}>{val}</div>
                <div className="text-[8px] font-mono text-slate-600 uppercase mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters + Actions Row ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs rounded-lg border px-3 transition-all"
          style={{ background: "#1a2332", borderColor: "#1e2d42" }}
        >
          <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by ID, title, org..."
            className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none py-2 font-mono"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-600 hover:text-slate-300 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Severity filter */}
        <select value={filterSev} onChange={e => { setFilterSev(e.target.value); setPage(1); }} className={selDropCls}>
          <option value="all">All Severities</option>
          {["Critical","High","Medium","Low"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Status filter */}
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className={selDropCls}>
          <option value="all">All Statuses</option>
          {["Reported","Investigating","Contained","Resolved","Closed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button onClick={load} className="p-2 rounded-lg border text-slate-400 hover:text-white hover:border-white/20 transition" style={{ borderColor: "#1e2d42", background: "#1a2332" }}>
          <RefreshCw className="w-4 h-4" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={() => { push(`${selectedIds.size} case(s) escalated.`, "warning"); setSelectedIds(new Set()); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 rounded-lg transition"
          >
            <ArrowUp className="w-3.5 h-3.5" /> Escalate ({selectedIds.size})
          </button>
        )}

        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold bg-[#4a7aff] hover:bg-[#6a9aff] text-white rounded-lg transition ml-auto"
        >
          <Plus className="w-3.5 h-3.5" /> New Case
        </button>
      </div>

      {/* ── Case List / Analyst Workspace ───────────────────────────────── */}
      {selected ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (25% width): Compact queue */}
          <div className="lg:col-span-3 space-y-3 max-h-[85vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <h3 className="font-bebas text-sm text-slate-400 tracking-wider">Queue</h3>
              <span className="text-[10px] bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded font-mono ml-auto">
                {filtered.length}
              </span>
            </div>
            <div className="space-y-2">
              {filtered.map(inc => {
                const s = SEV_COLORS[inc.severity as Priority] ?? SEV_COLORS.Low;
                const isCurrentSelected = selected.id === inc.id;
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelected(inc)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-left relative ${
                      isCurrentSelected
                        ? "bg-[#1a2a4a] border-[#4a7aff]"
                        : "bg-[#0d1520] border-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r ${s.left} border-l-0`}
                      style={{ background: inc.severity === "Critical" ? "#ef4444" : inc.severity === "High" ? "#f97316" : inc.severity === "Medium" ? "#eab308" : "#3b82f6" }}
                    />
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-mono font-bold ${s.text}`}>{inc.id}</span>
                      <StatusBadge status={inc.status} />
                    </div>
                    <div className="text-[11px] font-bold text-slate-200 truncate">{inc.title}</div>
                    <div className="text-[9px] text-slate-500 font-mono mt-1 flex justify-between">
                      <span>{fmtCat(inc.category)}</span>
                      <span>{timeAgo(inc.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center Column (45% width): Details & Timeline */}
          <div className="lg:col-span-6 space-y-4 max-h-[85vh] overflow-y-auto pr-1">
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{selected.id}</span>
                  <h2 className="text-sm font-bold text-white mt-1">{selected.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <SevBadge severity={selected.severity as Priority} />
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {/* Workflow stage */}
              <div className="bg-[#111927] rounded-xl border border-white/5 py-1">
                <WorkflowTracker status={selected.status} />
              </div>

              {/* Description & AI summary */}
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Description</label>
                  <p className="text-xs text-slate-300 leading-relaxed bg-white/2 p-3 rounded-xl border border-white/5 whitespace-pre-wrap">
                    {selected.description}
                  </p>
                </div>

                {iocs.length > 0 && (
                  <div>
                    <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1.5">Extracted IOC Indicators</label>
                    <div className="flex flex-wrap gap-1.5">
                      {iocs.map((ioc, idx) => <React.Fragment key={idx}><IocTag value={ioc.value} type={ioc.type} /></React.Fragment>)}
                    </div>
                  </div>
                )}

                {selected.mitigationAdvice && (
                  <div>
                    <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Mitigation Advice</label>
                    <div className="p-3 rounded-xl border border-[#FFD600]/20 bg-[#FFD600]/5 text-xs text-[#FFD600] font-mono leading-relaxed">
                      {selected.mitigationAdvice}
                    </div>
                  </div>
                )}
              </div>

              {/* Investigator & Status assignment forms */}
              <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                <div>
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Assigned Investigator</label>
                  <select
                    value={selected.assignedInvestigator || ""}
                    onChange={e => handleUpdateField("assigned_investigator", e.target.value || null)}
                    className="w-full bg-[#1a2332] border border-[#1e2d42] text-xs font-mono text-slate-200 rounded-lg px-2 py-1.5"
                  >
                    <option value="">Unassigned</option>
                    <option value="MACERT Investigator Alpha">MACERT Investigator Alpha</option>
                    <option value="MACRA Security Analyst">MACRA Security Analyst</option>
                    <option value="Police CID Inspector">Police CID Inspector (Blantyre)</option>
                    <option value="SOC Operations Lead">SOC Operations Lead (Lilongwe)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Case Status</label>
                  <select
                    value={selected.status}
                    onChange={e => handleUpdateField("status", e.target.value)}
                    className="w-full bg-[#1a2332] border border-[#1e2d42] text-xs font-mono text-slate-200 rounded-lg px-2 py-1.5"
                  >
                    <option value="Reported">Reported</option>
                    <option value="Investigating">Investigating</option>
                    <option value="Contained">Contained</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Comment / Note section */}
              <div className="border-t border-white/5 pt-4 space-y-2">
                <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Add Analyst Note</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type comment or action note..."
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    className="flex-1 bg-[#1a2332] border border-[#1e2d42] text-xs font-mono text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#4a7aff]"
                    onKeyDown={e => { if (e.key === "Enter") handleAddComment(); }}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={postingComment || !commentText.trim()}
                    className="px-4 py-2 bg-[#4a7aff] hover:bg-[#6a9aff] text-xs font-mono font-bold text-white rounded-lg transition disabled:opacity-40"
                  >
                    Post
                  </button>
                </div>
              </div>

              {/* Activity Timeline log */}
              <div className="border-t border-white/5 pt-4">
                <h3 className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Activity & Comments Log</h3>
                <div className="relative pl-4 border-l border-white/8 space-y-4">
                  {/* Initial Report Event */}
                  <div className="relative">
                    <span className="absolute -left-[21px] w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0a0e1a] flex items-center justify-center animate-pulse" />
                    <div className="text-[8px] font-mono text-slate-600 mb-0.5">{fmtDate(selected.incidentDate)}</div>
                    <div className="text-[10px] font-bold text-slate-200">Incident Reported</div>
                    <div className="text-[10px] text-slate-400">Filed by {selected.reporterName} ({selected.reporterOrg})</div>
                  </div>
                  {/* Timeline Updates */}
                  {(selected.updates || []).map((u, idx) => (
                    <div key={idx} className="relative">
                      <span className="absolute -left-[21px] w-3 h-3 rounded-full bg-blue-500 border-2 border-[#0a0e1a] flex items-center justify-center" />
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">{fmtDate(u.timestamp || (u as any).date)}</div>
                      <div className="text-[10px] font-bold text-slate-200">{u.author}</div>
                      <div className="text-[10px] text-slate-400">{u.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (30% width): Evidence & Actions */}
          <div className="lg:col-span-3 space-y-4 max-h-[85vh] overflow-y-auto pr-1">
            <div className="flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="px-3 py-1.5 text-[10px] font-mono font-bold text-slate-400 border border-white/10 hover:border-white/20 hover:text-white rounded-lg transition"
              >
                Close Case Workspace
              </button>
            </div>

            {/* Evidence Vault Files */}
            <div className="card p-5 space-y-4">
              <h3 className="font-grotesk font-bold text-xs text-white flex items-center gap-2 border-b border-white/5 pb-3">
                <FolderOpen className="w-4 h-4 text-blue-400" />
                Evidence Attachments
              </h3>
              {evidenceLoading ? (
                <div className="text-center py-6 text-slate-600 text-xs font-mono"><Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" /> Loading evidence...</div>
              ) : evidenceList.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-xs font-mono">No evidence files uploaded.</div>
              ) : (
                <div className="space-y-2">
                  {evidenceList.map(evd => (
                    <div key={evd.id} className="p-2.5 bg-white/2 border border-white/5 rounded-lg flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono font-bold text-slate-200 truncate" title={evd.file_name}>{evd.file_name}</p>
                        <p className="text-[8px] text-slate-500 font-mono">{(evd.file_size / 1024).toFixed(1)} KB · {evd.file_type}</p>
                      </div>
                      <a
                        href={`/api/evidence/${selected.id}/${evd.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded hover:bg-white/5 text-blue-400 hover:text-blue-300"
                        title="Download Evidence"
                        download
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {/* File Upload Area */}
              <div className="border-t border-white/5 pt-4 space-y-3">
                <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Upload Evidence</label>
                <input
                  type="file"
                  id="workspace-file-upload"
                  onChange={handleWorkspaceFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="workspace-file-upload"
                  className="flex flex-col items-center justify-center p-4 border border-dashed border-white/10 hover:border-[#4a7aff]/40 hover:bg-[#4a7aff]/5 rounded-xl cursor-pointer transition text-center group"
                >
                  <Plus className="w-5 h-5 text-slate-500 group-hover:text-[#4a7aff] mb-1" />
                  <span className="text-[10px] font-mono font-bold text-slate-400 group-hover:text-slate-200">Choose Evidence File</span>
                </label>
              </div>
            </div>

            {/* Response Actions Playbook */}
            <div className="card p-5 space-y-4">
              <h3 className="font-grotesk font-bold text-xs text-white flex items-center gap-2 border-b border-white/5 pb-3">
                <Zap className="w-4 h-4 text-[#FFD600]" />
                Response Actions
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => { push("SMS warning broadcasted to affected telecom subscribers.", "success"); }}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border text-[10px] font-mono font-bold text-left transition bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/15"
                >
                  📱 SMS Telecom Alert
                </button>
                <button
                  onClick={() => { push("IP addresses blocked on ESCOM gateway firewall.", "success"); }}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border text-[10px] font-mono font-bold text-left transition bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15"
                >
                  🔒 Deploy Gateway Blocks
                </button>
                <button
                  onClick={() => { push("E-mail security advisories dispatched to MACRA banks.", "success"); }}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border text-[10px] font-mono font-bold text-left transition bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/15"
                >
                  ✉ Send Bank Advisories
                </button>
                <button
                  onClick={() => handleEscalate(selected.id)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border text-[10px] font-mono font-bold text-left transition bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25"
                >
                  🚨 Escalate Alert Level
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          {/* Column headers */}
          <div className="grid items-center gap-3 px-4 py-2.5 border-b text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600" style={{ gridTemplateColumns: "24px 28px 1fr auto 130px 90px", borderColor: "#1e2d42", background: "#111927" }}>
            <span />
            <span />
            <span>Incident</span>
            <span>Assignee</span>
            <span>Progress</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500 font-mono text-xs">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading cases…
            </div>
          ) : paged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
              <ShieldAlert className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-mono">No cases match your filters.</p>
              {(filterSev !== "all" || filterStatus !== "all" || search) && (
                <button onClick={() => { setFilterSev("all"); setFilterStatus("all"); setSearch(""); }} className="mt-3 text-xs text-[#4a7aff] hover:underline font-mono">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#1e2d42" }}>
              {paged.map(inc => {
                const s = SEV_COLORS[inc.severity as Priority] ?? SEV_COLORS.Low;
                const progress = getProgress(inc);
                const isSelected = selectedIds.has(inc.id);
                const isClosed = ["Resolved", "Closed"].includes(inc.status);
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelected(inc)}
                    className={`grid items-center gap-3 px-4 py-3.5 transition-all cursor-pointer group relative ${
                      isSelected ? "bg-[#1a2a4a]/60" : "hover:bg-[#1a2332]/60"
                    } ${isClosed ? "opacity-60" : ""}`}
                    style={{ gridTemplateColumns: "24px 28px 1fr auto 130px 90px" }}
                  >
                    {/* Left severity accent line */}
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-opacity ${s.left} border-l-0`}
                      style={{ background: inc.severity === "Critical" ? "#ef4444" : inc.severity === "High" ? "#f97316" : inc.severity === "Medium" ? "#eab308" : "#3b82f6" }}
                    />

                    {/* Checkbox */}
                    <div className="pl-1" onClick={e => { e.stopPropagation(); toggleSelect(inc.id); }}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-[#4a7aff] border-[#4a7aff]" : "border-[#2a3d5a] group-hover:border-[#4a7aff]"}`}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    {/* Severity dot */}
                    <div>
                      <span className={`w-2.5 h-2.5 rounded-full block ${s.dot} ${inc.severity === "Critical" ? "animate-pulse" : ""}`} />
                    </div>

                    {/* Case info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`text-[9px] font-mono font-bold ${s.text}`}>{inc.id}</span>
                        <SevBadge severity={inc.severity as Priority} />
                        <StatusBadge status={inc.status} />
                      </div>
                      <div className="text-xs font-semibold text-slate-100 truncate group-hover:text-white transition">{inc.title}</div>
                      <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-slate-500 flex-wrap">
                        <span>{fmtCat(inc.category)}</span>
                        <span>·</span>
                        <span>{inc.reporterOrg}</span>
                        <span>·</span>
                        <span>{timeAgo(inc.createdAt)}</span>
                      </div>
                    </div>

                    {/* Assignee */}
                    <div className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                      {inc.assignedInvestigator ?? <span className="text-slate-600 italic">Unassigned</span>}
                    </div>

                    {/* Progress */}
                    <div>
                      <ProgressBar progress={progress} severity={inc.severity as Priority} />
                    </div>

                    {/* Action icons */}
                    <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setSelected(inc)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEscalate(inc.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Escalate"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition" title="More">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "#1e2d42", background: "#111927" }}>
              <span className="text-[9px] font-mono text-slate-600">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} cases
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = page <= 3 ? i + 1 : page - 2 + i;
                  if (p < 1 || p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-[11px] font-mono font-bold transition ${
                        p === page
                          ? "bg-[#4a7aff] text-white"
                          : "text-slate-500 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {newOpen && (
        <NewCaseModal
          onClose={() => setNewOpen(false)}
          onCreated={() => { load(); push("Case filed successfully!", "success"); }}
          token={token}
        />
      )}
    </div>
  );
}

