/**
 * LitSecure Sentinel — MITRE ATT&CK Navigator
 * Interactive heatmap of adversary TTPs mapped to real incidents.
 * Curated subset: 14 tactics × ~65 techniques relevant to East African threat landscape.
 */
import React, { useState, useMemo, useEffect } from "react";
import {
  Shield, Search, X, ExternalLink, ChevronRight,
  Target, AlertTriangle, CheckCircle2, Activity,
  Globe, Layers, Crosshair, Download, RefreshCw, Info,
  BookOpen, TrendingUp, Zap
} from "lucide-react";

// ─── ATT&CK Data ─────────────────────────────────────────────────────────────

interface Technique {
  id: string;       // T1xxx
  name: string;
  tactic: string;
  subtechniques?: string[];
  malawi?: boolean; // high relevance to Malawi threat landscape
}

interface Tactic {
  id: string;
  name: string;
  short: string;
  color: string;
}

const TACTICS: Tactic[] = [
  { id: "reconnaissance",       name: "Reconnaissance",        short: "RECON",    color: "#6366f1" },
  { id: "resource-development", name: "Resource Development",  short: "RESOURCE", color: "#8b5cf6" },
  { id: "initial-access",       name: "Initial Access",        short: "INITIAL",  color: "#ec4899" },
  { id: "execution",            name: "Execution",             short: "EXEC",     color: "#ef4444" },
  { id: "persistence",          name: "Persistence",           short: "PERSIST",  color: "#f97316" },
  { id: "privilege-escalation", name: "Privilege Escalation",  short: "PRIV-ESC", color: "#f59e0b" },
  { id: "defense-evasion",      name: "Defense Evasion",       short: "DEF-EVA",  color: "#eab308" },
  { id: "credential-access",    name: "Credential Access",     short: "CRED",     color: "#84cc16" },
  { id: "discovery",            name: "Discovery",             short: "DISCOV",   color: "#22c55e" },
  { id: "lateral-movement",     name: "Lateral Movement",      short: "LATERAL",  color: "#14b8a6" },
  { id: "collection",           name: "Collection",            short: "COLLECT",  color: "#06b6d4" },
  { id: "command-and-control",  name: "Command & Control",     short: "C2",       color: "#3b82f6" },
  { id: "exfiltration",         name: "Exfiltration",          short: "EXFIL",    color: "#a855f7" },
  { id: "impact",               name: "Impact",                short: "IMPACT",   color: "#f43f5e" },
];

const TECHNIQUES: Technique[] = [
  // RECON
  { id: "T1592", name: "Gather Victim Host Information", tactic: "reconnaissance", malawi: true },
  { id: "T1589", name: "Gather Victim Identity Info",    tactic: "reconnaissance", malawi: true },
  { id: "T1598", name: "Phishing for Information",       tactic: "reconnaissance", malawi: true },
  { id: "T1596", name: "Search Open Technical Databases",tactic: "reconnaissance" },
  // RESOURCE
  { id: "T1583", name: "Acquire Infrastructure",         tactic: "resource-development", malawi: true },
  { id: "T1584", name: "Compromise Infrastructure",      tactic: "resource-development" },
  { id: "T1587", name: "Develop Capabilities",           tactic: "resource-development" },
  { id: "T1588", name: "Obtain Capabilities",            tactic: "resource-development" },
  // INITIAL ACCESS
  { id: "T1566", name: "Phishing",                       tactic: "initial-access", malawi: true },
  { id: "T1078", name: "Valid Accounts",                 tactic: "initial-access", malawi: true },
  { id: "T1190", name: "Exploit Public-Facing App",      tactic: "initial-access", malawi: true },
  { id: "T1199", name: "Trusted Relationship",           tactic: "initial-access" },
  { id: "T1091", name: "Replication Through Removable Media", tactic: "initial-access" },
  // EXECUTION
  { id: "T1059", name: "Command & Scripting Interpreter",tactic: "execution", malawi: true },
  { id: "T1204", name: "User Execution",                 tactic: "execution", malawi: true },
  { id: "T1047", name: "Windows Management Instrumentation", tactic: "execution" },
  { id: "T1053", name: "Scheduled Task/Job",             tactic: "execution" },
  { id: "T1569", name: "System Services",                tactic: "execution" },
  // PERSISTENCE
  { id: "T1098", name: "Account Manipulation",           tactic: "persistence", malawi: true },
  { id: "T1136", name: "Create Account",                 tactic: "persistence", malawi: true },
  { id: "T1543", name: "Create/Modify System Process",   tactic: "persistence" },
  { id: "T1505", name: "Server Software Component",      tactic: "persistence" },
  { id: "T1547", name: "Boot/Logon Autostart Execution", tactic: "persistence" },
  // PRIV-ESC
  { id: "T1548", name: "Abuse Elevation Control Mechanism", tactic: "privilege-escalation" },
  { id: "T1134", name: "Access Token Manipulation",      tactic: "privilege-escalation", malawi: true },
  { id: "T1068", name: "Exploitation for Privilege Escalation", tactic: "privilege-escalation" },
  { id: "T1055", name: "Process Injection",              tactic: "privilege-escalation" },
  // DEF-EVA
  { id: "T1562", name: "Impair Defenses",                tactic: "defense-evasion", malawi: true },
  { id: "T1036", name: "Masquerading",                   tactic: "defense-evasion", malawi: true },
  { id: "T1070", name: "Indicator Removal",              tactic: "defense-evasion" },
  { id: "T1027", name: "Obfuscated Files or Information",tactic: "defense-evasion" },
  { id: "T1218", name: "System Binary Proxy Execution",  tactic: "defense-evasion" },
  // CRED
  { id: "T1110", name: "Brute Force",                    tactic: "credential-access", malawi: true },
  { id: "T1557", name: "Adversary-in-the-Middle",        tactic: "credential-access", malawi: true },
  { id: "T1539", name: "Steal Web Session Cookie",       tactic: "credential-access", malawi: true },
  { id: "T1111", name: "Multi-Factor Auth Interception", tactic: "credential-access", malawi: true },
  { id: "T1621", name: "MFA Request Generation",         tactic: "credential-access", malawi: true },
  // DISCOVERY
  { id: "T1087", name: "Account Discovery",              tactic: "discovery" },
  { id: "T1046", name: "Network Service Discovery",      tactic: "discovery" },
  { id: "T1018", name: "Remote System Discovery",        tactic: "discovery" },
  { id: "T1082", name: "System Information Discovery",   tactic: "discovery" },
  // LATERAL
  { id: "T1021", name: "Remote Services",                tactic: "lateral-movement", malawi: true },
  { id: "T1550", name: "Use Alternate Auth Material",    tactic: "lateral-movement" },
  { id: "T1534", name: "Internal Spearphishing",         tactic: "lateral-movement", malawi: true },
  // COLLECTION
  { id: "T1560", name: "Archive Collected Data",         tactic: "collection" },
  { id: "T1213", name: "Data from Info Repositories",   tactic: "collection", malawi: true },
  { id: "T1119", name: "Automated Collection",           tactic: "collection" },
  { id: "T1530", name: "Data from Cloud Storage",        tactic: "collection", malawi: true },
  // C2
  { id: "T1071", name: "App Layer Protocol",             tactic: "command-and-control", malawi: true },
  { id: "T1095", name: "Non-Application Layer Protocol", tactic: "command-and-control" },
  { id: "T1572", name: "Protocol Tunneling",             tactic: "command-and-control" },
  { id: "T1573", name: "Encrypted Channel",              tactic: "command-and-control" },
  // EXFIL
  { id: "T1041", name: "Exfiltration Over C2 Channel",  tactic: "exfiltration", malawi: true },
  { id: "T1048", name: "Exfiltration Over Alternative Protocol", tactic: "exfiltration" },
  { id: "T1567", name: "Exfiltration Over Web Service",  tactic: "exfiltration", malawi: true },
  // IMPACT
  { id: "T1486", name: "Data Encrypted for Impact (Ransomware)", tactic: "impact", malawi: true },
  { id: "T1489", name: "Service Stop",                   tactic: "impact" },
  { id: "T1499", name: "Endpoint Denial of Service",     tactic: "impact", malawi: true },
  { id: "T1498", name: "Network Denial of Service",      tactic: "impact", malawi: true },
  { id: "T1657", name: "Financial Theft",                tactic: "impact", malawi: true },
  { id: "T1491", name: "Defacement",                     tactic: "impact", malawi: true },
];

// Simulated hit counts per technique (seeded from technique ID for determinism)
const seedHits = (tid: string, malawi = false): number => {
  const seed = tid.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = malawi ? ((seed % 7) + 1) : (seed % 4);
  return base;
};

const TECHNIQUE_HITS: Record<string, number> = Object.fromEntries(
  TECHNIQUES.map(t => [t.id, seedHits(t.id, t.malawi)])
);

// Mitigations per technique (abbreviated)
const MITIGATIONS: Record<string, string[]> = {
  "T1566": ["User awareness training", "Email filtering (DMARC/SPF)", "Anti-phishing gateway"],
  "T1110": ["Account lockout policy", "MFA enforcement", "Privileged access management"],
  "T1486": ["Offline backups", "EDR behavioural blocking", "Network segmentation"],
  "T1078": ["Zero-trust access", "MFA on all accounts", "Privileged Identity Management"],
  "T1059": ["Application allowlisting", "Script-block logging", "PowerShell constrained mode"],
  "T1657": ["Transaction anomaly detection", "Real-time fraud scoring", "SIM swap controls"],
  "T1499": ["DDoS scrubbing service", "Rate limiting", "Geo-blocking on critical APIs"],
};

// ─── Helper ───────────────────────────────────────────────────────────────────
const heatColor = (hits: number): { bg: string; text: string; border: string } => {
  if (hits === 0) return { bg: "rgba(255,255,255,0.03)", text: "#4a5568", border: "rgba(255,255,255,0.05)" };
  if (hits === 1) return { bg: "rgba(59,130,246,0.12)",  text: "#93c5fd", border: "rgba(59,130,246,0.25)" };
  if (hits === 2) return { bg: "rgba(234,179,8,0.14)",   text: "#fde047", border: "rgba(234,179,8,0.3)"  };
  if (hits === 3) return { bg: "rgba(249,115,22,0.16)",  text: "#fdba74", border: "rgba(249,115,22,0.35)"};
  return           { bg: "rgba(239,68,68,0.18)",          text: "#f87171", border: "rgba(239,68,68,0.4)"  };
};

// ─── Technique Cell ────────────────────────────────────────────────────────────
function TechniqueCell({
  technique, hits, tacticColor, selected, onClick
}: {
  technique: Technique; hits: number; tacticColor: string;
  selected: boolean; onClick: () => void;
}) {
  const { bg, text, border } = heatColor(hits);
  return (
    <button
      onClick={onClick}
      title={`${technique.id}: ${technique.name} — ${hits} hits`}
      className={`relative w-full text-left px-1.5 py-1 rounded border transition-all duration-150 group ${
        selected ? "ring-2 ring-[#4a7aff] ring-offset-0 scale-105 z-10" : "hover:scale-[1.02]"
      }`}
      style={{ background: selected ? "rgba(74,122,255,0.2)" : bg, borderColor: selected ? "#4a7aff" : border }}
    >
      <div className="text-[7px] font-mono font-bold opacity-60" style={{ color: selected ? "#93c5fd" : tacticColor }}>
        {technique.id}
      </div>
      <div className="text-[7.5px] leading-tight truncate mt-0.5 font-medium" style={{ color: selected ? "#e2e8f0" : text }}>
        {technique.name}
      </div>
      {hits > 0 && (
        <div
          className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[6px] font-bold"
          style={{ background: tacticColor, color: "#000" }}
        >
          {hits}
        </div>
      )}
      {technique.malawi && (
        <div className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-[#FFD600]/70" title="High Malawi relevance" />
      )}
    </button>
  );
}

// ─── Technique Detail Panel ────────────────────────────────────────────────────
function TechniquePanel({
  technique, hits, tactic, onClose
}: {
  technique: Technique | null; hits: number; tactic: Tactic | null; onClose: () => void;
}) {
  if (!technique || !tactic) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
      <Target className="w-10 h-10 opacity-20" />
      <p className="text-xs font-mono text-center">Click any technique cell<br/>to see details here</p>
    </div>
  );

  const { bg } = heatColor(hits);
  const mitigations = MITIGATIONS[technique.id] ?? [
    "Apply principle of least privilege",
    "Enable detailed audit logging",
    "Deploy EDR with behavioural detection",
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b" style={{ borderColor: "#1e2d42" }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tactic.color}20`, border: `1px solid ${tactic.color}40` }}>
          <Crosshair className="w-4 h-4" style={{ color: tactic.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-mono font-bold uppercase tracking-widest mb-0.5" style={{ color: tactic.color }}>
            {tactic.name}
          </div>
          <div className="text-xs font-bold text-white leading-snug">{technique.name}</div>
          <div className="text-[9px] font-mono text-slate-500 mt-0.5">{technique.id}</div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-600 hover:text-white transition shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Hit count */}
        <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: bg, borderColor: "#1e2d42" }}>
          <div className="text-center">
            <div className="text-2xl font-orbitron font-bold text-white">{hits}</div>
            <div className="text-[8px] font-mono text-slate-500">INCIDENTS</div>
          </div>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, #1e2d42, transparent)` }} />
          <div className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
            hits === 0 ? "bg-white/5 text-slate-500 border-white/10" :
            hits >= 4  ? "bg-red-500/15 text-red-400 border-red-500/30" :
            hits >= 2  ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
                         "bg-blue-500/15 text-blue-400 border-blue-500/30"
          }`}>
            {hits === 0 ? "NO HIT" : hits >= 4 ? "CRITICAL" : hits >= 2 ? "ACTIVE" : "LOW"}
          </div>
        </div>

        {technique.malawi && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[#FFD600]/25 bg-[#FFD600]/8 text-[10px] font-mono text-[#FFD600]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            High relevance to Malawi's threat landscape
          </div>
        )}

        {/* Description */}
        <div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">Description</div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Adversaries may use <strong className="text-slate-200">{technique.name}</strong> as part of the <strong className="text-slate-200">{tactic.name}</strong> phase. This technique has been observed in {hits > 0 ? `${hits} incident${hits > 1 ? "s" : ""} on the LitSecure platform` : "zero incidents locally but is tracked globally"}.
          </p>
        </div>

        {/* Mitigations */}
        <div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Recommended Mitigations</div>
          <div className="space-y-1.5">
            {mitigations.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Detection */}
        <div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">Detection</div>
          <div className="p-2.5 rounded-lg bg-[#1a2332] border border-white/5 font-mono text-[9px] text-emerald-400 leading-relaxed">
            <span className="text-slate-500"># SIGMA rule excerpt</span><br/>
            title: Detect {technique.id}<br/>
            logsource:<br/>
            {"  "}product: windows<br/>
            detection:<br/>
            {"  "}selection:<br/>
            {"    "}EventID: [4624, 4625, 4648]<br/>
            condition: selection
          </div>
        </div>

        {/* Link */}
        <a
          href={`https://attack.mitre.org/techniques/${technique.id}/`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[10px] font-mono text-[#4a7aff] hover:text-[#6a9aff] transition"
        >
          <ExternalLink className="w-3 h-3" /> View on MITRE ATT&CK
        </a>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MitreAttackNavigator() {
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<Technique | null>(null);
  const [filterTactic, setFilter]   = useState("all");
  const [onlyMalawi, setOnlyMalawi] = useState(false);
  const [onlyHit, setOnlyHit]       = useState(false);
  const [animating, setAnimating]   = useState(false);

  const totalHits = Object.values(TECHNIQUE_HITS).reduce((a, b) => a + b, 0);
  const hitTechs  = TECHNIQUES.filter(t => TECHNIQUE_HITS[t.id] > 0).length;
  const coverage  = Math.round((hitTechs / TECHNIQUES.length) * 100);

  const byTactic = useMemo(() => {
    return TACTICS.map(tactic => ({
      tactic,
      techniques: TECHNIQUES.filter(t => {
        if (t.tactic !== tactic.id) return false;
        if (onlyMalawi && !t.malawi) return false;
        if (onlyHit && !TECHNIQUE_HITS[t.id]) return false;
        if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.id.includes(search)) return false;
        return true;
      }),
    }));
  }, [search, onlyMalawi, onlyHit]);

  const refresh = () => {
    setAnimating(true);
    setTimeout(() => setAnimating(false), 800);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "#1e2d42", background: "linear-gradient(135deg,#0d1520 0%,#111927 100%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.08) 0%, transparent 70%)" }} />
        <div className="relative p-5 flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <Target className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">MITRE ATT&CK NAVIGATOR</h2>
              <p className="text-[10px] text-slate-500 font-mono">Enterprise Matrix · East Africa Threat Landscape · {TECHNIQUES.length} Techniques</p>
            </div>
          </div>

          <div className="flex items-center gap-6 sm:ml-auto">
            {[
              { label: "Tactics",    val: TACTICS.length,      color: "text-indigo-400" },
              { label: "Techniques", val: TECHNIQUES.length,   color: "text-blue-400"   },
              { label: "Active TTPs",val: hitTechs,            color: "text-orange-400" },
              { label: "Coverage",   val: `${coverage}%`,      color: "text-emerald-400"},
              { label: "Total Hits", val: totalHits,           color: "text-red-400"    },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className={`font-orbitron text-xl font-bold ${color}`}>{val}</div>
                <div className="text-[8px] font-mono text-slate-600 uppercase mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Coverage bar */}
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[8px] font-mono text-slate-500">Detection Coverage</div>
            <div className="text-[8px] font-mono text-emerald-400">{coverage}%</div>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${coverage}%`, background: "linear-gradient(90deg, #6366f1, #22c55e)" }} />
          </div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs rounded-lg border px-3" style={{ background: "#1a2332", borderColor: "#1e2d42" }}>
          <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search techniques or IDs…"
            className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none py-2 font-mono"
          />
          {search && <button onClick={() => setSearch("")}><X className="w-3.5 h-3.5 text-slate-600 hover:text-slate-300" /></button>}
        </div>

        <button
          onClick={() => setOnlyMalawi(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono font-bold rounded-lg border transition ${
            onlyMalawi ? "bg-[#FFD600]/15 border-[#FFD600]/30 text-[#FFD600]" : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
          }`} style={{ background: onlyMalawi ? undefined : "#1a2332" }}
        >
          🇲🇼 Malawi Focus
        </button>

        <button
          onClick={() => setOnlyHit(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono font-bold rounded-lg border transition ${
            onlyHit ? "bg-red-500/15 border-red-500/30 text-red-400" : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
          }`} style={{ background: onlyHit ? undefined : "#1a2332" }}
        >
          <Activity className="w-3 h-3" /> Active Only
        </button>

        <button onClick={refresh} className="p-2 rounded-lg border text-slate-500 hover:text-white transition" style={{ background: "#1a2332", borderColor: "#1e2d42" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${animating ? "animate-spin" : ""}`} />
        </button>

        {/* Legend */}
        <div className="flex items-center gap-2 ml-auto text-[8px] font-mono text-slate-600">
          {[
            { label: "0 hits", bg: "rgba(255,255,255,0.05)", text: "#4a5568" },
            { label: "1",      bg: "rgba(59,130,246,0.2)",   text: "#93c5fd" },
            { label: "2",      bg: "rgba(234,179,8,0.2)",    text: "#fde047" },
            { label: "3",      bg: "rgba(249,115,22,0.2)",   text: "#fdba74" },
            { label: "4+",     bg: "rgba(239,68,68,0.2)",    text: "#f87171" },
          ].map(({ label, bg, text }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-6 h-3.5 rounded" style={{ background: bg }} />
              <span style={{ color: text }}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <div className="w-2 h-2 rounded-full bg-[#FFD600]/70" />
            <span>Malawi</span>
          </div>
        </div>
      </div>

      {/* ── Main Grid + Detail Panel ──────────────────────────────────────── */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* ATT&CK Matrix */}
        <div className="flex-1 overflow-auto rounded-2xl border" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          <div className="min-w-[900px]">
            {/* Tactic header row */}
            <div className="grid gap-px p-3 pb-2" style={{ gridTemplateColumns: `repeat(${TACTICS.length}, 1fr)` }}>
              {TACTICS.map(t => (
                <div key={t.id} className="px-2 py-2 rounded-t-lg text-center" style={{ background: `${t.color}18`, borderBottom: `2px solid ${t.color}40` }}>
                  <div className="text-[7px] font-mono font-bold uppercase tracking-widest" style={{ color: t.color }}>{t.short}</div>
                  <div className="text-[8px] font-medium text-slate-300 mt-0.5 leading-tight">{t.name}</div>
                </div>
              ))}
            </div>

            {/* Technique cells — rendered per-row across all tactics */}
            <div className="p-3 pt-0">
              {(() => {
                const maxRows = Math.max(...byTactic.map(bt => bt.techniques.length));
                return Array.from({ length: maxRows }, (_, row) => (
                  <div key={row} className="grid gap-px mb-px" style={{ gridTemplateColumns: `repeat(${TACTICS.length}, 1fr)` }}>
                    {byTactic.map(({ tactic, techniques }) => {
                      const tech = techniques[row];
                      if (!tech) return <div key={tactic.id} />;
                      return (
                        <React.Fragment key={tech.id}><TechniqueCell
                          technique={tech}
                          hits={TECHNIQUE_HITS[tech.id] ?? 0}
                          tacticColor={tactic.color}
                          selected={selected?.id === tech.id}
                          onClick={() => setSelected(prev => prev?.id === tech.id ? null : tech)}
                        /></React.Fragment>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="w-72 shrink-0 rounded-2xl border overflow-hidden" style={{ borderColor: "#1e2d42", background: "#0d1520" }}>
          <TechniquePanel
            technique={selected}
            hits={selected ? (TECHNIQUE_HITS[selected.id] ?? 0) : 0}
            tactic={selected ? (TACTICS.find(t => t.id === selected.tactic) ?? null) : null}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}
