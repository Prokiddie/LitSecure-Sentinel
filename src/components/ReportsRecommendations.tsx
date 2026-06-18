import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, TrendingUp, AlertTriangle, Shield,
  Download, Loader2, CheckCircle, BarChart3, Globe,
  Bot, Sparkles, RefreshCw, Copy, FileDown
} from "lucide-react";
import jsPDF from "jspdf";

interface Stats {
  totalIncidents: number;
  reportedCount: number;
  investigatingCount: number;
  containedCount: number;
  resolvedCount: number;
  categoryStats: { name: string; value: number }[];
  severityStats: { name: string; value: number }[];
}

const RECOMMENDATIONS = [
  {
    priority: "Critical", sector: "Telecoms (TNM / Airtel)",
    recommendation: "Require biometric ID verification at all SIM swap agent shops before issuing new SIM cards.",
    rationale: "Most SIM swap frauds exploit weak physical ID verification at agent-level points of sale.",
    color: "border-red-500/25 bg-red-500/5", badgeColor: "text-red-400 border-red-500/30 bg-red-500/10",
  },
  {
    priority: "High", sector: "Government Ministries",
    recommendation: "Mandate two-factor authentication on all government portal logins including MRA, MACRA and eGovernment.",
    rationale: "Phishing campaigns targeting government employees succeed primarily when a single password is all that is needed.",
    color: "border-orange-500/25 bg-orange-500/5", badgeColor: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  },
  {
    priority: "High", sector: "Banking Sector",
    recommendation: "Deploy real-time transaction velocity alerts — flag and pause transfers exceeding 1M MWK within 3 minutes.",
    rationale: "Bulk wallet drain attacks move large sums within minutes, making speed-based detection essential.",
    color: "border-orange-500/25 bg-orange-500/5", badgeColor: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  },
  {
    priority: "Medium", sector: "District & Local Councils",
    recommendation: "Disable all legacy SMBv1 file sharing and apply the MS17-010 patch across all council computers immediately.",
    rationale: "The Zomba Council ransomware breach exploited the exact same vulnerability (EternalBlue) used in WannaCry attacks globally.",
    color: "border-[#FFD600]/20 bg-[#FFD600]/5", badgeColor: "text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10",
  },
];

const MITRE_MAPPINGS = [
  { tactic: "Initial Access",    technique: "T1566 — Phishing",         description: "Attackers send fake MRA tax emails to corporate accounts.", incidents: 3 },
  { tactic: "Credential Access", technique: "T1110 — Brute Force",      description: "SSH brute force attacks targeting Malawi Gov Gateway.", incidents: 2 },
  { tactic: "Impact",            technique: "T1486 — Data Encrypted",   description: "Ransomware encrypted payroll files on Zomba Council server.", incidents: 1 },
  { tactic: "Defense Evasion",   technique: "T1078 — Valid Accounts",   description: "SIM swap gives attackers valid credentials on mobile money platforms.", incidents: 4 },
];

export default function ReportsRecommendations() {
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [reportText,  setReportText]  = useState("");
  const [generating,  setGenerating]  = useState(false);
  const [reportError, setReportError] = useState("");
  const [period,      setPeriod]      = useState("monthly");

  const token = () => sessionStorage.getItem("sentinel_token");

  useEffect(() => {
    fetch("/api/incidents/meta/stats", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : null).then(setStats).catch(() => {});
  }, []);

  const generateReport = useCallback(async () => {
    setReportText(""); setReportError(""); setGenerating(true);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token()}` },
        body: JSON.stringify({ period }),
      });
      if (!res.ok) throw new Error("Report generation failed");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.chunk) { full += p.chunk; setReportText(full); }
            if (p.error) setReportError(p.error);
          } catch {}
        }
      }
    } catch (err: any) {
      setReportError(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }, [period]);

  const downloadMarkdown = () => {
    if (!reportText) return;
    const blob = new Blob([reportText], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `LitSecure_Report_${period}_${new Date().toISOString().split("T")[0]}.md`;
    a.click();
  };

  const downloadPDF = () => {
    if (!reportText) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxW = pageW - margin * 2;

    // Header background
    doc.setFillColor(5, 8, 15);
    doc.rect(0, 0, pageW, pageH, "F");

    // Gold header bar
    doc.setFillColor(255, 214, 0);
    doc.rect(0, 0, pageW, 18, "F");

    // Header text
    doc.setFontSize(11);
    doc.setTextColor(5, 8, 15);
    doc.setFont("helvetica", "bold");
    doc.text("LITSECURE SENTINEL — NATIONAL CYBER INCIDENT REPORT", margin, 12);
    doc.setFontSize(7);
    doc.text(`MACRA / MACERT | ${period.toUpperCase()} | ${new Date().toLocaleDateString()}`, pageW - margin, 12, { align: "right" });

    // Body text
    let y = 28;
    doc.setTextColor(200, 210, 230);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const lines = reportText.split("\n");
    for (const rawLine of lines) {
      if (y > pageH - 20) {
        doc.addPage();
        doc.setFillColor(5, 8, 15);
        doc.rect(0, 0, pageW, pageH, "F");
        y = 20;
      }

      const isH1 = rawLine.startsWith("# ");
      const isH2 = rawLine.startsWith("## ");
      const isH3 = rawLine.startsWith("### ");
      const cleanLine = rawLine.replace(/^#+\s*/, "").replace(/\*\*/g, "");

      if (isH1) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 214, 0);
        const wrapped = doc.splitTextToSize(cleanLine, maxW);
        doc.text(wrapped, margin, y); y += wrapped.length * 7 + 3;
      } else if (isH2) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 165, 0);
        const wrapped = doc.splitTextToSize(cleanLine, maxW);
        doc.text(wrapped, margin, y); y += wrapped.length * 6 + 2;
      } else if (isH3) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(180, 200, 230);
        const wrapped = doc.splitTextToSize(cleanLine, maxW);
        doc.text(wrapped, margin, y); y += wrapped.length * 5.5 + 1;
      } else if (rawLine.trim() === "" || rawLine.startsWith("---")) {
        y += 3;
      } else {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(160, 175, 200);
        const wrapped = doc.splitTextToSize(cleanLine, maxW);
        doc.text(wrapped, margin, y); y += wrapped.length * 5 + 1;
      }
    }

    // Footer
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(255, 214, 0); doc.rect(0, pageH - 8, pageW, 8, "F");
      doc.setFontSize(6); doc.setTextColor(5, 8, 15); doc.setFont("helvetica", "bold");
      doc.text(`LitSecure Sentinel v1.4 — MACRA — OFFICIAL REPORT — Page ${i}/${pages}`, margin, pageH - 3);
    }

    doc.save(`LitSecure_Report_${period}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6" id="reports-recommendations">

      {/* ─── Report Generator ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-blue-400 rounded" />
          <Bot className="w-4 h-4 text-purple-400" />
          AI National Cyber Report Generator
          <span className="ml-auto text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">GEMINI POWERED</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Generate an official MACRA/MACERT national cybersecurity report using live Gemini AI. Downloads as a styled PDF.
        </p>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Period selector */}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="glass-form rounded-xl px-3 py-2 text-sm text-white outline-none"
            id="report-period"
          >
            {["weekly", "monthly", "quarterly", "annual"].map(p => (
              <option key={p} value={p} className="bg-[#0A0E1A]">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          <button
            id="generate-report-btn"
            onClick={generateReport}
            disabled={generating}
            className="btn-accent px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "Generating with AI..." : "Generate AI Report"}
          </button>

          {reportText && (
            <>
              <button
                onClick={downloadPDF}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-red-600/80 hover:bg-red-600 text-white transition"
                id="download-pdf-btn"
              >
                <FileDown className="w-4 h-4" /> Download PDF
              </button>
              <button
                onClick={downloadMarkdown}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border border-[#FFD600]/30 text-[#FFD600] hover:bg-[#FFD600]/10 transition"
              >
                <Download className="w-4 h-4" /> Export .md
              </button>
            </>
          )}
        </div>

        {reportError && (
          <div className="text-red-400 text-xs font-mono p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            ⚠ {reportError} — Check your GEMINI_API_KEY
          </div>
        )}

        {generating && !reportText && (
          <div className="flex items-center gap-2 text-purple-400 text-xs font-mono py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gemini is drafting the national report...
          </div>
        )}

        {reportText && (
          <div className="bg-[#030508] border border-white/8 rounded-xl p-4 max-h-96 overflow-y-auto">
            <pre className="text-[10px] font-mono text-slate-400 leading-relaxed whitespace-pre-wrap">{reportText}</pre>
          </div>
        )}
      </div>

      {/* ─── MITRE ATT&CK Mapping ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-purple-400 rounded" />
          MITRE ATT&CK Framework Mapping
        </h3>
        <p className="text-xs text-slate-500">How current Malawi incidents map to the global MITRE adversarial tactics and techniques database.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MITRE_MAPPINGS.map(m => (
            <div key={m.technique} className="bg-[#05080F]/60 border border-white/5 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">{m.tactic.toUpperCase()}</span>
                <span className="text-[9px] font-mono text-[#FFD600]">{m.technique}</span>
                <span className="ml-auto text-lg font-bebas text-white">{m.incidents}</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{m.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Security Recommendations ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-[#FFD600] rounded" />
          Sector-Specific Security Recommendations
        </h3>
        <div className="space-y-3">
          {RECOMMENDATIONS.map((rec, i) => (
            <div key={i} className={`rounded-xl border p-4 space-y-2 ${rec.color}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${rec.badgeColor}`}>{rec.priority}</span>
                <span className="text-xs font-bold text-white">{rec.sector}</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">{rec.recommendation}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed"><span className="text-[#FFD600]">Why: </span>{rec.rationale}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
