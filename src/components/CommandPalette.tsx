import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Terminal, Globe, BarChart3, Activity, ShieldCheck,
  Radio, MapPin, Zap, Monitor, Video, FileText, FolderLock,
  Settings, BookOpen, Database, Users, Wifi, Brain, Code2,
  TrendingUp, AlertTriangle, Command, ArrowRight, Clock, X
} from "lucide-react";

interface CommandAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  category: "navigate" | "action" | "recent";
  tabId?: string;
  shortcut?: string;
  severity?: "critical" | "high" | "medium" | "low";
  badge?: string;
}

const ALL_COMMANDS: CommandAction[] = [
  // Navigation
  { id: "nav-portal",    label: "Incident Portal",        description: "Submit & track cyber incidents", icon: ShieldCheck, category: "navigate", tabId: "portal" },
  { id: "nav-command",   label: "Threat Terminal",         description: "Live incident command console",  icon: Terminal,    category: "navigate", tabId: "command" },
  { id: "nav-situation", label: "Situation Room",          description: "National threat operations view", icon: Radio,       category: "navigate", tabId: "situation" },
  { id: "nav-riskmap",   label: "National Risk Map",       description: "Malawi district threat heatmap", icon: MapPin,      category: "navigate", tabId: "riskmap" },
  { id: "nav-campaigns", label: "Campaign Correlation",    description: "Multi-incident threat campaigns", icon: Zap,         category: "navigate", tabId: "campaigns" },
  { id: "nav-edr",       label: "EDR Endpoint Protection", description: "Endpoint detection & response",  icon: Monitor,     category: "navigate", tabId: "edr" },
  { id: "nav-intel",     label: "Threat Intelligence DB",  description: "IOC database & threat feeds",    icon: Globe,       category: "navigate", tabId: "intel" },
  { id: "nav-analytics", label: "National Analytics",      description: "Charts, KPIs & trend analysis",  icon: BarChart3,   category: "navigate", tabId: "analytics" },
  { id: "nav-patterns",  label: "AI Threat Analysis",      description: "Gemini-powered pattern intel",   icon: Brain,       category: "navigate", tabId: "patterns" },
  { id: "nav-scoring",   label: "Sector Risk Scoring",     description: "Risk scores per sector",         icon: TrendingUp,  category: "navigate", tabId: "scoring" },
  { id: "nav-cctv",      label: "CCTV Surveillance",       description: "Live camera feeds & monitoring", icon: Video,       category: "navigate", tabId: "cctv" },
  { id: "nav-logs",      label: "Infrastructure Logs",     description: "System & security event logs",   icon: Activity,    category: "navigate", tabId: "logs" },
  { id: "nav-reports",   label: "Reports & Recommendations",description: "Executive & operational reports",icon: FileText,    category: "navigate", tabId: "reports" },
  { id: "nav-evidence",  label: "Evidence Vault",          description: "Forensic evidence management",   icon: FolderLock,  category: "navigate", tabId: "evidence" },
  { id: "nav-rules",     label: "Rules Orchestrator",      description: "Security rules & automation",    icon: Code2,       category: "navigate", tabId: "rules" },
  { id: "nav-cyberintel",label: "Cyber Intel Hub",         description: "Advanced cyber intelligence",    icon: ShieldCheck, category: "navigate", tabId: "cyberintel", badge: "NEW" },
  { id: "nav-netintel",  label: "Network Intelligence",    description: "Network topology & intrusion",   icon: Wifi,        category: "navigate", tabId: "netintel", badge: "NEW" },
  { id: "nav-globalmap", label: "Global Threat Map",       description: "World-wide cyber threat map",    icon: Globe,       category: "navigate", tabId: "globalmap" },
  { id: "nav-policies",  label: "Policy Engine",           description: "Security policy management",     icon: Settings,    category: "navigate", tabId: "policies" },
  { id: "nav-social",    label: "Social Media Monitor",    description: "OSINT social threat monitoring", icon: Wifi,        category: "navigate", tabId: "social" },
  { id: "nav-awareness", label: "Awareness Hub",           description: "Cyber awareness & training",     icon: BookOpen,    category: "navigate", tabId: "awareness" },
  { id: "nav-database",  label: "Database Console",        description: "Raw DB query interface",         icon: Database,    category: "navigate", tabId: "database" },
  { id: "nav-users",     label: "User Management",         description: "SOC user roles & access control",icon: Users,       category: "navigate", tabId: "users" },
  { id: "nav-cyberterm", label: "Cyber Terminal",          description: "Advanced CLI interface",         icon: Terminal,    category: "navigate", tabId: "cyberterm" },
  { id: "nav-ailearn",   label: "AI Learning Center",      description: "ML model training & feedback",   icon: Brain,       category: "navigate", tabId: "ailearn", badge: "ML" },
  { id: "nav-incidentmgr",label: "Incident Manager",       description: "Full incident lifecycle management",icon: FileText, category: "navigate", tabId: "incidentmgr" },
];

const SEVERITY_COLORS = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low:      "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

interface CommandPaletteProps {
  onNavigate: (tabId: string) => void;
  allowedTabIds: string[];
}

export default function CommandPalette({ onNavigate, allowedTabIds }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("cmd_recent") || "[]"); } catch { return []; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands by allowed tabs + query
  const filteredCommands = React.useMemo(() => {
    const allowed = ALL_COMMANDS.filter(c => !c.tabId || allowedTabIds.includes(c.tabId));
    if (!query.trim()) {
      const recent = recentIds.slice(0, 3)
        .map(id => allowed.find(c => c.id === id))
        .filter(Boolean) as CommandAction[];
      return [
        ...recent.map(c => ({ ...c, category: "recent" as const })),
        ...allowed.filter(c => !recentIds.slice(0, 3).includes(c.id)),
      ];
    }
    const q = query.toLowerCase();
    return allowed.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tabId?.toLowerCase().includes(q)
    );
  }, [query, allowedTabIds, recentIds]);

  const execute = useCallback((cmd: CommandAction) => {
    if (cmd.tabId) {
      onNavigate(cmd.tabId);
      setRecentIds(prev => {
        const updated = [cmd.id, ...prev.filter(id => id !== cmd.id)].slice(0, 10);
        sessionStorage.setItem("cmd_recent", JSON.stringify(updated));
        return updated;
      });
    }
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, [onNavigate]);

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery("");
        setSelected(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Arrow key navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, filteredCommands.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && filteredCommands[selected]) { e.preventDefault(); execute(filteredCommands[selected]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, selected, filteredCommands, execute]);

  // Focus input on open
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Command palette (Ctrl+K)"
        className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/3 hover:border-[#FFD600]/40 hover:bg-[#FFD600]/5 text-slate-500 hover:text-slate-300 transition-all text-[11px] font-mono"
      >
        <Search className="w-3 h-3" />
        <span className="text-slate-600">Search...</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] tracking-wider">⌘K</span>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="fixed top-[15vh] left-1/2 -translate-x-1/2 z-[9999] w-full max-w-2xl px-4">
        <div className="command-palette-container rounded-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
            <Command className="w-4 h-4 text-[#FFD600] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(0); }}
              placeholder="Navigate to module, search incidents, execute action..."
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-mono"
              id="command-palette-input"
            />
            <div className="flex items-center gap-1.5">
              <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-500">ESC</kbd>
              <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-400 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-600 text-sm font-mono">
                No results for "{query}"
              </div>
            ) : (
              <>
                {/* Section headers */}
                {!query && recentIds.slice(0,3).length > 0 && (
                  <div className="px-4 pt-1 pb-1.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Recent
                    </span>
                  </div>
                )}
                {filteredCommands.map((cmd, idx) => {
                  const Icon = cmd.icon;
                  const isSelected = idx === selected;
                  const showNavHeader = !query && idx === Math.min(recentIds.slice(0,3).length, filteredCommands.length - 1) && cmd.category === "navigate" && idx > 0;
                  return (
                    <React.Fragment key={cmd.id}>
                      {showNavHeader && (
                        <div className="px-4 pt-3 pb-1">
                          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600">All Modules</span>
                        </div>
                      )}
                      <button
                        data-idx={idx}
                        onMouseEnter={() => setSelected(idx)}
                        onClick={() => execute(cmd)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all group ${
                          isSelected ? "bg-[#FFD600]/8 border-l-2 border-[#FFD600]" : "border-l-2 border-transparent hover:bg-white/3"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                          isSelected ? "bg-[#FFD600]/15 text-[#FFD600]" : "bg-white/5 text-slate-500 group-hover:text-slate-300"
                        }`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-semibold font-grotesk ${isSelected ? "text-[#FFD600]" : "text-slate-200"}`}>
                              {cmd.label}
                            </span>
                            {cmd.badge && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#FFD600] text-[#05080F]">{cmd.badge}</span>
                            )}
                            {cmd.category === "recent" && (
                              <span className="text-[8px] font-mono text-slate-600 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />recent</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">{cmd.description}</p>
                        </div>
                        <ArrowRight className={`w-3.5 h-3.5 shrink-0 transition-all ${isSelected ? "text-[#FFD600] translate-x-0.5" : "text-slate-700"}`} />
                      </button>
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-slate-600">
            <span><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10">↑↓</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10">↵</kbd> select</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10">esc</kbd> close</span>
            <span className="ml-auto text-slate-700">{filteredCommands.length} results</span>
          </div>
        </div>
      </div>
    </>
  );
}
