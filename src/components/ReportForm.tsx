import React, { useState } from "react";
import { ShieldAlert, AlertTriangle, Send, Loader2, CheckCircle, Smartphone, Globe, Activity, Eye } from "lucide-react";
import { Incident } from "../types";

interface ReportFormProps {
  onIncidentAdded: (newIncident: Incident) => void;
}

export default function ReportForm({ onIncidentAdded }: ReportFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [reporterOrg, setReporterOrg] = useState("Public Division");
  const [sector, setSector] = useState("");
  const [affectedUsers, setAffectedUsers] = useState("");
  const [estimatedLoss, setEstimatedLoss] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<Incident | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !reporterName || !reporterContact) {
      setError("Please fill out all required fields.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSubmissionResult(null);

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          reporterName,
          reporterContact,
          reporterOrg,
          sector,
          affectedUsers: affectedUsers ? Number(affectedUsers) : 0,
          estimatedLoss: estimatedLoss ? Number(estimatedLoss) : 0,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to transmit report to LitSecure Sentinel gateway.");
      }

      const freshIncident: Incident = await response.json();
      setSubmissionResult(freshIncident);
      onIncidentAdded(freshIncident);
      
      // Clear inputs
      setTitle("");
      setDescription("");
      setReporterName("");
      setReporterContact("");
      setSector("");
      setAffectedUsers("");
      setEstimatedLoss("");
    } catch (err: any) {
      setError(err?.message || "An unexpected network disruption occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "Critical":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/30";
      case "High":
        return "bg-orange-500/10 text-orange-400 border border-orange-500/30";
      case "Medium":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
      default:
        return "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/30";
    }
  };

  return (
    <div className="glass-form p-7 relative overflow-hidden" id="report-form-card">
      {/* Subtle glow accent */}
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-[#FFD600]/3 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-blue-500/3 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 bg-[#FFD600] rounded-full glow-yellow" />
        <div>
          <h2 className="font-grotesk text-lg font-bold text-white tracking-tight">National Incident Intake Panel</h2>
          <p className="text-xs text-slate-500">Secure pipeline to MACRA Cyber Defense and Police Cybercrime units</p>
        </div>
        <div className="ml-auto p-2 bg-[#FFD600]/10 rounded-lg text-[#FFD600] border border-[#FFD600]/20">
          <ShieldAlert className="w-5 h-5" />
        </div>
      </div>

      {submissionResult ? (
        <div className="bg-[#FFD600]/5 border border-[#FFD600]/20 rounded-xl p-5 mb-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-[#FFD600]/20 rounded-full text-[#FFD600] mt-0.5">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-[#FFD600] md:text-lg font-medium">Incident Intake Verified Successfully!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your report has been received and given a standard unique identifier: <span className="font-mono text-slate-100 bg-slate-800 px-1.5 py-0.5 rounded font-bold border border-slate-700">{submissionResult.id}</span>
              </p>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI Threat Classification Summary</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${getSeverityBadge(submissionResult.severity)}`}>
                    {submissionResult.severity} Severity
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#05080F]/40 border border-white/10 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase block">Inferred Category</span>
                    <span className="text-sm font-medium text-slate-200">{submissionResult.category}</span>
                  </div>
                  <div className="bg-[#05080F]/40 border border-white/10 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase block">State Routing</span>
                    <span className="text-sm font-medium text-slate-200">Incident Registered</span>
                  </div>
                </div>

                <div className="border border-white/10 bg-[#05080F]/30 rounded-lg p-3 text-xs mb-4">
                  <span className="text-[10px] text-slate-400 block font-semibold mb-1 uppercase">AI Automated Technical Analysis</span>
                  <p className="text-slate-300 leading-relaxed font-sans">{submissionResult.analysisSummary}</p>
                </div>

                {/* Extract Indicators */}
                {((submissionResult.compromisedIndicators.phoneNumbers?.some(n => n !== "N/A") ||
                  submissionResult.compromisedIndicators.ips?.some(i => i !== "N/A") ||
                  submissionResult.compromisedIndicators.domains?.some(d => d !== "N/A"))) && (
                  <div className="mb-4">
                    <span className="text-[10px] text-slate-400 block font-semibold mb-1.5 uppercase">Extracted Indicators of Compromise (IOCs)</span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {submissionResult.compromisedIndicators.phoneNumbers.map((num, i) => num !== "N/A" && (
                        <span key={i} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 font-mono flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-[#FFD600]" /> {num}
                        </span>
                      ))}
                      {submissionResult.compromisedIndicators.ips.map((ip, i) => ip !== "N/A" && (
                        <span key={i} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 font-mono flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-blue-400" /> {ip}
                        </span>
                      ))}
                      {submissionResult.compromisedIndicators.domains.map((dom, i) => dom !== "N/A" && (
                        <span key={i} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 font-mono flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-purple-400" /> {dom}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-[#FFD600]/15 bg-[#FFD600]/5 rounded-lg p-3 text-xs mb-1">
                  <span className="text-[10px] text-[#FFD600] block font-semibold mb-1 uppercase">Recommended Action Plan</span>
                  <p className="whitespace-pre-line text-slate-300 leading-relaxed font-sans">{submissionResult.mitigationAdvice}</p>
                </div>
              </div>

              <button
                onClick={() => setSubmissionResult(null)}
                className="btn-accent mt-4 px-5 py-2 rounded text-xs"
                id="report-another-btn"
              >
                LOG ANOTHER INCIDENT
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
            Short, Descriptive Title <span className="text-[#FFD600]">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Bulk SIM swap fraud wave hitting Lilongwe Area 18 Mpamba Merchants"
            className="glass-input w-full px-4 py-3 text-sm"
            id="title-input"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
            Technical Incident Description <span className="text-[#FFD600]">*</span>
          </label>
          <p className="text-[10px] text-slate-500 mb-1 leading-normal italic">
            Tip: Be specific! Include suspect phone numbers (e.g. +265...), fraudulent emails, domains, victim counts or suspicious financial links so our AI system can extract them as network indicators.
          </p>
          <textarea
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain what occurred, chronological order, affected services, specific malicious web links (e.g., fraudportal-mra.online), target numbers used, and physical evidence or symptoms observed."
            className="glass-input w-full px-4 py-3 text-sm resize-none leading-relaxed"
            id="description-input"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
              Reporter Name <span className="text-[#FFD600]">*</span>
            </label>
            <input
              type="text"
              required
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="e.g., Austin Mvalo"
              className="glass-input w-full px-4 py-2.5 text-sm"
              id="reporter-name-input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
              Contact Line <span className="text-[#FFD600]">*</span>
            </label>
            <input
              type="tel"
              required
              value={reporterContact}
              onChange={(e) => setReporterContact(e.target.value)}
              placeholder="e.g., +265 999 12 34 56"
              className="glass-input w-full px-4 py-2.5 text-sm font-mono"
              id="reporter-contact-input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
              Reporting Organization
            </label>
            <select
              value={reporterOrg}
              onChange={(e) => setReporterOrg(e.target.value)}
              className="glass-input w-full px-4 py-2.5 text-sm"
              id="reporter-org-select"
            >
              <option value="Public Citizen">Public Reporting Division</option>
              <option value="Airtel Money MW">Airtel Money Secretariat</option>
              <option value="TNM Mpamba Ltd">TNM Mpamba Ltd</option>
              <option value="Standard Bank MW">Standard Bank Malawi</option>
              <option value="National Bank MW">National Bank of Malawi</option>
              <option value="FDH Bank MW">FDH Bank Group</option>
              <option value="Malawi Government Agency">Malawi Government Ministry</option>
              <option value="Skyband ISP Team">Skyband ISP Team</option>
              <option value="Telecoms (MTL)">Malawi Telecommunications (MTL)</option>
              <option value="Corporate Defense Cell">Private Corporate Unit</option>
            </select>
          </div>
        </div>

        {/* ── Priority Signals (optional) ─────────────────────────────────────── */}
        <div className="border border-[#FFD600]/10 rounded-xl p-4 space-y-3 bg-[#FFD600]/2">
          <p className="text-[10px] font-mono font-bold text-[#FFD600]/70 uppercase tracking-wider">⚡ Priority Signals — Optional but speeds up escalation</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                Affected Sector
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="glass-input w-full px-4 py-2.5 text-sm"
                id="sector-select"
              >
                <option value="">— Not specified —</option>
                <option value="Banking">Banking</option>
                <option value="Telecom">Telecom</option>
                <option value="Government">Government</option>
                <option value="Utilities">Utilities</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Education">Education</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                Est. Users Affected
              </label>
              <input
                type="number"
                min="0"
                value={affectedUsers}
                onChange={(e) => setAffectedUsers(e.target.value)}
                placeholder="e.g. 1500"
                className="glass-input w-full px-4 py-2.5 text-sm font-mono"
                id="affected-users-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                Est. Loss (MWK)
              </label>
              <input
                type="number"
                min="0"
                value={estimatedLoss}
                onChange={(e) => setEstimatedLoss(e.target.value)}
                placeholder="e.g. 5000000"
                className="glass-input w-full px-4 py-2.5 text-sm font-mono"
                id="estimated-loss-input"
              />
            </div>
          </div>
        </div>


        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3 rounded text-sm flex items-center justify-center gap-2 shadow-lg transition duration-200 font-bold tracking-widest uppercase ${
              isSubmitting
                ? "bg-[#0A0E1A] text-slate-500 border border-white/10 cursor-not-allowed"
                : "btn-accent"
            }`}
            id="report-submit-btn"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AI Classification Running...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Transmit Encrypted Threat Report
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
