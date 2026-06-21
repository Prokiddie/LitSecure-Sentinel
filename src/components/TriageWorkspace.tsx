/**
 * LitSecure Sentinel — Triage & Investigation Workspace
 *
 * Replaces the public incident-submission form for authenticated
 * admin / analyst / investigator users.
 *
 * Three integrated panels:
 *  1. Live Intake Queue  — sortable, filterable list of submitted incidents
 *  2. IOC Extraction     — auto-extracted indicators ready for enrichment/blocking
 *  3. AI Triage Panel    — MITRE-mapped containment guidance for the selected case
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle, Shield, Phone, Globe, Server, DollarSign,
  Users, Clock, Search, RefreshCw, ChevronRight, CheckCircle2,
  Loader2, X, Crosshair, Zap, Brain, ExternalLink, Copy,
  Lock, Unlock, Flag, Eye, UserCheck, FileSearch, Siren,
  TrendingUp, Activity, Tag
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ExtractedIOC {
  type: "phone" | "ip" | "domain" | "financial" | "victim";
  value: string;
  label: string;
  confidence: "high" | "medium" | "low";
  action: "block" | "enrich" | "monitor" | "alert";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV: Record<string, { text: string; bg: string; border: string; dot: string; glow: string }> = {
  Critical: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    dot: "bg-red-500",    glow: "shadow-[0_0_12px_rgba(239,68,68,0.2)]" },
  High:     { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-500", glow: "shadow-[0_0_10px_rgba(249,115,22,0.15)]" },
  Medium:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-500", glow: "" },
  Low:      { text: "text-slate-400",  bg: "bg-white/5",       border: "border-white/10",      dot: "bg-slate-500",  glow: "" },
};

const STATUS_FLOW: Record<string, string> = {
  Reported:      "New",
  Investigating: "In Progress",
  Contained:     "Contained",
  Resolved:      "Resolved",
  Closed:        "Closed",
};

const ACTION_COLORS: Record<string, string> = {
  block:   "text-red-400 border-red-500/30 bg-red-500/8 hover:bg-red-500/15",
  enrich:  "text-blue-400 border-blue-500/30 bg-blue-500/8 hover:bg-blue-500/15",
  monitor: "text-yellow-400 border-yellow-500/30 bg-yellow-500/8 hover:bg-yellow-500/15",
  alert:   "text-purple-400 border-purple-500/30 bg-purple-500/8 hover:bg-purple-500/15",
};

const IOC_ICONS: Record<string, React.ElementType> = {
  phone:     Phone,
  ip:        Server,
  domain:    Globe,
  financial: DollarSign,
  victim:    Users,
};

// ─── MITRE ATT&CK Triage Map ─────────────────────────────────────────────────

function generateTriageGuidance(incident: Incident): {
  level: string; levelColor: string;
  mitre: string[]; containment: string[];
  escalation: string; similarCases: string[];
} {
  const cat = incident.category?.toLowerCase() ?? "";
  const sev = incident.severity;

  const level =
    sev === "Critical" ? "L1 — NATIONAL CRITICAL" :
    sev === "High"     ? "L2 — ACTIVE INTRUSION"  :
    sev === "Medium"   ? "L3 — SUSPICIOUS ACTIVITY" :
                         "L4 — INFORMATIONAL";

  const levelColor =
    sev === "Critical" ? "text-red-400" :
    sev === "High"     ? "text-orange-400" :
    sev === "Medium"   ? "text-yellow-400" : "text-slate-400";

  const guidance: Record<string, string[]> = {
    sim_swap:        ["Contact telecom (TNM/Airtel) to freeze SIM within 15 min", "Geolocate suspect phone numbers via MACRA MSISDN trace", "Flag associated NBS/Standard Bank mobile accounts for review", "Issue alert to affected subscriber via SMS broadcast"],
    phishing:        ["Add flagged domains to MACRA national DNS blocklist immediately", "Notify targeted organisation's IT admin and CISO", "Collect email headers and forwarding to MACERT sandbox", "Alert Google/Cloudflare for domain takedown via PhishTank"],
    ransomware:      ["Isolate affected host from LAN: disable network adaptor", "DO NOT pay ransom — preserve encrypted file samples for forensics", "Submit file hashes to MACERT threat intel feed", "Deploy backup restore procedure from last clean snapshot"],
    fraud:           ["Freeze suspect mobile wallet accounts via regulator order", "Cross-reference NIN with MRA identity database", "File FIR with Malawi Police Cybercrime Unit immediately", "Trace MPAMBA transaction IDs to source agent"],
    data_breach:     ["Revoke all active sessions for exposed credentials", "Force password reset for affected accounts", "Notify ODPC (Office of Data Protection Commissioner)", "Enable audit logging on affected server immediately"],
    ddos:            ["Activate cloud scrubbing (Cloudflare/Akamai) for the target IP", "Null-route high-volume source ASNs with upstream ISP", "Document source IP ranges for blacklist submission to MACERT", "Escalate to MACRA for national firewall rule deployment"],
    malware:         ["Kill running malicious process and isolate endpoint", "Submit binary to VirusTotal and MACERT sandbox", "Scan adjacent hosts on same subnet for lateral spread", "Patch exploited CVE via WSUS or manual update immediately"],
    social_engineering: ["Warn targeted personnel — do not engage further with threat actor", "Secure exposed personal identifiers (NIN, account numbers)", "File report with Anti-Corruption Bureau if government official targeted", "Issue organisation-wide phishing awareness alert"],
  };

  const containment = guidance[cat] ?? [
    "Isolate affected systems from the network",
    "Preserve all evidence: logs, screenshots, file hashes",
    "Notify MACERT via secure incident hotline: +265 (0) 999 XXX XXX",
    "Escalate to relevant government authority if critical infrastructure affected",
  ];

  const mitre: Record<string, string[]> = {
    sim_swap:        ["T1078 – Valid Accounts", "T1556 – Modify Auth Process", "T1531 – Account Access Removal"],
    phishing:        ["T1566 – Phishing", "T1598 – Spearphishing for Info", "T1204 – User Execution"],
    ransomware:      ["T1486 – Data Encrypted for Impact", "T1490 – Inhibit Recovery", "T1489 – Service Stop"],
    fraud:           ["T1078 – Valid Accounts", "T1531 – Account Access Removal", "T1565 – Data Manipulation"],
    data_breach:     ["T1530 – Data from Cloud Storage", "T1213 – Data from Info Repos", "T1048 – Exfiltration Over Protocol"],
    ddos:            ["T1498 – Network Denial of Service", "T1499 – Endpoint DoS", "T1583 – Acquire Infrastructure"],
    malware:         ["T1059 – Command & Script Interpreter", "T1055 – Process Injection", "T1071 – App Layer Protocol"],
    social_engineering: ["T1593 – Search Open Websites", "T1598 – Spearphishing for Info", "T1566 – Phishing"],
  };

  const escalation =
    sev === "Critical" ? "ESCALATE IMMEDIATELY → MACRA Director + MACERT + MDF Cyber Cell" :
    sev === "High"     ? "Escalate to L1 — Banking/Government if financial or national assets involved" :
                         "Monitor closely — reassess severity after IOC enrichment";

  return {
    level, levelColor,
    mitre: mitre[cat] ?? ["T1190 – Exploit Public-Facing Application", "T1078 – Valid Accounts"],
    containment,
    escalation,
    similarCases: ["LIT-2026-30421", "LIT-2026-59719", "LIT-2026-10492"].filter((_, i) => i < 2),
  };
}

// ─── IOC Extraction ──────────────────────────────────────────────────────────

function extractIOCs(incident: Incident): ExtractedIOC[] {
  const iocs: ExtractedIOC[] = [];
  const ci = incident.compromisedIndicators ?? {};

  // Structured IOCs from compromised indicators
  (ci.phoneNumbers ?? []).forEach(p => iocs.push({ type: "phone", value: p, label: "Suspect Phone Number", confidence: "high", action: "enrich" }));
  (ci.ips ?? []).forEach(ip => iocs.push({ type: "ip", value: ip, label: "Malicious IP Address", confidence: "high", action: "block" }));
  (ci.domains ?? []).forEach(d => iocs.push({ type: "domain", value: d, label: "Phishing / C2 Domain", confidence: "high", action: "block" }));

  // Parse from description text (regex-based)
  const desc = incident.description ?? "";
  const phoneRx = /(\+265\s?[\d\s]{9,}|265[\d\s]{9,}|0[78]\d{8})/g;
  const ipRx    = /\b(\d{1,3}\.){3}\d{1,3}\b/g;
  const domainRx = /\b([a-z0-9-]+\.(online|com|mw|net|org|xyz|site|click|info))\b/gi;
  const lossRx  = /(MWK|ZAR|USD)\s?[\d,]+|[\d,]+\s?(million|billion|kwacha)/gi;
  const userRx  = /(\d[\d,]+)\s+(users|accounts|customers|subscribers|employees|people)/gi;

  const existing = new Set(iocs.map(i => i.value));
  [...desc.matchAll(phoneRx)].forEach(m => { if (!existing.has(m[0].trim())) { existing.add(m[0].trim()); iocs.push({ type: "phone", value: m[0].trim(), label: "Extracted Phone", confidence: "medium", action: "enrich" }); } });
  [...desc.matchAll(ipRx)].forEach(m => { if (!existing.has(m[0])) { existing.add(m[0]); iocs.push({ type: "ip", value: m[0], label: "Extracted IP", confidence: "medium", action: "block" }); } });
  [...desc.matchAll(domainRx)].forEach(m => { if (!existing.has(m[0])) { existing.add(m[0]); iocs.push({ type: "domain", value: m[0], label: "Suspicious Domain", confidence: "medium", action: "block" }); } });
  [...desc.matchAll(lossRx)].forEach(m => { if (!existing.has(m[0])) { existing.add(m[0]); iocs.push({ type: "financial", value: m[0], label: "Estimated Financial Loss", confidence: "medium", action: "monitor" }); } });
  [...desc.matchAll(userRx)].forEach(m => { if (!existing.has(m[0])) { existing.add(m[0]); iocs.push({ type: "victim", value: m[0], label: "Affected Population", confidence: "medium", action: "alert" }); } });

  // Fallback — surface reporter contact as a threat actor phone if sim_swap/fraud
  if (iocs.length === 0 && ["sim_swap", "fraud"].includes(incident.category)) {
    if (incident.reporterContact) {
      iocs.push({ type: "phone", value: incident.reporterContact, label: "Reporter Contact (Verify)", confidence: "low", action: "enrich" });
    }
  }

  return iocs;
}

// ─── Time Helpers ────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtCat(c: string) {
  return c?.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase()) ?? "Unknown";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SevBadge({ severity }: { severity: string }) {
  const m = SEV[severity] ?? SEV.Low;
  return (
    <span className={`inline-flex items-center gap-1 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border ${m.text} ${m.bg} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = STATUS_FLOW[status] ?? status;
  const cls =
    status === "Reported"      ? "text-slate-400 bg-slate-500/10 border-slate-500/20" :
    status === "Investigating" ? "text-blue-400 bg-blue-500/10 border-blue-500/20 animate-pulse" :
    status === "Contained"     ? "text-orange-400 bg-orange-500/10 border-orange-500/20" :
    status === "Resolved"      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                                 "text-slate-500 bg-white/5 border-white/10";
  return (
    <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Panel: Live Intake Queue ─────────────────────────────────────────────────

function IntakeQueue({
  incidents, loading, selected, onSelect, onRefresh, search, setSearch
}: {
  incidents: Incident[];
  loading: boolean;
  selected: Incident | null;
  onSelect: (inc: Incident) => void;
  onRefresh: () => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <div className="w-1.5 h-5 bg-orange-500 rounded-full" />
        <div>
          <div className="font-grotesk font-bold text-sm text-white">Live Intake Queue</div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Unprocessed incident reports</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter queue..."
              className="w-36 bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#FFD600]/40 font-mono"
            />
          </div>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg border border-white/10 text-slate-500 hover:text-white hover:border-white/20 transition"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Queue list */}
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-8 text-slate-500 font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading intake queue…
        </div>
      ) : incidents.length === 0 ? (
        <div className="py-10 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/40" />
          <p className="text-slate-600 text-xs font-mono">Queue clear — no unprocessed reports</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5 max-h-[380px] overflow-y-auto scrollbar-thin">
          {incidents.map(inc => {
            const sev = SEV[inc.severity] ?? SEV.Low;
            const isSelected = selected?.id === inc.id;
            return (
              <button
                key={inc.id}
                onClick={() => onSelect(inc)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all relative group ${
                  isSelected
                    ? "bg-[#FFD600]/5 border-l-2 border-l-[#FFD600]"
                    : "hover:bg-white/2 border-l-2 border-l-transparent hover:border-l-white/10"
                }`}
              >
                {/* Severity stripe dot */}
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${sev.dot} ${inc.severity === "Critical" ? "animate-pulse" : ""}`} />

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-slate-100 leading-tight flex-1 truncate">{inc.title}</span>
                    <SevBadge severity={inc.severity} />
                  </div>
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-mono text-slate-600">{inc.id}</span>
                    <span className="text-[9px] font-mono text-slate-500">·</span>
                    <span className="text-[9px] font-mono text-slate-500">{inc.reporterName} / {inc.reporterOrg}</span>
                    <span className="text-[9px] font-mono text-slate-500">·</span>
                    <span className="text-[9px] font-mono text-slate-600">{timeAgo(inc.createdAt)}</span>
                    <StatusPill status={inc.status} />
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 transition-colors ${isSelected ? "text-[#FFD600]" : "text-slate-700 group-hover:text-slate-500"}`} />
              </button>
            );
          })}
        </div>
      )}

      {/* Footer stats */}
      {!loading && incidents.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/5 bg-white/1">
          {(["Critical","High","Medium","Low"] as const).map(s => {
            const count = incidents.filter(i => i.severity === s).length;
            if (!count) return null;
            const m = SEV[s];
            return (
              <div key={s} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                <span className={`text-[9px] font-mono font-bold ${m.text}`}>{count} {s}</span>
              </div>
            );
          })}
          <span className="ml-auto text-[9px] font-mono text-slate-600">{incidents.length} total in queue</span>
        </div>
      )}
    </div>
  );
}

// ─── Panel: IOC Extraction ───────────────────────────────────────────────────

function IOCPanel({ incident }: { incident: Incident }) {
  const iocs = useMemo(() => extractIOCs(incident), [incident]);
  const [actioned, setActioned] = useState<Set<string>>(new Set());

  const doAction = (val: string) => setActioned(prev => new Set([...prev, val]));

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
        <div>
          <div className="font-grotesk font-bold text-sm text-white">Automated IOC Extraction</div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
            From: {incident.id} · {fmtCat(incident.category)}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[8px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase">
            {iocs.length} Indicators
          </span>
        </div>
      </div>

      {iocs.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <FileSearch className="w-6 h-6 mx-auto mb-2 text-slate-700" />
          <p className="text-slate-600 text-[10px] font-mono">No structured indicators extracted from this report.<br />Add IOCs via the Edit modal or re-describe the incident in detail.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/4">
          {iocs.map((ioc, i) => {
            const Icon = IOC_ICONS[ioc.type] ?? Tag;
            const done = actioned.has(ioc.value);
            const actionCls = ACTION_COLORS[ioc.action] ?? ACTION_COLORS.enrich;
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 transition-all ${done ? "opacity-40" : "hover:bg-white/2"}`}>
                {/* Type icon */}
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  ioc.type === "phone"     ? "bg-red-500/10 text-red-400" :
                  ioc.type === "ip"        ? "bg-orange-500/10 text-orange-400" :
                  ioc.type === "domain"    ? "bg-yellow-500/10 text-yellow-400" :
                  ioc.type === "financial" ? "bg-emerald-500/10 text-emerald-400" :
                                             "bg-purple-500/10 text-purple-400"
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {/* Label + value */}
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">{ioc.label}</div>
                  <div className="text-[11px] font-mono text-slate-200 truncate font-semibold">{ioc.value}</div>
                </div>

                {/* Confidence */}
                <span className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded uppercase ${
                  ioc.confidence === "high" ? "text-emerald-400 bg-emerald-500/10" :
                  ioc.confidence === "medium" ? "text-yellow-400 bg-yellow-500/10" :
                  "text-slate-500 bg-white/5"
                }`}>{ioc.confidence}</span>

                {/* Action button */}
                {done ? (
                  <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Done
                  </span>
                ) : (
                  <button
                    onClick={() => doAction(ioc.value)}
                    className={`text-[8px] font-mono font-bold px-2 py-1 rounded border capitalize transition ${actionCls}`}
                  >
                    {ioc.action === "block"   && <Lock className="w-2.5 h-2.5 inline mr-1" />}
                    {ioc.action === "enrich"  && <Zap className="w-2.5 h-2.5 inline mr-1" />}
                    {ioc.action === "monitor" && <Eye className="w-2.5 h-2.5 inline mr-1" />}
                    {ioc.action === "alert"   && <Flag className="w-2.5 h-2.5 inline mr-1" />}
                    {ioc.action}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Data not available notice */}
      <div className="px-4 py-2.5 border-t border-white/5 bg-white/1">
        <p className="text-[9px] font-mono text-slate-600">
          ⚠ Indicators parsed from structured fields + description text. Edit incident to add missing IOCs.
          Financial loss and victim count require manual verification.
        </p>
      </div>
    </div>
  );
}

// ─── Panel: AI Triage Guidance ────────────────────────────────────────────────

function AITriagePanel({ incident }: { incident: Incident }) {
  const triage = useMemo(() => generateTriageGuidance(incident), [incident]);
  const sev = SEV[incident.severity] ?? SEV.Low;
  const [copied, setCopied] = useState(false);

  const copyGuidance = () => {
    const text = [
      `CASE: ${incident.id} — ${incident.title}`,
      `THREAT LEVEL: ${triage.level}`,
      ``,
      `MITRE ATT&CK:`,
      ...triage.mitre.map(m => `  · ${m}`),
      ``,
      `CONTAINMENT STEPS:`,
      ...triage.containment.map((c, i) => `  ${i + 1}. ${c}`),
      ``,
      `ESCALATION: ${triage.escalation}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card overflow-hidden border-purple-500/15">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-purple-500/15 bg-purple-500/3">
        <div className="w-1.5 h-5 bg-purple-500 rounded-full" />
        <div>
          <div className="font-grotesk font-bold text-sm text-white flex items-center gap-2">
            AI Triage Recommendations
            <span className="text-[8px] font-mono text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded border border-purple-500/20">SENTINEL AI</span>
          </div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">MITRE ATT&amp;CK Mapped · {incident.id}</div>
        </div>
        <button
          onClick={copyGuidance}
          title="Copy guidance"
          className="ml-auto p-1.5 rounded border border-white/10 text-slate-500 hover:text-white hover:border-white/20 transition"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Threat level */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${sev.border} ${sev.bg} ${sev.glow}`}>
          <div className={`w-8 h-8 rounded-lg ${sev.bg} border ${sev.border} flex items-center justify-center shrink-0`}>
            <Siren className={`w-4 h-4 ${sev.text} ${incident.severity === "Critical" ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <div className={`text-[9px] font-mono uppercase tracking-widest ${sev.text}`}>Threat Level</div>
            <div className={`font-bebas text-lg tracking-widest ${sev.text}`}>{triage.level}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[8px] font-mono text-slate-600">Category</div>
            <div className="text-[10px] font-mono text-slate-300 font-bold">{fmtCat(incident.category)}</div>
          </div>
        </div>

        {/* MITRE ATT&CK Techniques */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Crosshair className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">MITRE ATT&amp;CK Techniques</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {triage.mitre.map(m => (
              <span key={m} className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-500/8 border border-purple-500/20 text-purple-300">
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Containment Steps */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-[#FFD600]" />
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Containment Guidance</span>
          </div>
          <ol className="space-y-2">
            {triage.containment.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 w-4 h-4 rounded-full bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-[8px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[11px] text-slate-300 leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Escalation */}
        <div className={`flex items-start gap-2 p-3 rounded-xl border ${sev.border} ${sev.bg}`}>
          <TrendingUp className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${sev.text}`} />
          <div>
            <div className="text-[8px] font-mono text-slate-600 uppercase mb-0.5">Escalation Recommendation</div>
            <div className={`text-[11px] font-mono font-bold ${sev.text}`}>{triage.escalation}</div>
          </div>
        </div>

        {/* Similar Cases */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Similar Cases</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {triage.similarCases.map(c => (
              <span key={c} className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-[#FFD600] hover:border-[#FFD600]/30 cursor-pointer transition">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  token: string;
  role: string;
  activeAgency?: string;
  onEscalateToCase?: (incidentId: string) => void;
}

export default function TriageWorkspace({ token, role, activeAgency, onEscalateToCase }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Incident | null>(null);
  const [escalating, setEscalating] = useState(false);

  const handleEscalateClick = async () => {
    if (!selected) return;
    setEscalating(true);
    try {
      const res = await fetch(`/api/incidents/${selected.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: "Investigating",
          updateMessage: "Incident escalated to a case under investigation."
        })
      });
      if (res.ok) {
        onEscalateToCase?.(selected.id);
      }
    } catch (err) {
      console.error("Escalation error:", err);
    } finally {
      setEscalating(false);
    }
  };

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

  // Auto-select highest severity on load
  useEffect(() => {
    if (!selected && incidents.length > 0) {
      const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const top = [...incidents]
        .filter(i => !["Resolved", "Closed"].includes(i.status))
        .sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))[0]
        ?? incidents[0];
      setSelected(top);
    }
  }, [incidents, selected]);

  const filtered = useMemo(() => {
    if (!search) return incidents;
    const q = search.toLowerCase();
    return incidents.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      i.reporterOrg.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    );
  }, [incidents, search]);

  const openCount     = incidents.filter(i => !["Resolved","Closed"].includes(i.status)).length;
  const criticalCount = incidents.filter(i => i.severity === "Critical" && !["Resolved","Closed"].includes(i.status)).length;
  const newCount      = incidents.filter(i => i.status === "Reported").length;

  return (
    <div className="space-y-4" id="triage-workspace">

      {/* ── Header Banner ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[#FFD600]/20 bg-gradient-to-r from-[#0A0E1A] via-[#0e0c1a] to-[#0A0E1A] p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-[#FFD600]/4 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD600]/30 to-transparent" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Icon + Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
              <Brain className="w-5 h-5 text-[#FFD600]" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">TRIAGE &amp; INVESTIGATION WORKSPACE</h2>
              <p className="text-[10px] text-slate-500 font-mono">Analyst · Investigator · SOC Manager — Review, Triage, and Action incoming incidents</p>
            </div>
          </div>

          {/* Live KPIs */}
          <div className="sm:ml-auto flex items-center gap-4">
            {[
              { label: "Open Cases", val: openCount, cls: "text-orange-400" },
              { label: "Critical",   val: criticalCount, cls: `text-red-400 ${criticalCount > 0 ? "animate-pulse" : ""}` },
              { label: "New / Unread", val: newCount, cls: "text-blue-400" },
            ].map(({ label, val, cls }) => (
              <div key={label} className="text-center">
                <div className={`font-orbitron text-2xl font-bold leading-none ${cls}`}>{val}</div>
                <div className="text-[8px] font-mono text-slate-600 uppercase mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main 2-col Grid: Queue + Detail ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Left: Intake Queue (2 cols) */}
        <div className="xl:col-span-2">
          <IntakeQueue
            incidents={filtered}
            loading={loading}
            selected={selected}
            onSelect={setSelected}
            onRefresh={load}
            search={search}
            setSearch={setSearch}
          />
        </div>

        {/* Right: IOC + AI Triage (3 cols) */}
        <div className="xl:col-span-3 space-y-4">
          {selected ? (
            <>
              {/* Selected incident header */}
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${(SEV[selected.severity] ?? SEV.Low).border} ${(SEV[selected.severity] ?? SEV.Low).bg}`}>
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${(SEV[selected.severity] ?? SEV.Low).border} ${(SEV[selected.severity] ?? SEV.Low).bg}`}>
                  <AlertTriangle className={`w-4 h-4 ${(SEV[selected.severity] ?? SEV.Low).text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-white truncate">{selected.title}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] font-mono text-slate-500">{selected.id}</span>
                    <SevBadge severity={selected.severity} />
                    <StatusPill status={selected.status} />
                    <span className="text-[9px] font-mono text-slate-600">{fmtCat(selected.category)}</span>
                    {selected.assignedInvestigator && (
                      <span className="flex items-center gap-1 text-[9px] font-mono text-blue-400">
                        <UserCheck className="w-3 h-3" /> {selected.assignedInvestigator}
                      </span>
                    )}
                  </div>
                </div>
                {selected.status === "Reported" && (
                  <button
                    onClick={handleEscalateClick}
                    disabled={escalating}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-[10px] font-mono font-bold transition flex items-center gap-1 shrink-0 mr-2 shadow-[0_0_12px_rgba(239,68,68,0.2)] animate-pulse"
                  >
                    {escalating ? "Escalating..." : "🚨 Escalate to Case"}
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="text-slate-600 hover:text-white transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <IOCPanel incident={selected} />
              <AITriagePanel incident={selected} />
            </>
          ) : (
            <div className="h-64 rounded-xl border border-white/5 bg-white/2 flex flex-col items-center justify-center gap-3">
              <FileSearch className="w-8 h-8 text-slate-700" />
              <p className="text-slate-600 text-xs font-mono text-center">
                Select a case from the queue<br />to view IOC extraction and AI triage guidance
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
