/**
 * LitSecure Sentinel — FloatingReportFAB
 * Item 2: Floating Action Button (bottom-right) that opens the
 * full incident intake form in a glassmorphism modal.
 * Ctrl+N hotkey support. Auto-dismiss on outside click.
 */
import React, { useState, useEffect, useRef } from "react";
import { Plus, X, ShieldAlert } from "lucide-react";
import ReportForm from "./ReportForm";
import { Incident } from "../types";

interface FloatingReportFABProps {
  onIncidentAdded: (inc: Incident) => void;
}

export default function FloatingReportFAB({ onIncidentAdded }: FloatingReportFABProps) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Ctrl+N hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close when content submitted
  const handleAdded = (inc: Incident) => {
    onIncidentAdded(inc);
    // Keep open to show the success state inside the form, then close after delay
    setTimeout(() => setOpen(false), 4000);
  };

  // Click-outside-to-close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) setOpen(false);
  };

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        onClick={() => setOpen(true)}
        title="Report New Incident (Ctrl+N)"
        id="fab-report-incident"
        className={`
          fixed bottom-6 right-6 z-40
          w-14 h-14 rounded-full
          bg-[#FFD600] text-[#05080F]
          flex items-center justify-center
          shadow-[0_0_30px_rgba(255,214,0,0.5)]
          hover:shadow-[0_0_45px_rgba(255,214,0,0.7)]
          hover:scale-110
          active:scale-95
          transition-all duration-200
          ${open ? "opacity-0 pointer-events-none scale-90" : "opacity-100"}
        `}
      >
        <Plus className="w-6 h-6 font-bold" strokeWidth={3} />
        {/* Pulsing ring */}
        <span className="absolute inset-0 rounded-full border-2 border-[#FFD600]/60 animate-ping" />
      </button>

      {/* ── Glassmorphism Modal Overlay ── */}
      {open && (
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(5,8,15,0.80)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {/* Modal panel */}
          <div
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-[#FFD600]/25 shadow-2xl"
            style={{
              background: "rgba(10,14,26,0.95)",
              boxShadow: "0 0 80px rgba(255,214,0,0.12), 0 32px 64px rgba(0,0,0,0.6)",
            }}
          >
            {/* Modal header */}
            <div className="sticky top-0 flex items-center gap-3 px-5 py-4 border-b border-white/8 bg-[#0A0E1A]/90 backdrop-blur-sm z-10">
              <div className="w-8 h-8 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-[#FFD600]" />
              </div>
              <div>
                <div className="font-bebas text-base text-white tracking-widest">
                  NEW INCIDENT REPORT
                </div>
                <div className="text-[9px] font-mono text-slate-500">
                  Secure pipeline · AI-classified · Ctrl+N to toggle
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4">
              <ReportForm onIncidentAdded={handleAdded} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
