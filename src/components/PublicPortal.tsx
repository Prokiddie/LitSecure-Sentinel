import React, { useState, useEffect } from "react";
import {
  Shield, BookOpen, FileText, AlertTriangle,
  CheckCircle, Clock, LogOut, User,
  ChevronRight, ExternalLink, Phone,
  Globe, Bell, Megaphone, Lock, Eye,
  ArrowRight, Zap, Heart
} from "lucide-react";
import { LitSecureWordmark } from "./LitSecureLogo";
import ReportForm from "./ReportForm";
import CyberAwarenessHub from "./CyberAwarenessHub";

interface PublicPortalProps {
  user: { id: string; name: string; email: string; role: string };
  token: string;
  onLogout: () => void;
  onIncidentAdded?: (inc: any) => void;
}

type PortalTab = "report" | "awareness" | "my-reports";

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  Open:          { badge: "text-blue-400 bg-blue-500/10 border-blue-500/25",         dot: "bg-blue-400" },
  Investigating: { badge: "text-orange-400 bg-orange-500/10 border-orange-500/25",   dot: "bg-orange-400 animate-pulse" },
  Contained:     { badge: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",      dot: "bg-[#FFD600]" },
  Resolved:      { badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",dot: "bg-emerald-400" },
  Closed:        { badge: "text-slate-400 bg-slate-500/10 border-slate-500/25",      dot: "bg-slate-400" },
};

const TIPS = [
  { icon: Lock,      color: "text-red-400",     title: "Never share OTPs",        body: "MACRA and banks will NEVER ask for your OTP, PIN or password via phone or SMS." },
  { icon: Eye,       color: "text-blue-400",    title: "Check URLs carefully",    body: "Always verify website addresses. Fake sites copy legitimate ones to steal your data." },
  { icon: Bell,      color: "text-[#FFD600]",   title: "Report suspicious calls", body: "If a caller claims to be from MRA, TNM, Airtel or a bank asking for money — hang up and report." },
  { icon: Shield,    color: "text-emerald-400", title: "Use strong passwords",    body: "Use different passwords for each account. Enable two-factor authentication where available." },
  { icon: Megaphone, color: "text-orange-400",  title: "Spread awareness",        body: "Tell your family and community about common cyber scams. Awareness is our strongest defense." },
];

const QUICK_LINKS = [
  { icon: Phone, label: "MACERT Hotline",    value: "+265 (0) 111 789 101", badge: "24/7", color: "text-[#FFD600]" },
  { icon: Phone, label: "Police Cybercrime", value: "+265 (0) 111 789 222", badge: "CID",  color: "text-blue-400" },
  { icon: Globe, label: "MACRA Consumer",    value: "+265 (0) 177",         badge: "FREE", color: "text-emerald-400" },
];

function MyReports({ token, userName }: { token: string; userName: string }) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/incidents", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        // Filter to reports submitted by this user (match by name)
        const mine = data.filter(i =>
          (i.reporterName || "").toLowerCase().includes(userName.toLowerCase()) ||
          (i.reporterOrg  || "").toLowerCase().includes(userName.toLowerCase())
        );
        setIncidents(mine);
      })
      .catch(() => setIncidents([]))
      .finally(() => setLoading(false));
  }, [token, userName]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-white/5 bg-white/2 p-5 animate-pulse h-28" />)}
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="text-center py-16 text-slate-600">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-sm font-mono">No reports submitted yet</p>
        <p className="text-xs text-slate-700 mt-1">Your submitted incident reports will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {incidents.map(inc => {
        const st = STATUS_STYLE[inc.status] || STATUS_STYLE["Open"];
        return (
          <div key={inc.id} className="rounded-2xl border border-white/8 bg-[#05080F]/60 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <code className="text-[9px] font-mono text-slate-500">{inc.id}</code>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono flex items-center gap-1 ${st.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {inc.status}
                  </span>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono ${
                    inc.severity === "Critical" ? "text-red-400 border-red-500/25 bg-red-500/10" :
                    inc.severity === "High"     ? "text-orange-400 border-orange-500/25 bg-orange-500/10" :
                    "text-slate-400 border-slate-500/20 bg-slate-500/5"
                  }`}>{inc.severity}</span>
                </div>
                <h4 className="text-sm font-bold text-white leading-snug">{inc.title}</h4>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(inc.incidentDate || inc.created_at).toLocaleDateString()}</span>
              <span>{inc.category}</span>
            </div>
            {inc.mitigationAdvice && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2">
                <p className="text-[10px] text-emerald-400 font-bold mb-0.5">MACRA Guidance</p>
                <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{inc.mitigationAdvice}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PublicPortal({ user, token, onLogout, onIncidentAdded }: PublicPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>("report");
  const [reportCount, setReportCount] = useState(0);

  const tabs: { id: PortalTab; icon: React.ElementType; label: string }[] = [
    { id: "report",    icon: Shield,   label: "Report Cyber Crime" },
    { id: "awareness", icon: BookOpen, label: "Cyber Awareness Hub" },
    { id: "my-reports",icon: FileText, label: "My Reports" },
  ];

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-100 flex flex-col">

      {/* ─── Top Nav (Citizen-edition) ─── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#05080F]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center gap-4 px-5 h-[56px]">
          <LitSecureWordmark size="sm" showSubtitle={false} className="shrink-0" />

          {/* Tabs */}
          <nav className="flex items-center gap-1 ml-2 overflow-x-auto flex-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`citizen-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded transition whitespace-nowrap border-b-2 ${
                    active
                      ? "text-emerald-400 border-emerald-400 bg-emerald-500/5"
                      : "text-slate-400 border-transparent hover:text-slate-200 hover:border-white/20"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: user + logout */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-500/30 bg-emerald-500/5 text-[10px] font-mono text-emerald-400">
              <User className="w-3 h-3" />
              <span className="hidden sm:inline">{user.name.split(" ")[0]}</span>
              <span className="opacity-60">(citizen)</span>
            </div>
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold btn-accent">
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">LOGOUT</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero Banner ─── */}
      {activeTab === "report" && (
        <div className="relative overflow-hidden hero-globe" style={{ height: "220px" }}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#05080F]/30 via-[#05080F]/10 to-[#05080F]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#05080F]/80 to-transparent" />
          <div className="relative z-10 max-w-5xl mx-auto px-5 pt-8">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-[10px] font-mono font-bold tracking-widest uppercase">PUBLIC REPORTING PORTAL</span>
            </div>
            <h1 className="font-bebas text-[42px] leading-none text-white mb-2 tracking-wide">
              REPORT A <span className="text-emerald-400">CYBER CRIME</span>
            </h1>
            <p className="text-slate-300 text-sm max-w-lg font-grotesk leading-relaxed">
              Submit your report confidentially. Our security team will investigate and provide guidance within 24–48 hours.
            </p>
            <div className="flex items-center gap-6 mt-4">
              {[
                { val: "Secure",       label: "Encrypted Submission" },
                { val: "Confidential", label: "Your data is protected" },
                { val: "24–48hr",      label: "Response time" },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-sm font-bold text-emerald-400 font-bebas text-lg">{s.val}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-5 py-6">

        {/* ──── REPORT TAB ──── */}
        {activeTab === "report" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <ReportForm onIncidentAdded={(inc) => {
                setReportCount(c => c + 1);
                if (onIncidentAdded) onIncidentAdded(inc);
              }} />
            </div>
            <div className="lg:col-span-4 space-y-4">

              {/* Quick tips */}
              <div className="rounded-2xl border border-white/8 bg-[#05080F]/60 p-5">
                <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
                  <div className="w-1 h-4 bg-[#FFD600] rounded" />
                  Cyber Safety Tips
                </h4>
                <div className="space-y-3">
                  {TIPS.slice(0, 3).map(tip => {
                    const Icon = tip.icon;
                    return (
                      <div key={tip.title} className="flex gap-3">
                        <div className={`mt-0.5 shrink-0 ${tip.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-200">{tip.title}</p>
                          <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">{tip.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => setActiveTab("awareness")}
                  className="mt-3 pt-3 border-t border-white/5 w-full flex items-center gap-1.5 text-[10px] text-emerald-400 hover:text-emerald-300 font-mono font-bold transition"
                >
                  <BookOpen className="w-3 h-3" /> View full Cyber Awareness Hub <ChevronRight className="w-3 h-3 ml-auto" />
                </button>
              </div>

              {/* Emergency contacts */}
              <div className="rounded-2xl border border-white/8 bg-[#05080F]/60 p-5">
                <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
                  <div className="w-1 h-4 bg-red-400 rounded" />
                  Emergency Contacts
                </h4>
                <div className="space-y-3">
                  {QUICK_LINKS.map(link => {
                    const Icon = link.icon;
                    return (
                      <div key={link.label} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${link.color}`} />
                          <div>
                            <p className="text-[10px] font-bold text-slate-300 font-mono">{link.label}</p>
                            <p className={`text-[11px] font-mono font-bold ${link.color}`}>{link.value}</p>
                          </div>
                        </div>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border font-mono ${link.color} border-current bg-current/5`}>{link.badge}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* What happens next */}
              <div className="rounded-2xl border border-[#FFD600]/15 bg-[#FFD600]/3 p-5">
                <h4 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
                  <Zap className="w-4 h-4 text-[#FFD600]" /> What Happens Next
                </h4>
                <div className="space-y-3">
                  {[
                    { step: "1", label: "Automated triage",    body: "AI extracts indicators and classifies your report" },
                    { step: "2", label: "MACERT review",       body: "Our team reviews and assigns an investigator" },
                    { step: "3", label: "Investigation",       body: "Active investigation with law enforcement if needed" },
                    { step: "4", label: "Resolution guidance", body: "You receive expert cybersecurity advice" },
                  ].map(s => (
                    <div key={s.step} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center shrink-0 text-[9px] font-bold text-[#FFD600] font-mono">{s.step}</div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-200">{s.label}</p>
                        <p className="text-[9px] text-slate-500 leading-relaxed">{s.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ──── AWARENESS HUB TAB ──── */}
        {activeTab === "awareness" && <CyberAwarenessHub />}

        {/* ──── MY REPORTS TAB ──── */}
        {activeTab === "my-reports" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/8 bg-[#05080F]/60 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-grotesk font-bold text-white text-base">My Submitted Reports</h3>
                  <p className="text-slate-500 text-xs mt-0.5 font-mono">Reports you've submitted to MACERT</p>
                </div>
                <button
                  onClick={() => setActiveTab("report")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold hover:bg-emerald-500/15 transition"
                >
                  <Shield className="w-3.5 h-3.5" /> New Report <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            <MyReports token={token} userName={user.name} />
          </div>
        )}

      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 bg-[#05080F] px-5 py-3 text-[10px] text-slate-600 font-mono">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Heart className="w-3 h-3 text-red-500/60" />
            <span>LitSecure Sentinel Public Portal • Protecting Malawi's Digital Citizens</span>
          </div>
          <div className="flex items-center gap-4">
            <span>MACRA SEC-80B</span>
            <span>MACERT: 112</span>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SECURE CONNECTION
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
