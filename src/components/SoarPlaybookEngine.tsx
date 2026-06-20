/**
 * LitSecure Sentinel — SOAR Playbook Engine
 * Automated response workflow runner — Cortex XSOAR / Splunk Phantom equivalent.
 * Pre-built playbooks with animated step-by-step execution simulation.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Zap, Play, CheckCircle2, XCircle, Clock, AlertTriangle,
  Shield, Globe, Server, Lock, Bell, Mail, Activity,
  ChevronRight, X, Loader2, BarChart3, RefreshCw,
  Terminal, Database, Search, ArrowRight, Crosshair,
  TrendingDown, User, Radio
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlaybookStep {
  id: string;
  label: string;
  tool: string;
  action: string;
  icon: React.ElementType;
  durationMs: number;
  output?: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: PlaybookStep[];
  avgMttr: string;         // mean time to respond
  runsToday: number;
  lastRun: string;
  triggerType: "manual" | "auto" | "scheduled";
  severity: "Critical" | "High" | "Medium";
  icon: React.ElementType;
  color: string;
  successRate: number;
  mitre: string;
}

type StepStatus = "pending" | "running" | "success" | "failed";

interface RunState {
  currentStep: number;
  statuses: StepStatus[];
  logs: string[];
  done: boolean;
  failed: boolean;
  startedAt: number;
}

// ─── Playbook Data ─────────────────────────────────────────────────────────────
const PLAYBOOKS: Playbook[] = [
  {
    id: "phishing-response",
    name: "Phishing Response",
    description: "Automated end-to-end phishing triage: extracts IOCs, quarantines mailboxes, blocks domains, and notifies affected users.",
    category: "Email Security",
    severity: "High",
    icon: Mail,
    color: "#f97316",
    avgMttr: "4m 12s",
    runsToday: 7,
    lastRun: "18 min ago",
    triggerType: "auto",
    successRate: 97,
    mitre: "T1566",
    steps: [
      { id: "s1", label: "Fetch Alert",        tool: "SIEM",        action: "Pull raw alert from correlation engine",           icon: Database,  durationMs: 800,  output: "Alert #AL-4821 retrieved. Severity: HIGH. Type: Phishing Email" },
      { id: "s2", label: "Extract IOCs",       tool: "IOC Parser",  action: "Parse email headers, URLs, attachments",          icon: Crosshair, durationMs: 1200, output: "Extracted: 2 malicious URLs, 1 sender domain, 1 IP (41.206.25.3)" },
      { id: "s3", label: "Threat Intel Check", tool: "TI Platform", action: "Cross-reference IOCs against MISP + VirusTotal",  icon: Globe,     durationMs: 1500, output: "Domain flagged: 94/100 reputation score. IP on blocklist since 2024-11-02" },
      { id: "s4", label: "Quarantine Mailbox", tool: "Exchange API", action: "Isolate sender and move messages to quarantine",  icon: Lock,      durationMs: 900,  output: "3 mailboxes quarantined. 14 emails moved. Users notified." },
      { id: "s5", label: "Block Domain/IP",    tool: "Firewall API", action: "Push block rules to perimeter firewall",         icon: Shield,    durationMs: 600,  output: "ACL rule 0.0.0.0/32 → 41.206.25.3 DENY pushed to NGFW cluster" },
      { id: "s6", label: "Notify Analyst",     tool: "Alerting",    action: "Send enriched case to MACERT analyst queue",      icon: Bell,      durationMs: 400,  output: "Case LIT-2026-AUTO-07 created. Assigned to: Insp. M. Chisomo" },
      { id: "s7", label: "Close & Document",   tool: "Case Mgmt",   action: "Write playbook log and close alert",             icon: CheckCircle2,durationMs:500, output: "Playbook completed. MTTR: 5m 54s. All actions successful." },
    ],
  },
  {
    id: "ransomware-isolation",
    name: "Ransomware Isolation",
    description: "Critical-speed isolation playbook: immediately cuts network access to infected endpoints, preserves forensic evidence, and initiates recovery.",
    category: "Endpoint",
    severity: "Critical",
    icon: Lock,
    color: "#ef4444",
    avgMttr: "2m 38s",
    runsToday: 1,
    lastRun: "4h ago",
    triggerType: "auto",
    successRate: 100,
    mitre: "T1486",
    steps: [
      { id: "s1", label: "Detect Encryption",   tool: "EDR",          action: "Detect mass file encryption pattern",              icon: Activity,  durationMs: 600,  output: "23,400 files encrypted in 90s. Entropy analysis: 7.94 — RANSOMWARE CONFIRMED" },
      { id: "s2", label: "Isolate Endpoint",    tool: "EDR API",      action: "Push network isolation to affected hosts",         icon: Lock,      durationMs: 800,  output: "3 hosts isolated: WKST-045, WKST-067, SRV-DB-02. Network ACL enforced." },
      { id: "s3", label: "Kill Processes",      tool: "EDR",          action: "Terminate ransomware process tree",                icon: XCircle,   durationMs: 500,  output: "PID 4821 (mscrypt.exe) terminated. 4 child processes killed." },
      { id: "s4", label: "Snapshot Memory",     tool: "Forensics",    action: "Capture RAM image for forensic analysis",         icon: Database,  durationMs: 2000, output: "Memory dump: 32GB captured. SHA256: a8f1c2… stored to Evidence Vault." },
      { id: "s5", label: "Preserve Logs",       tool: "SIEM",         action: "Lock and export all relevant event logs",         icon: Terminal,  durationMs: 900,  output: "4.2GB of Windows Security + Sysmon logs archived to cold storage." },
      { id: "s6", label: "Initiate Recovery",   tool: "Backup API",   action: "Trigger clean-backup restore job",                icon: RefreshCw, durationMs: 1200, output: "Restore job initiated from last clean snapshot: 2026-06-18 02:00 UTC" },
      { id: "s7", label: "Alert Leadership",    tool: "Alerting",     action: "Escalate to SOC Manager and MACERT Director",    icon: Radio,     durationMs: 300,  output: "P0 alert sent via SMS + encrypted email to 4 executives." },
    ],
  },
  {
    id: "sim-swap-lockdown",
    name: "SIM Swap Lockdown",
    description: "Detects and blocks fraudulent SIM swap attempts targeting mobile money accounts by coordinating with telecom APIs.",
    category: "Financial Fraud",
    severity: "Critical",
    icon: Shield,
    color: "#8b5cf6",
    avgMttr: "1m 45s",
    runsToday: 12,
    lastRun: "6 min ago",
    triggerType: "auto",
    successRate: 94,
    mitre: "T1657",
    steps: [
      { id: "s1", label: "Detect SIM Swap",    tool: "Telecom API",  action: "Identify suspicious SIM change request",           icon: Activity,  durationMs: 500,  output: "SIM swap alert: MSISDN +265 888 xxx xxx → new ICCID. Velocity: 3rd swap in 7d" },
      { id: "s2", label: "Freeze Account",     tool: "MoMo API",     action: "Suspend mobile money wallet transactions",         icon: Lock,      durationMs: 700,  output: "Account frozen. Balance: MWK 342,800 protected. 0 transactions since freeze." },
      { id: "s3", label: "Verify Identity",    tool: "KYC Engine",   action: "Trigger out-of-band identity verification",       icon: User,      durationMs: 1000, output: "KYC challenge sent to registered national ID. Awaiting biometric confirmation." },
      { id: "s4", label: "Block SIM Port",     tool: "MACRA API",    action: "Place regulatory hold on number portability",     icon: Shield,    durationMs: 600,  output: "Portability hold placed with MACRA. Duration: 72h pending investigation." },
      { id: "s5", label: "Notify Customer",    tool: "SMS Gateway",  action: "Send fraud alert SMS to verified contact number", icon: Bell,      durationMs: 300,  output: "Alert SMS delivered to backup number. Customer confirmed: did not initiate." },
      { id: "s6", label: "Log Evidence",       tool: "Case Mgmt",    action: "Create fraud case with full audit trail",         icon: Database,  durationMs: 500,  output: "Case LIT-2026-FRAUD-089 created. Evidence chain: 6 items. Referred to CID." },
    ],
  },
  {
    id: "ddos-mitigation",
    name: "DDoS Mitigation",
    description: "Automated detection and scrubbing of volumetric DDoS attacks targeting national infrastructure, with BGP-level traffic diversion.",
    category: "Network Defense",
    severity: "Critical",
    icon: Globe,
    color: "#06b6d4",
    avgMttr: "3m 20s",
    runsToday: 2,
    lastRun: "2h ago",
    triggerType: "auto",
    successRate: 91,
    mitre: "T1499",
    steps: [
      { id: "s1", label: "Detect Volume Spike",tool: "NetFlow",      action: "Identify anomalous traffic volume",                icon: Activity,  durationMs: 500,  output: "Traffic: 480 Gbps inbound. Normal baseline: 2.1 Gbps. Attack vector: UDP flood" },
      { id: "s2", label: "Classify Attack",    tool: "ML Classifier",action: "Deep Learning model classifies attack type",      icon: Search,    durationMs: 800,  output: "Model confidence: 98.4%. Type: NTP Amplification DDoS. Source: 14 ASNs" },
      { id: "s3", label: "BGP Divert",         tool: "Router API",   action: "Announce /32 blackhole routes to upstreams",     icon: Globe,     durationMs: 1200, output: "BGP blackhole active. Traffic diverted to scrubbing centre (TeleGeography AS)" },
      { id: "s4", label: "Rate Limit",         tool: "Firewall API", action: "Apply source-rate limits on surviving traffic",   icon: Shield,    durationMs: 600,  output: "Rate limit: 100 PPS/source. 99.7% of attack traffic dropped." },
      { id: "s5", label: "Monitor Recovery",   tool: "SIEM",         action: "Watch for attack resumption and verify services", icon: BarChart3, durationMs: 900,  output: "Services restored: Gov Portal (99ms RTT), MoMo API (143ms RTT). Attack subsiding." },
      { id: "s6", label: "Notify Upstream",    tool: "NOC",          action: "Coordinate with ISPA and MACRA",                 icon: Radio,     durationMs: 400,  output: "Upstream abuse report filed with 3 ISPs. MACRA NOC briefed." },
    ],
  },
  {
    id: "credential-breach",
    name: "Credential Breach Response",
    description: "Responds to detected credential stuffing or breach events by forcing password resets, revoking sessions, and assessing blast radius.",
    category: "Identity",
    severity: "High",
    icon: User,
    color: "#f59e0b",
    avgMttr: "6m 10s",
    runsToday: 3,
    lastRun: "45 min ago",
    triggerType: "manual",
    successRate: 99,
    mitre: "T1078",
    steps: [
      { id: "s1", label: "Detect Anomaly",     tool: "UEBA",         action: "Unusual login pattern flagged by UEBA engine",    icon: Activity,  durationMs: 600,  output: "14 logins from 9 countries in 2 minutes. Risk score: 96/100" },
      { id: "s2", label: "Assess Blast Radius",tool: "IAM",          action: "Map compromised account access & permissions",    icon: Search,    durationMs: 1000, output: "Account had access to: 4 critical systems, 3 shared drives, 1 admin portal" },
      { id: "s3", label: "Revoke Sessions",    tool: "IAM API",      action: "Force logout all active sessions globally",       icon: XCircle,   durationMs: 700,  output: "47 active sessions terminated across 6 geographic regions" },
      { id: "s4", label: "Reset Credentials",  tool: "AD / LDAP",    action: "Force secure password reset + MFA re-enrol",     icon: Lock,      durationMs: 800,  output: "Temporary credentials issued. MFA reset link sent to verified email." },
      { id: "s5", label: "Scan for Persistence",tool:"EDR",          action: "Hunt for backdoors, new accounts, persistence",  icon: Crosshair, durationMs: 1500, output: "No persistence mechanisms found. No new admin accounts created." },
      { id: "s6", label: "Notify & Educate",   tool: "Alerting",     action: "Inform user and HR, initiate security training", icon: Bell,      durationMs: 500,  output: "User notified. Mandatory security training assigned. Incident documented." },
    ],
  },
  {
    id: "ioc-blocking",
    name: "Bulk IOC Blocking",
    description: "Ingests a batch of malicious IOCs from threat feeds and automatically pushes block rules across all network enforcement points.",
    category: "Threat Intel",
    severity: "Medium",
    icon: Crosshair,
    color: "#22c55e",
    avgMttr: "0m 52s",
    runsToday: 28,
    lastRun: "2 min ago",
    triggerType: "scheduled",
    successRate: 100,
    mitre: "T1071",
    steps: [
      { id: "s1", label: "Fetch Feed Update",  tool: "TI Platform",  action: "Pull latest IOC batch from MISP + Lumen feeds",   icon: Database,  durationMs: 600,  output: "Downloaded 347 new IOCs: 180 IPs, 94 domains, 73 file hashes" },
      { id: "s2", label: "Deduplicate",        tool: "IOC Engine",   action: "Remove duplicates and expired indicators",        icon: Search,    durationMs: 400,  output: "After dedup: 289 net-new IOCs. 58 already blocked. 0 false positives detected." },
      { id: "s3", label: "Score & Prioritize", tool: "ML Scorer",    action: "AI confidence scoring per indicator",             icon: Activity,  durationMs: 700,  output: "High confidence (>85%): 211 IOCs. Medium: 78. All queued for blocking." },
      { id: "s4", label: "Push to Firewall",   tool: "NGFW API",     action: "Deploy IP/Domain block rules to all nodes",       icon: Shield,    durationMs: 900,  output: "289 rules pushed to 8 enforcement nodes. Avg latency: 340ms" },
      { id: "s5", label: "Update DNS Sinkhole",tool: "DNS API",      action: "Sinkhole malicious domains to honeypot",         icon: Globe,     durationMs: 500,  output: "94 domains sinkholed. 3 pre-existing clients already connecting — flagged." },
      { id: "s6", label: "Log & Report",       tool: "SIEM",         action: "Record block actions and update TI database",     icon: Terminal,  durationMs: 300,  output: "All actions logged. TI database updated. Next scheduled run: +6h" },
    ],
  },
];

// ─── MTTR Stats ───────────────────────────────────────────────────────────────
const MTTR_STATS = [
  { label: "Avg MTTR (Auto)",     value: "2m 48s",   trend: -18, color: "text-emerald-400" },
  { label: "Avg MTTR (Manual)",   value: "24m 05s",  trend: -7,  color: "text-blue-400"   },
  { label: "Automations Today",   value: "53",       trend: +12, color: "text-[#FFD600]"  },
  { label: "Time Saved",          value: "6.4 hrs",  trend: +22, color: "text-purple-400" },
  { label: "Success Rate",        value: "97.2%",    trend: +2,  color: "text-emerald-400"},
];

// ─── Sub-components ────────────────────────────────────────────────────────────
function PlaybookCard({
  pb, onClick
}: { pb: Playbook; onClick: () => void }) {
  const Icon = pb.icon;
  const sevColor = pb.severity === "Critical" ? "text-red-400 border-red-500/30 bg-red-500/10"
                 : pb.severity === "High"     ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                 :                              "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
  const triggerColor = pb.triggerType === "auto" ? "text-emerald-400" : pb.triggerType === "scheduled" ? "text-blue-400" : "text-slate-400";
  const triggerLabel = pb.triggerType === "auto" ? "⚡ Auto" : pb.triggerType === "scheduled" ? "⏱ Scheduled" : "👤 Manual";

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border transition-all hover:scale-[1.01] hover:shadow-lg group"
      style={{ background: "#0d1520", borderColor: "#1e2d42" }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${pb.color}18`, border: `1px solid ${pb.color}40` }}>
          <Icon className="w-4 h-4" style={{ color: pb.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate group-hover:text-[#4a7aff] transition">{pb.name}</div>
          <div className="text-[9px] font-mono text-slate-500 mt-0.5">{pb.category} · MITRE {pb.mitre}</div>
        </div>
        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${sevColor} shrink-0`}>{pb.severity}</span>
      </div>

      <p className="text-[9px] text-slate-500 leading-relaxed mb-3 line-clamp-2">{pb.description}</p>

      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="w-3 h-3" />
          <span>MTTR: <span className="text-emerald-400 font-bold">{pb.avgMttr}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Activity className="w-3 h-3" />
          <span>Today: <span className="text-white font-bold">{pb.runsToday}</span></span>
        </div>
        <div className={`flex items-center gap-1 ${triggerColor} font-bold`}>
          {triggerLabel}
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          ✅ <span className="text-emerald-400 font-bold">{pb.successRate}%</span> success
        </div>
      </div>

      {/* Step count dots */}
      <div className="flex items-center gap-1 mt-3">
        {pb.steps.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: `${pb.color}30` }} />
        ))}
        <span className="text-[8px] font-mono text-slate-600 ml-1 shrink-0">{pb.steps.length} steps</span>
      </div>
    </button>
  );
}

// ─── Animated Runner Modal ─────────────────────────────────────────────────────
function PlaybookRunner({
  pb, onClose
}: { pb: Playbook; onClose: () => void }) {
  const [run, setRun] = useState<RunState | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timeoutRefs.current.forEach(clearTimeout); timeoutRefs.current = []; };

  const startRun = useCallback(() => {
    clearTimers();
    setRun({
      currentStep: 0,
      statuses: pb.steps.map(() => "pending" as StepStatus),
      logs: [`[${new Date().toISOString()}] 🚀 Playbook "${pb.name}" initiated by LitSecure SOAR Engine`],
      done: false,
      failed: false,
      startedAt: Date.now(),
    });

    let delay = 300;
    pb.steps.forEach((step, i) => {
      // Mark as running
      const t1 = setTimeout(() => {
        setRun(prev => {
          if (!prev) return prev;
          const statuses = [...prev.statuses];
          statuses[i] = "running";
          return { ...prev, currentStep: i, statuses, logs: [...prev.logs, `[${new Date().toISOString()}] ▶ Step ${i+1}: ${step.label} → ${step.action}`] };
        });
      }, delay);
      timeoutRefs.current.push(t1);
      delay += step.durationMs;

      // Mark as success
      const shouldFail = pb.id === "ddos-mitigation" && i === 2 && false; // no random fails for demo
      const t2 = setTimeout(() => {
        setRun(prev => {
          if (!prev) return prev;
          const statuses = [...prev.statuses];
          statuses[i] = shouldFail ? "failed" : "success";
          const newLog = step.output
            ? `[${new Date().toISOString()}] ✅ ${step.output}`
            : `[${new Date().toISOString()}] ✅ Step ${i+1} completed`;
          return { ...prev, statuses, logs: [...prev.logs, newLog], failed: shouldFail };
        });
      }, delay);
      timeoutRefs.current.push(t2);
      delay += 200;
    });

    // Done
    const tDone = setTimeout(() => {
      setRun(prev => {
        if (!prev) return prev;
        const elapsed = ((Date.now() - prev.startedAt) / 1000).toFixed(1);
        return {
          ...prev,
          done: true,
          logs: [...prev.logs, `[${new Date().toISOString()}] 🎯 Playbook completed in ${elapsed}s. All ${pb.steps.length} steps executed.`],
        };
      });
    }, delay + 200);
    timeoutRefs.current.push(tDone);
  }, [pb]);

  useEffect(() => () => clearTimers(), []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [run?.logs]);

  const Icon = pb.icon;
  const stepStatusIcon = (s: StepStatus) => {
    if (s === "pending") return <div className="w-5 h-5 rounded-full border-2 border-white/10 flex items-center justify-center" />;
    if (s === "running") return <Loader2 className="w-5 h-5 text-[#4a7aff] animate-spin" />;
    if (s === "success") return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    return <XCircle className="w-5 h-5 text-red-400" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}>
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border overflow-hidden shadow-2xl" style={{ background: "#0d1520", borderColor: "#1e2d42" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${pb.color}20`, border: `1px solid ${pb.color}40` }}>
            <Icon className="w-4 h-4" style={{ color: pb.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white">{pb.name}</div>
            <div className="text-[9px] font-mono text-slate-500">{pb.category} · MITRE {pb.mitre} · {pb.steps.length} steps · Avg MTTR {pb.avgMttr}</div>
          </div>
          {run?.done && (
            <span className={`text-[9px] font-mono font-bold px-2 py-1 rounded border ${run.failed ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"}`}>
              {run.failed ? "⚠ PARTIAL FAILURE" : "✅ COMPLETED"}
            </span>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Step Flow (left) */}
          <div className="w-64 shrink-0 border-r overflow-y-auto p-4 space-y-2" style={{ borderColor: "#1e2d42" }}>
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Execution Steps</div>
            {pb.steps.map((step, i) => {
              const status = run?.statuses[i] ?? "pending";
              const StepIcon = step.icon;
              const isActive = run?.currentStep === i && status === "running";
              return (
                <div key={step.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                  isActive ? "border-[#4a7aff]/40 bg-[#4a7aff]/8" :
                  status === "success" ? "border-emerald-500/20 bg-emerald-500/5" :
                  status === "failed"  ? "border-red-500/20 bg-red-500/5" :
                  "border-white/5 bg-white/2"
                }`}>
                  <div className="shrink-0 mt-0.5">{stepStatusIcon(status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <StepIcon className="w-3 h-3 text-slate-500 shrink-0" />
                      <div className="text-[10px] font-bold text-white truncate">{step.label}</div>
                    </div>
                    <div className="text-[8px] font-mono text-slate-600 mt-0.5 truncate">{step.tool}</div>
                    {isActive && (
                      <div className="mt-1 h-0.5 w-full rounded overflow-hidden bg-white/5">
                        <div className="h-full bg-[#4a7aff] animate-pulse" style={{ width: "60%" }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Log Output (right) */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "#1e2d42", background: "#111927" }}>
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Execution Log</span>
              {run && !run.done && <Loader2 className="w-3 h-3 text-[#4a7aff] animate-spin ml-auto" />}
            </div>
            <div
              ref={logsRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed space-y-1"
              style={{ background: "#080d14" }}
            >
              {!run && (
                <div className="text-slate-600 text-center py-10">
                  <Zap className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p>Click Run Playbook to start execution simulation</p>
                </div>
              )}
              {run?.logs.map((log, i) => (
                <div key={i} className={`${
                  log.includes("🚀") ? "text-[#FFD600]" :
                  log.includes("✅") ? "text-emerald-400" :
                  log.includes("▶")  ? "text-blue-400" :
                  log.includes("🎯") ? "text-indigo-400" :
                                        "text-slate-500"
                }`}>
                  {log}
                </div>
              ))}
              {run?.done && (
                <div className="mt-4 pt-3 border-t border-white/5 text-emerald-400 font-bold">
                  {run.failed ? "⚠ Playbook finished with errors. Review failed steps." : `🎯 Success — All ${pb.steps.length} actions completed. MTTR: ${((Date.now() - run.startedAt) / 1000).toFixed(1)}s`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t shrink-0" style={{ borderColor: "#1e2d42", background: "#111927" }}>
          <div className="flex items-center gap-4 text-[9px] font-mono text-slate-600">
            <span>Last run: {pb.lastRun}</span>
            <span>Total runs: {pb.runsToday} today</span>
          </div>
          <div className="flex items-center gap-2">
            {run?.done && (
              <button onClick={startRun} className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold border border-white/10 text-slate-300 hover:border-white/20 rounded-lg transition">
                <RefreshCw className="w-3.5 h-3.5" /> Run Again
              </button>
            )}
            {!run && (
              <button onClick={startRun} className="flex items-center gap-1.5 px-5 py-2 text-xs font-mono font-bold rounded-lg transition" style={{ background: pb.color, color: "#000" }}>
                <Play className="w-3.5 h-3.5" /> Run Playbook
              </button>
            )}
            {run && !run.done && (
              <button disabled className="flex items-center gap-1.5 px-5 py-2 text-xs font-mono font-bold rounded-lg opacity-60 cursor-not-allowed" style={{ background: pb.color, color: "#000" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SoarPlaybookEngine() {
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [filter, setFilter] = useState("all");

  const categories = ["all", ...Array.from(new Set(PLAYBOOKS.map(p => p.category)))];
  const filtered = PLAYBOOKS.filter(p => filter === "all" || p.category === filter);

  const totalRuns = PLAYBOOKS.reduce((a, p) => a + p.runsToday, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "#1e2d42", background: "linear-gradient(135deg,#0d1520,#111927)" }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent)" }} />
        <div className="relative p-5 flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">SOAR PLAYBOOK ENGINE</h2>
              <p className="text-[10px] text-slate-500 font-mono">Security Orchestration, Automation & Response · {PLAYBOOKS.length} Playbooks Active</p>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:ml-auto">
            {MTTR_STATS.slice(0,4).map(s => (
              <div key={s.label} className="text-center">
                <div className={`font-orbitron text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[8px] font-mono text-slate-600 mt-0.5">{s.label}</div>
                <div className={`text-[8px] font-mono ${s.trend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {s.trend > 0 ? "↑" : "↓"} {Math.abs(s.trend)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 text-[10px] font-mono font-bold rounded-lg border transition capitalize ${
              filter === cat
                ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
            }`}
            style={{ background: filter === cat ? undefined : "#1a2332" }}
          >
            {cat === "all" ? `All (${PLAYBOOKS.length})` : cat}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-slate-600">
          <Activity className="w-3 h-3" />
          <span><span className="text-white font-bold">{totalRuns}</span> executions today · <span className="text-emerald-400 font-bold">97.2%</span> success rate</span>
        </div>
      </div>

      {/* Playbook Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(pb => (
          <React.Fragment key={pb.id}><PlaybookCard pb={pb} onClick={() => setSelected(pb)} /></React.Fragment>
        ))}
      </div>

      {/* Runner Modal */}
      {selected && <PlaybookRunner pb={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
