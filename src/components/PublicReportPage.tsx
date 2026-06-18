/**
 * LitSecure Sentinel — Pre-Login Public Reporting Page
 *
 * Shown before authentication when the user visits /?report=1 or /#/report.
 * Fully standalone — calls /api/public/report (no JWT required).
 * Citizens can report cyber crimes without creating an account.
 */
import React, { useState } from "react";
import {
  Shield, Send, Loader2, CheckCircle, AlertTriangle,
  Phone, Globe, Activity, Smartphone, Lock, Eye, Bell,
  ChevronLeft, ExternalLink, ArrowRight, Info
} from "lucide-react";
import { LitSecureWordmark } from "./LitSecureLogo";

interface PublicReportPageProps {
  onGoToLogin: () => void;
}

const TIPS = [
  { icon: Lock,  color: "text-red-400",     title: "Never share your OTP",      body: "MACRA, Airtel, TNM or banks will NEVER call you asking for your PIN or OTP." },
  { icon: Eye,   color: "text-blue-400",    title: "Verify URLs carefully",      body: "Always check the web address. Government sites end in .gov.mw." },
  { icon: Bell,  color: "text-[#FFD600]",   title: "Suspicious calls",          body: "If a caller claims to be from MRA or a bank asking for money — hang up and report." },
  { icon: Globe, color: "text-emerald-400", title: "Know the official numbers", body: "MACERT: +265 111 789 101 • Police Cybercrime: +265 111 789 222 • MACRA: 177 (free)" },
];

export default function PublicReportPage({ onGoToLogin }: PublicReportPageProps) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [title,          setTitle]          = useState("");
  const [description,    setDescription]    = useState("");
  const [reporterName,   setReporterName]   = useState("");
  const [reporterContact,setReporterContact] = useState("");
  const [reporterOrg,    setReporterOrg]    = useState("Public Citizen");
  const [sector,         setSector]         = useState("");
  const [affectedUsers,  setAffectedUsers]  = useState("");
  const [estimatedLoss,  setEstimatedLoss]  = useState("");

  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [result,         setResult]         = useState<any | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  // ── Track tab ──────────────────────────────────────────────────────────────
  const [trackId,   setTrackId]   = useState("");
  const [trackData, setTrackData] = useState<any | null>(null);
  const [tracking,  setTracking]  = useState(false);
  const [view,      setView]      = useState<"report" | "track">("report");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !reporterName || !reporterContact) {
      setError("Please fill all required fields.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/public/report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description, reporterName, reporterContact,
          reporterOrg, sector,
          affectedUsers: affectedUsers ? Number(affectedUsers) : 0,
          estimatedLoss: estimatedLoss ? Number(estimatedLoss) : 0,
          source: "Public Web Portal",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Submission failed.");
      setResult(data);
      // reset form
      setTitle(""); setDescription(""); setReporterName(""); setReporterContact("");
      setSector(""); setAffectedUsers(""); setEstimatedLoss("");
    } catch (err: any) {
      setError(err.message || "Unable to submit. Please try again or call MACERT: 112.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackId.trim()) return;
    setTracking(true);
    setTrackData(null);
    try {
      const resp = await fetch(`/api/public/track/${encodeURIComponent(trackId.trim())}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Not found.");
      setTrackData(data);
    } catch (err: any) {
      setTrackData({ error: err.message });
    } finally {
      setTracking(false);
    }
  };

  const sevColor = (sev: string) =>
    sev === "Critical" ? "text-red-400 border-red-500/30 bg-red-500/10" :
    sev === "High"     ? "text-orange-400 border-orange-500/30 bg-orange-500/10" :
    sev === "Medium"   ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                         "text-slate-400 border-slate-500/20 bg-slate-500/5";

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-100 flex flex-col">

      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#05080F]/95 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-5 h-[56px]">
          <LitSecureWordmark size="sm" showSubtitle={false} />
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <button
              onClick={() => setView("report")}
              className={`px-3 py-1.5 rounded text-xs font-bold transition border ${
                view === "report"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Shield className="w-3.5 h-3.5 inline mr-1.5" />Report Crime
            </button>
            <button
              onClick={() => setView("track")}
              className={`px-3 py-1.5 rounded text-xs font-bold transition border ${
                view === "track"
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5 inline mr-1.5" />Track Report
            </button>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button
              onClick={onGoToLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold border border-white/10 text-slate-300 hover:text-white hover:border-white/25 transition"
            >
              <ChevronLeft className="w-3 h-3" />Staff Login
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-emerald-950/20 to-[#05080F] border-b border-white/5">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(52,211,153,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(59,130,246,0.05) 0%, transparent 60%)"
        }} />
        <div className="relative max-w-5xl mx-auto px-5 py-12">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-mono font-bold tracking-widest uppercase">
              MACRA / MACERT — National Cyber Crime Reporting
            </span>
          </div>
          <h1 className="font-bebas text-5xl leading-none text-white mb-3 tracking-wide">
            REPORT A <span className="text-emerald-400">CYBER CRIME</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed mb-6">
            Submit your report confidentially to the Malawi Computer Emergency Response Team (MACERT).
            Our AI system will classify your report and alert the response team immediately.
            <strong className="text-slate-300"> No account required.</strong>
          </p>
          <div className="flex items-center gap-8">
            {[
              { val: "No Login", sub: "Required" },
              { val: "AI Triage", sub: "Instant" },
              { val: "24–48hr", sub: "Response" },
              { val: "Encrypted", sub: "Submission" },
            ].map(s => (
              <div key={s.sub}>
                <div className="text-xl font-bebas text-emerald-400">{s.val}</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-5 py-8">

        {view === "report" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* ── Report Form ── */}
            <div className="lg:col-span-8">
              <div className="rounded-2xl border border-white/8 bg-[#05080F]/60 backdrop-blur-sm p-6">

                {/* Success panel */}
                {result && (
                  <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-5 mb-6 animate-fade-in">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-emerald-400 font-bold mb-1">Report Submitted Successfully!</h3>
                        <p className="text-xs text-slate-400 mb-3">
                          Save your incident ID to track your report:
                          <span className="font-mono text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 ml-2 font-bold">{result.id}</span>
                        </p>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-[#05080F]/60 border border-white/8 rounded-lg p-2.5">
                            <span className="text-[9px] text-slate-500 uppercase block">Severity</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border font-mono ${sevColor(result.severity)}`}>{result.severity}</span>
                          </div>
                          <div className="bg-[#05080F]/60 border border-white/8 rounded-lg p-2.5">
                            <span className="text-[9px] text-slate-500 uppercase block">Category</span>
                            <span className="text-sm text-slate-200 font-medium">{result.category}</span>
                          </div>
                        </div>

                        <div className="bg-[#05080F]/60 border border-white/8 rounded-lg p-3 mb-3">
                          <span className="text-[9px] text-slate-400 uppercase font-bold block mb-1">AI Analysis</span>
                          <p className="text-xs text-slate-300 leading-relaxed">{result.analysisSummary}</p>
                        </div>

                        {result.mitigationAdvice && (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-3">
                            <span className="text-[9px] text-emerald-400 uppercase font-bold block mb-1">Recommended Actions</span>
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{result.mitigationAdvice}</p>
                          </div>
                        )}

                        <button
                          onClick={() => setResult(null)}
                          className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono transition"
                        >
                          <Shield className="w-3.5 h-3.5" /> Submit another report <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Form */}
                {!result && (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-1 h-7 bg-emerald-400 rounded-full" />
                      <div>
                        <h2 className="font-grotesk font-bold text-white text-base">National Incident Intake</h2>
                        <p className="text-xs text-slate-500">Secure pipeline to MACERT — Malawi Cyber Emergency Response Team</p>
                      </div>
                    </div>

                    {error && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />{error}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                        Incident Title <span className="text-emerald-400">*</span>
                      </label>
                      <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. SIM swap fraud targeting Airtel Money in Blantyre"
                        className="glass-input w-full px-4 py-3 text-sm" id="pub-title" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                        Description <span className="text-emerald-400">*</span>
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1 italic">
                        Include phone numbers, website links, dates, and any other specific details. More detail = faster resolution.
                      </p>
                      <textarea required rows={5} value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Describe what happened, when it happened, what numbers or websites were involved, how many people were affected..."
                        className="glass-input w-full px-4 py-3 text-sm resize-none leading-relaxed" id="pub-desc" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                          Your Name <span className="text-emerald-400">*</span>
                        </label>
                        <input type="text" required value={reporterName} onChange={e => setReporterName(e.target.value)}
                          placeholder="e.g. John Banda" className="glass-input w-full px-4 py-2.5 text-sm" id="pub-name" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                          Contact <span className="text-emerald-400">*</span>
                        </label>
                        <input type="text" required value={reporterContact} onChange={e => setReporterContact(e.target.value)}
                          placeholder="+265 999 123 456" className="glass-input w-full px-4 py-2.5 text-sm font-mono" id="pub-contact" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">
                          Organisation
                        </label>
                        <select value={reporterOrg} onChange={e => setReporterOrg(e.target.value)}
                          className="glass-input w-full px-4 py-2.5 text-sm" id="pub-org">
                          <option>Public Citizen</option>
                          <option>Airtel Money MW</option>
                          <option>TNM Mpamba Ltd</option>
                          <option>Standard Bank MW</option>
                          <option>National Bank of Malawi</option>
                          <option>FDH Bank Group</option>
                          <option>Malawi Government Ministry</option>
                          <option>Skyband ISP</option>
                          <option>MTL (Malawi Telecoms)</option>
                          <option>Private Business</option>
                        </select>
                      </div>
                    </div>

                    {/* Priority signals */}
                    <div className="border border-emerald-500/10 rounded-xl p-4 bg-emerald-500/2">
                      <p className="text-[10px] font-mono font-bold text-emerald-400/60 uppercase tracking-wider mb-3">
                        ⚡ Priority Signals — Optional, speeds up escalation
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">Sector</label>
                          <select value={sector} onChange={e => setSector(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 text-sm" id="pub-sector">
                            <option value="">— Not specified —</option>
                            <option>Banking</option><option>Telecom</option><option>Government</option>
                            <option>Healthcare</option><option>Education</option><option>Utilities</option><option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">Est. People Affected</label>
                          <input type="number" min="0" value={affectedUsers} onChange={e => setAffectedUsers(e.target.value)}
                            placeholder="e.g. 500" className="glass-input w-full px-4 py-2.5 text-sm font-mono" id="pub-users" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">Est. Loss (MWK)</label>
                          <input type="number" min="0" value={estimatedLoss} onChange={e => setEstimatedLoss(e.target.value)}
                            placeholder="e.g. 2500000" className="glass-input w-full px-4 py-2.5 text-sm font-mono" id="pub-loss" />
                        </div>
                      </div>
                    </div>

                    <button type="submit" disabled={isSubmitting} id="pub-submit"
                      className={`w-full py-3 rounded text-sm flex items-center justify-center gap-2 font-bold tracking-widest uppercase transition ${
                        isSubmitting ? "bg-[#0A0E1A] text-slate-500 border border-white/10 cursor-not-allowed" : "btn-accent"
                      }`}>
                      {isSubmitting
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> AI Classification Running...</>
                        : <><Send className="w-4 h-4" /> Submit Confidential Report</>}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* ── Sidebar ── */}
            <div className="lg:col-span-4 space-y-4">
              {/* Emergency contacts */}
              <div className="rounded-2xl border border-red-500/15 bg-red-500/3 p-5">
                <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
                  <div className="w-1 h-4 bg-red-400 rounded" />
                  Emergency Contacts
                </h4>
                <div className="space-y-3">
                  {[
                    { label: "MACERT Hotline", value: "+265 111 789 101", badge: "24/7", color: "text-[#FFD600]" },
                    { label: "Police Cybercrime", value: "+265 111 789 222", badge: "CID", color: "text-blue-400" },
                    { label: "MACRA Consumer", value: "177", badge: "FREE", color: "text-emerald-400" },
                  ].map(c => (
                    <div key={c.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className={`w-3.5 h-3.5 ${c.color}`} />
                        <div>
                          <p className="text-[10px] font-bold text-slate-300 font-mono">{c.label}</p>
                          <p className={`text-[11px] font-mono font-bold ${c.color}`}>{c.value}</p>
                        </div>
                      </div>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border font-mono ${c.color} border-current bg-current/5`}>{c.badge}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cyber tips */}
              <div className="rounded-2xl border border-white/8 bg-[#05080F]/60 p-5">
                <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
                  <div className="w-1 h-4 bg-[#FFD600] rounded" />
                  Cyber Safety Tips
                </h4>
                <div className="space-y-3">
                  {TIPS.map(tip => {
                    const Icon = tip.icon;
                    return (
                      <div key={tip.title} className="flex gap-3">
                        <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tip.color}`} />
                        <div>
                          <p className="text-[10px] font-bold text-slate-200">{tip.title}</p>
                          <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">{tip.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* USSD reminder */}
              <div className="rounded-2xl border border-[#FFD600]/15 bg-[#FFD600]/3 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-[#FFD600]" />
                  <span className="text-xs font-bold text-[#FFD600]">No internet? Dial</span>
                </div>
                <div className="font-mono text-2xl font-bold text-white tracking-widest">*860#</div>
                <p className="text-[9px] text-slate-500 mt-1">Available on Airtel & TNM — Free USSD reporting line</p>
              </div>

              {/* Track existing report */}
              <div className="rounded-2xl border border-blue-500/15 bg-blue-500/3 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-blue-400">Track your report</span>
                </div>
                <p className="text-[9px] text-slate-500 mb-2">Have an incident ID? Switch to the Track tab to check status.</p>
                <button onClick={() => setView("track")}
                  className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold font-mono hover:text-blue-300 transition">
                  Go to tracker <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Track View ── */}
        {view === "track" && (
          <div className="max-w-xl mx-auto">
            <div className="rounded-2xl border border-white/8 bg-[#05080F]/60 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-7 bg-blue-400 rounded-full" />
                <div>
                  <h2 className="font-grotesk font-bold text-white text-base">Track Your Report</h2>
                  <p className="text-xs text-slate-500">Enter the Incident ID you received when you submitted your report</p>
                </div>
              </div>

              <form onSubmit={handleTrack} className="flex gap-2 mb-4">
                <input type="text" value={trackId} onChange={e => setTrackId(e.target.value)}
                  placeholder="e.g. LIT-2026-12345"
                  className="glass-input flex-1 px-4 py-3 text-sm font-mono" id="track-id-input" />
                <button type="submit" disabled={tracking}
                  className="btn-accent px-5 py-2.5 rounded text-sm font-bold flex items-center gap-2 whitespace-nowrap">
                  {tracking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  Track
                </button>
              </form>

              {trackData && !trackData.error && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#05080F]/60 border border-white/8 rounded-lg p-3">
                      <span className="text-[9px] text-slate-500 uppercase block">Status</span>
                      <span className="text-sm font-bold text-white">{trackData.status}</span>
                    </div>
                    <div className="bg-[#05080F]/60 border border-white/8 rounded-lg p-3">
                      <span className="text-[9px] text-slate-500 uppercase block">Severity</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border font-mono ${sevColor(trackData.severity)}`}>{trackData.severity}</span>
                    </div>
                  </div>
                  <div className="bg-[#05080F]/60 border border-white/8 rounded-lg p-3">
                    <span className="text-[9px] text-slate-500 uppercase block mb-1">Category</span>
                    <span className="text-sm text-slate-200">{trackData.category}</span>
                  </div>
                  {trackData.mitigationAdvice && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                      <span className="text-[9px] text-emerald-400 uppercase font-bold block mb-1">MACERT Guidance</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{trackData.mitigationAdvice}</p>
                    </div>
                  )}
                </div>
              )}
              {trackData?.error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg">
                  {trackData.error}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 bg-[#05080F] px-5 py-3 text-[10px] text-slate-600 font-mono">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>LitSecure Sentinel Public Portal • MACRA National Cyber Defense</span>
          <div className="flex items-center gap-4">
            <span>MACRA SEC-80B</span>
            <span>MACERT: 112</span>
            <span>USSD: *860#</span>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SECURE
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
