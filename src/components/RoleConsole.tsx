import React, { useState, useEffect } from "react";
import { 
  Shield, UserCheck, AlertTriangle, FileText, CheckSquare, 
  ChevronRight, Landmark, Smartphone, Activity, Globe, MessageSquare, Briefcase,
  Trash2, Check, Brain
} from "lucide-react";
import { Incident, IncidentStatus, UserRole } from "../types";

interface RoleConsoleProps {
  incidents: Incident[];
  onIncidentUpdated: () => void;
  onAiAnalyze?: (incidentId: string) => void;
  readOnly?: boolean;
}

const CONST_INVESTIGATORS = [
  "Sgt. N. Tembo (Police Cybercrime Unit)",
  "Maj. S. Banda (Malawi Defense Cyber-Cell)",
  "Insp. A. Chimwaza (Lilongwe Fraud Taskforce)",
  "L. Katundu (MACERT Lead Analyst)"
];

const ROLES: { id: UserRole; name: string; org: string }[] = [
  { id: "Admin", name: "National Cyber Sec Admin (MACRA)", org: "MACRA / MACERT" },
  { id: "Investigator", name: "Cybercrime Unit Lead (Malawi Police)", org: "Lilongwe Crime Division" },
  { id: "Analyst", name: "Corporate Security (Telecommunications/Banking)", org: "Airtel / TNM / Bank SOC" }
];

export default function RoleConsole({ incidents, onIncidentUpdated, onAiAnalyze, readOnly = false }: RoleConsoleProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>("Admin");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  
  // Filter & sort states
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("Newest");
  
  // Update inputs
  const [activeInvestigator, setActiveInvestigator] = useState("");
  const [activeStatus, setActiveStatus] = useState<IncidentStatus>("Reported");
  const [actionNotes, setActionNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [authorName, setAuthorName] = useState("");

  // Bulk selection states
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Bulk operation handlers
  const handleToggleSelect = (id: string) => {
    setBulkSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (bulkSelectedIds.length === 0) return;
    setBulkProcessing(true);
    try {
      const response = await fetch("/api/incidents/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: bulkSelectedIds,
          status,
          authorRole: selectedRole,
          authorName: authorName || "MACRA Command Terminal"
        })
      });

      if (response.ok) {
        setBulkSelectedIds([]);
        onIncidentUpdated();
      }
    } catch (err) {
      console.error("Failed to execute bulk status transition:", err);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (bulkSelectedIds.length === 0) return;
    setBulkProcessing(true);
    try {
      const response = await fetch("/api/incidents/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: bulkSelectedIds,
          authorRole: selectedRole,
          authorName: authorName || "MACRA Command Terminal"
        })
      });

      if (response.ok) {
        setBulkSelectedIds([]);
        setSelectedIncident(null);
        onIncidentUpdated();
      }
    } catch (err) {
      console.error("Failed to execute bulk deletion:", err);
    } finally {
      setBulkProcessing(false);
    }
  };

  useEffect(() => {
    // Sync default state
    if (selectedIncident) {
      const liveVer = incidents.find(i => i.id === selectedIncident.id);
      if (liveVer) {
        setSelectedIncident(liveVer);
        setActiveStatus(liveVer.status);
        setActiveInvestigator(liveVer.assignedInvestigator || "");
      }
    }
  }, [incidents]);

  const handleSelectIncident = (inc: Incident) => {
    setSelectedIncident(inc);
    setActiveStatus(inc.status);
    setActiveInvestigator(inc.assignedInvestigator || "");
    setActionNotes("");
    
    // Set typical author name based on selected role
    if (selectedRole === "Admin") {
      setAuthorName("Chiwengo (MACRA Hub)");
    } else if (selectedRole === "Investigator") {
      setAuthorName("Insp. A. Chimwaza");
    } else {
      setAuthorName("Corporate Sec Analyst");
    }
  };

  const handleApplyAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/incidents/${selectedIncident.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: activeStatus,
          investigator: activeInvestigator || null,
          updateMessage: actionNotes || `Status updated to [${activeStatus}] with assigned investigator: [${activeInvestigator || "None"}]`,
          authorRole: selectedRole,
          authorName: authorName || "Sentinel Responder"
        })
      });

      if (response.ok) {
        const revisedIncident = await response.json();
        // Update selection
        setSelectedIncident(revisedIncident);
        setActionNotes("");
        onIncidentUpdated();
      }
    } catch (err) {
      console.error("Error executing status revision on server:", err);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Reported":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/30";
      case "Investigating":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
      case "Contained":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/30";
      default:
        return "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/30";
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "Critical":
        return "bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold";
      case "High":
        return "bg-orange-500/15 text-orange-400 border border-orange-500/30";
      case "Medium":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
      default:
        return "bg-slate-500/10 text-slate-400 border border-slate-500/30";
    }
  };

  const getSlaInfo = (inc: Incident) => {
    if (inc.status !== "Reported") {
      return { text: "Compliance Met ✓", badgeClass: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" };
    }
    const createdDate = new Date(inc.incidentDate);
    const diffMs = Date.now() - createdDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours >= 24) {
      return { text: `⚠️ SLA Breach: >24h`, badgeClass: "bg-red-500/10 text-red-400 border border-red-500/25 font-bold" };
    } else {
      const remaining = Math.max(0, Math.round(24 - diffHours));
      return { text: `SLA: ${remaining}h remaining`, badgeClass: "bg-amber-500/10 text-amber-400 border border-amber-500/25" };
    }
  };

  const filteredAndSortedIncidents = incidents.filter(inc => {
    if (severityFilter !== "All" && inc.severity !== severityFilter) {
      return false;
    }
    if (statusFilter !== "All" && inc.status !== statusFilter) {
      return false;
    }
    const incDateStr = inc.incidentDate.substring(0, 10);
    if (startDateFilter && incDateStr < startDateFilter) {
      return false;
    }
    if (endDateFilter && incDateStr > endDateFilter) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "Newest") {
      return new Date(b.incidentDate).getTime() - new Date(a.incidentDate).getTime();
    } else if (sortBy === "Oldest") {
      return new Date(a.incidentDate).getTime() - new Date(b.incidentDate).getTime();
    } else if (sortBy === "Severity") {
      const severityWeight: Record<string, number> = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
      const weightA = severityWeight[a.severity] || 0;
      const weightB = severityWeight[b.severity] || 0;
      return weightB - weightA;
    }
    return 0;
  });

  return (
    <div className="role-console-container space-y-6" id="role-console-workspace">
      
      {/* Top Level Master Control Bar (Severity, Status and Real-time Date Range Picker) */}
      <div className="bg-[#0A0E1A] border border-white/10 p-4 rounded-xl shadow-md space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#FFD600]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Interactive Incident Live Filter Control
            </h4>
          </div>
          {(severityFilter !== "All" || statusFilter !== "All" || startDateFilter !== "" || endDateFilter !== "" || sortBy !== "Newest") && (
            <button
              onClick={() => {
                setSeverityFilter("All");
                setStatusFilter("All");
                setStartDateFilter("");
                setEndDateFilter("");
                setSortBy("Newest");
              }}
              className="text-[10px] text-rose-400 hover:text-rose-350 font-semibold uppercase tracking-wider transition bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20"
              id="clear-all-top-filters"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 font-mono mb-1">
              Severity Level
            </label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full bg-[#05080F] border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600] font-medium"
              id="top-filter-severity"
            >
              <option value="All">All Severities</option>
              <option value="Critical">⚠️ Critical</option>
              <option value="High">🟠 High</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Low">🔵 Low</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 font-mono mb-1">
              Investigation Phase
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#05080F] border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600] font-medium"
              id="top-filter-status"
            >
              <option value="All">All Statuses</option>
              <option value="Reported">Reported</option>
              <option value="Investigating">Investigating</option>
              <option value="Contained">Contained</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 font-mono mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-full bg-[#05080F] border border-white/10 rounded px-2.5 py-1.5 text-xs text-[#FFD600] focus:outline-none focus:border-[#FFD600] font-mono font-medium"
              id="top-filter-start-date"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 font-mono mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="w-full bg-[#05080F] border border-white/10 rounded px-2.5 py-1.5 text-xs text-[#FFD600] focus:outline-none focus:border-[#FFD600] font-mono font-medium"
              id="top-filter-end-date"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 font-mono mb-1">
              Order Sorting Sequence
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-[#05080F] border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFD600] font-medium"
              id="top-filter-sort"
            >
              <option value="Newest">Newest First</option>
              <option value="Oldest">Oldest First</option>
              <option value="Severity">Severity Priority</option>
            </select>
          </div>
        </div>
      </div>

      {/* Role Selection bar */}
      <div className="bg-[#0A0E1A] border border-white/10 p-4 rounded-xl shadow-md">
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2.5">
          Select Active Operator View Node:
        </label>
        <div className="flex flex-row overflow-x-auto gap-2 pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent snap-x">
          {ROLES.map(role => (
            <button
              key={role.id}
              onClick={() => {
                setSelectedRole(role.id);
                setSelectedIncident(null);
              }}
              className={`snap-start shrink-0 w-[260px] sm:w-auto sm:flex-1 text-left px-4 py-3 rounded-lg border transition ${
                selectedRole === role.id
                  ? "bg-[#FFD600]/15 text-[#FFD600] border-[#FFD600]/40 shadow-sm"
                  : "bg-[#05080F] border-white/10/80 text-slate-400 hover:bg-[#0A0E1A] hover:text-slate-200"
              }`}
              id={`role-btn-${role.id}`}
            >
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">{role.name}</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5">{role.org}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Incident Catalog list */}
        <div className="lg:col-span-7 bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-[#FFD600] rounded-full" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-grotesk">
              Assigned National Threat Log
            </h3>
            <span className="ml-auto text-[10px] font-mono text-slate-500">{filteredAndSortedIncidents.length} threat(s)</span>
          </div>

          {/* Bulk Action Toolbar — hidden in read-only mode */}
          {!readOnly && (
          <div className="mb-4 p-3 bg-[#05080F] rounded-xl border border-white/10/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Select all incidents"
                checked={filteredAndSortedIncidents.length > 0 && filteredAndSortedIncidents.every(inc => bulkSelectedIds.includes(inc.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    const allIds = filteredAndSortedIncidents.map(inc => inc.id);
                    setBulkSelectedIds(prev => Array.from(new Set([...prev, ...allIds])));
                  } else {
                    const allIds = filteredAndSortedIncidents.map(inc => inc.id);
                    setBulkSelectedIds(prev => prev.filter(id => !allIds.includes(id)));
                  }
                }}
                className="w-4 h-4 rounded border-slate-705 bg-[#0A0E1A] hover:border-[#FFD600] text-[#FFD600] focus:ring-[#FFD600]/40/25 cursor-pointer"
                id="select-all-checkbox"
              />
              <span className="text-xs font-mono font-semibold text-slate-400">
                {bulkSelectedIds.length} Selected
              </span>
            </div>

            {bulkSelectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 animate-fade-in/10">
                <button
                  type="button"
                  onClick={() => handleBulkStatusUpdate("Resolved")}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1 bg-[#FFD600]/15 hover:bg-[#FFD600] border border-[#FFD600]/30 text-[#FFD600] hover:text-slate-100 text-[10px] uppercase font-bold py-1 px-2.5 rounded transition disabled:opacity-50"
                  id="bulk-resolve-btn"
                >
                  <Check className="w-3 h-3" /> Resolve Selected
                </button>
                
                <button
                  type="button"
                  onClick={() => handleBulkStatusUpdate("Contained")}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 text-rose-400 hover:text-slate-100 text-[10px] uppercase font-bold py-1 px-2.5 rounded transition disabled:opacity-50"
                  id="bulk-contain-btn"
                >
                  <AlertTriangle className="w-3 h-3" /> Contain Selected
                </button>

                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1 bg-rose-950/30 hover:bg-rose-800 border border-rose-800/50 text-rose-400 hover:text-slate-100 text-[10px] uppercase font-bold py-1 px-2.5 rounded transition disabled:opacity-50"
                  id="bulk-delete-btn"
                >
                  <Trash2 className="w-3 h-3" /> Delete Selected
                </button>

                <button
                  type="button"
                  onClick={() => setBulkSelectedIds([])}
                  className="text-[10px] text-slate-500 hover:text-slate-350 underline decoration-dotted font-medium ml-1"
                >
                  Deselect all
                </button>
              </div>
            )}
          </div>
          )}

          <div className="bg-[#05080F] border border-white/10/80 rounded-xl overflow-hidden flex-1 max-h-[500px] overflow-y-auto">
            {incidents.length === 0 ? (
              <div className="p-8 text-center text-slate-600 text-xs font-sans">
                No threats reported in database.
              </div>
            ) : filteredAndSortedIncidents.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-sans flex flex-col items-center justify-center gap-3">
                <span className="text-slate-600">No threats match the active filters.</span>
                <button
                  type="button"
                  onClick={() => {
                    setSeverityFilter("All");
                    setStatusFilter("All");
                    setStartDateFilter("");
                    setEndDateFilter("");
                    setSortBy("Newest");
                  }}
                  className="px-3 py-1 bg-[#0A0E1A] hover:bg-slate-800 border border-white/10 text-[#FFD600] font-semibold rounded text-[11px] transition"
                  id="btn-clear-filters"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-900">
                {filteredAndSortedIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className={`p-4 transition cursor-pointer text-left flex items-start gap-3.5 ${
                      selectedIncident?.id === inc.id
                        ? "bg-[#FFD600]/5 border-l-4 border-[#FFD600]"
                        : "hover:bg-[#0A0E1A]/60 border-l-4 border-transparent"
                    }`}
                  >
                    {/* Multi-Selection Checkbox block */}
                    <div 
                      className="pt-1.5 shrink-0" 
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select incident ${inc.id}`}
                        checked={bulkSelectedIds.includes(inc.id)}
                        onChange={() => handleToggleSelect(inc.id)}
                        className="w-4 h-4 rounded border-white/10 bg-[#05080F] hover:border-[#FFD600] text-[#FFD600] focus:ring-[#FFD600]/40/20 cursor-pointer"
                      />
                    </div>

                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => handleSelectIncident(inc)}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-300">{inc.id}</span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.2 rounded-full ${getStatusBadge(inc.status)}`}>
                          {inc.status}
                        </span>
                        <span className={`text-[9px] px-1.5 rounded font-mono ${getSeverityBadge(inc.severity)}`}>
                          {inc.severity}
                        </span>
                        <span className={`text-[9px] px-1.5 rounded font-mono ${getSlaInfo(inc).badgeClass}`}>
                          {getSlaInfo(inc).text}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-100 truncate">{inc.title}</h4>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                        <span className="truncate max-w-[125px]">{inc.reporterOrg}</span>
                        <span>•</span>
                        <span>{new Date(inc.incidentDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ChevronRight 
                      className="w-4 h-4 text-slate-600 shrink-0 self-center" 
                      onClick={() => handleSelectIncident(inc)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Threat Command & Forensics Desk */}
        <div className="lg:col-span-5">
          {selectedIncident ? (
            <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 shadow-lg space-y-4">
              
              {/* Header */}
              <div className="border-b border-white/10 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-sm font-bold text-[#FFD600]">{selectedIncident.id}</span>
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${getStatusBadge(selectedIncident.status)}`}>
                    {selectedIncident.status}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 leading-snug">{selectedIncident.title}</h3>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Reported by: <span className="text-slate-300 font-medium">{selectedIncident.reporterName}</span> ({selectedIncident.reporterOrg})
                </span>
              </div>

              {/* General details */}
              <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1 text-xs">
                
                {/* Cybersecurity Bill 2024 compliance SLA check */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${getSlaInfo(selectedIncident).badgeClass}`}>
                  <div>
                    <span className="text-[10px] uppercase font-bold block mb-0.5">National Cybersecurity Reporting Compliance</span>
                    <span className="text-[10px] font-sans text-slate-300">
                      {selectedIncident.status === "Reported" 
                        ? "Under Malawi Cybersecurity Bill 2024, incidents must be triaged within 24 hours of reporting."
                        : "SLA compliance target successfully met. Incident has progressed in the security operations queue."
                      }
                    </span>
                  </div>
                  <span className="text-[10px] font-bold font-mono uppercase whitespace-nowrap px-2 py-1 bg-[#05080F]/50 rounded border border-white/5 shrink-0 ml-2">
                    {getSlaInfo(selectedIncident).text}
                  </span>
                </div>

                <div className="bg-[#05080F]/60 p-3 rounded-lg border border-white/10/80">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Raw Core Incident Narrative</span>
                  <p className="text-slate-300 font-sans leading-relaxed whitespace-pre-line text-[11px]">{selectedIncident.description}</p>
                </div>

                {/* AI technical Deep Dive */}
                <div className="bg-[#FFD600]/5 border border-[#FFD600]/15 p-3 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-[#FFD600] block mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> AI Technical Extraction Summary
                  </span>
                  <p className="text-slate-300 font-sans leading-relaxed text-[11px]">{selectedIncident.analysisSummary}</p>
                </div>

                {/* Compromised items indicators lookup */}
                {((selectedIncident.compromisedIndicators.phoneNumbers?.some(n => n !== "N/A") ||
                  selectedIncident.compromisedIndicators.ips?.some(i => i !== "N/A") ||
                  selectedIncident.compromisedIndicators.domains?.some(d => d !== "N/A"))) && (
                  <div className="bg-[#05080F]/60 p-3 rounded-lg border border-white/10/80 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Identified Indicators (Compromise Vectors)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedIncident.compromisedIndicators.phoneNumbers.map((num, i) => num !== "N/A" && (
                        <span key={i} className="bg-[#0A0E1A] border border-white/10 text-rose-300 px-2 py-0.5 rounded font-mono text-[10px] flex items-center gap-1">
                          <Smartphone className="w-3 h-3 text-rose-400" /> {num}
                        </span>
                      ))}
                      {selectedIncident.compromisedIndicators.ips.map((ip, i) => ip !== "N/A" && (
                        <span key={i} className="bg-[#0A0E1A] border border-white/10 text-blue-300 px-2 py-0.5 rounded font-mono text-[10px] flex items-center gap-1">
                          <Activity className="w-3 h-3 text-blue-400" /> {ip}
                        </span>
                      ))}
                      {selectedIncident.compromisedIndicators.domains.map((dom, i) => dom !== "N/A" && (
                        <span key={i} className="bg-[#0A0E1A] border border-white/10 text-purple-300 px-2 py-0.5 rounded font-mono text-[10px] flex items-center gap-1">
                          <Globe className="w-3 h-3 text-purple-400" /> {dom}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline status track updates */}
                {selectedIncident.updates && selectedIncident.updates.length > 0 && (
                  <div className="bg-[#05080F]/60 p-3 rounded-lg border border-white/10/80 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> Investigation Chronology ({selectedIncident.updates.length})
                    </span>
                    <div className="space-y-1.5 divide-y divide-slate-800/60">
                      {selectedIncident.updates.map((up) => (
                        <div key={up.id} className="pt-1.5 first:pt-0">
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-[#FFD600] font-bold">{up.author}</span>
                            <span className="text-slate-500 font-mono">{new Date(up.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-300 font-sans text-[11px] leading-relaxed italic">"{up.message}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SADC advisory guidelines generated by system */}
                <div className="border border-white/10 bg-[#05080F]/20 p-3 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Defense Containment Guidelines</span>
                  <p className="text-slate-300 font-sans leading-relaxed text-[11px] whitespace-pre-line">{selectedIncident.mitigationAdvice}</p>
                </div>
              </div>

              {/* ACTION COMMAND PAD FORM — hidden in read-only mode */}
              {!readOnly ? (
              <form onSubmit={handleApplyAction} className="bg-[#05080F]/80 p-4 border border-white/10 rounded-xl space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-[#FFD600]" /> Command Actions Node
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assign Specialist</label>
                    <select
                      value={activeInvestigator}
                      onChange={(e) => setActiveInvestigator(e.target.value)}
                      className="w-full bg-[#0A0E1A] border border-white/10 rounded text-[11px] p-1.5 text-slate-200 focus:outline-none focus:border-[#FFD600]"
                    >
                      <option value="">-- No Investigator --</option>
                      {CONST_INVESTIGATORS.map((inv, idx) => (
                        <option key={idx} value={inv}>{inv}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Transition Phase</label>
                    <select
                      value={activeStatus}
                      onChange={(e) => setActiveStatus(e.target.value as IncidentStatus)}
                      className="w-full bg-[#0A0E1A] border border-white/10 rounded text-[11px] p-1.5 text-slate-200 focus:outline-none focus:border-[#FFD600]"
                    >
                      <option value="Reported">Reported</option>
                      <option value="Investigating">Investigating</option>
                      <option value="Contained">Contained</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Incident Update Log Message</label>
                  <textarea
                    rows={2}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Provide professional technical updates, e.g. Banned telephone nodes or resolved DNS servers."
                    className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600] focus:outline-none rounded text-[11px] p-1.5 text-slate-200 resize-none font-sans"
                    required
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-[10px] text-slate-500">
                    Logger: <span className="text-[#FFD600] font-bold">{authorName || "Guest"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onAiAnalyze && (
                      <button
                        type="button"
                        onClick={() => onAiAnalyze(selectedIncident.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFD600]/10 hover:bg-[#FFD600]/20 border border-[#FFD600]/30 text-[#FFD600] rounded text-[11px] font-bold transition"
                        id="ai-analyze-incident-btn"
                      >
                        <Brain className="w-3.5 h-3.5" /> Ask AI
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={updating}
                      className="btn-accent px-4 py-1.5 rounded text-[11px] font-bold shadow-md transition active:translate-y-0.5 shrink-0 disabled:opacity-50"
                      id="apply-action-btn"
                    >
                      {updating ? "Processing..." : "Commit Update"}
                    </button>
                  </div>
                </div>
              </form>
              ) : (
                <div className="bg-slate-500/5 border border-slate-500/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-500 font-mono">👁 Auditor view — actions disabled. Contact a SOC Manager to make changes.</p>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-[#0A0E1A]/50 border border-white/10/60 rounded-xl p-12 text-center text-slate-500 border-dashed" id="no-incident-selected-box">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Threat Command Terminal</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                Toggle a specific incident on the left monitor to analyze raw evidence, extract compromise vectors via AI and trigger containment.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
