/**
 * LitSecure Sentinel — MFA Setup Panel
 *
 * User-facing component for enrolling, confirming, and disabling
 * TOTP multi-factor authentication.
 *
 * Flow: Setup → QR Scan → Confirm OTP → Active
 */
import React, { useState } from "react";
import {
  Shield, Smartphone, CheckCircle, AlertTriangle, Copy,
  Eye, EyeOff, Key, RefreshCw, X, ChevronRight, Lock
} from "lucide-react";

interface Props {
  userId:     string;
  userEmail:  string;
  mfaEnabled: boolean;
  onMfaChange?: (enabled: boolean) => void;
}

type Step = "idle" | "setup" | "confirm" | "done" | "disable";

export default function MfaSetupPanel({ userId, userEmail, mfaEnabled, onMfaChange }: Props) {
  const [step,       setStep]       = useState<Step>("idle");
  const [qrDataUrl,  setQrDataUrl]  = useState("");
  const [manualKey,  setManualKey]  = useState("");
  const [otp,        setOtp]        = useState("");
  const [showManual, setShowManual] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [copied,     setCopied]     = useState(false);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  // ── Step 1: Initiate Setup ────────────────────────────────────────────────
  const startSetup = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/auth/mfa/setup", { method: "POST", headers: authH() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Setup failed");
      setQrDataUrl(d.qrDataUrl);
      setManualKey(d.manualKey);
      setStep("setup");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Step 2: Confirm first OTP ─────────────────────────────────────────────
  const confirmOtp = async () => {
    if (!/^\d{6}$/.test(otp)) { setError("Enter a 6-digit code."); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/auth/mfa/confirm", {
        method:  "POST",
        headers: authH(),
        body:    JSON.stringify({ token: otp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Invalid code");
      setStep("done");
      onMfaChange?.(true);
    } catch (e: any) { setError(e.message); setOtp(""); }
    finally { setLoading(false); }
  };

  // ── Disable MFA ───────────────────────────────────────────────────────────
  const disableMfa = async () => {
    if (!/^\d{6}$/.test(otp)) { setError("Enter your current 6-digit code to confirm."); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/auth/mfa/disable", {
        method:  "POST",
        headers: authH(),
        body:    JSON.stringify({ token: otp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Invalid code");
      setStep("idle"); setOtp("");
      onMfaChange?.(false);
    } catch (e: any) { setError(e.message); setOtp(""); }
    finally { setLoading(false); }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(manualKey.replace(/\s/g, ""));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const resetState = () => { setStep("idle"); setOtp(""); setError(""); setQrDataUrl(""); setManualKey(""); };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(10,14,26,0.85)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${mfaEnabled ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-orange-500/15 border border-orange-500/30"}`}>
          <Shield className={`w-4 h-4 ${mfaEnabled ? "text-emerald-400" : "text-orange-400"}`} />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Multi-Factor Authentication</p>
          <p className="text-[10px] text-slate-500 font-mono">TOTP • Google Authenticator / Authy compatible</p>
        </div>
        <div className="ml-auto">
          <span className={`text-[9px] font-bold font-mono px-2 py-1 rounded border uppercase ${mfaEnabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-orange-500/15 text-orange-400 border-orange-500/30"}`}>
            {mfaEnabled ? "● ENABLED" : "○ DISABLED"}
          </span>
        </div>
      </div>

      <div className="p-5">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-[11px] text-red-300">{error}</p>
            <button onClick={() => setError("")} className="ml-auto text-red-500 hover:text-red-300"><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* ── IDLE: show status + action button ─────────────────── */}
        {step === "idle" && !mfaEnabled && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-xl bg-orange-500/8 border border-orange-500/15">
              <p className="text-xs text-orange-300 font-semibold mb-1">⚠️ MFA Not Enabled</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your account is protected by password only. Enable TOTP multi-factor authentication to significantly increase security and meet compliance requirements.
              </p>
            </div>
            <button id="mfa-enable-btn" onClick={startSetup} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FFD600] text-black text-sm font-bold hover:bg-[#FFE033] transition disabled:opacity-60">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              Enable MFA
            </button>
          </div>
        )}

        {step === "idle" && mfaEnabled && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
              <p className="text-xs text-emerald-300 font-semibold mb-1">✅ MFA Active</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your account requires a 6-digit TOTP code from your authenticator app on every login. This significantly reduces unauthorized access risk.
              </p>
            </div>
            <button id="mfa-disable-btn" onClick={() => { setStep("disable"); setOtp(""); setError(""); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/10 transition">
              <Lock className="w-3.5 h-3.5" /> Disable MFA
            </button>
          </div>
        )}

        {/* ── SETUP: show QR code ────────────────────────────────── */}
        {step === "setup" && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold text-white mb-1">Step 1 — Scan QR Code</p>
              <p className="text-[10px] text-slate-500">Open your authenticator app and scan this code. Works with Google Authenticator, Authy, 1Password, and Microsoft Authenticator.</p>
            </div>
            {qrDataUrl && (
              <div className="flex justify-center">
                <div className="p-3 rounded-2xl bg-white shadow-xl shadow-black/40">
                  <img src={qrDataUrl} alt="MFA QR Code" className="w-48 h-48 rounded-lg" />
                </div>
              </div>
            )}
            {/* Manual entry toggle */}
            <button onClick={() => setShowManual(s => !s)}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition mx-auto">
              {showManual ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showManual ? "Hide" : "Can't scan? Show"} manual key
            </button>
            {showManual && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-white/8">
                <Key className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <code className="text-[10px] text-[#FFD600] font-mono tracking-widest flex-1">{manualKey}</code>
                <button onClick={copyKey} className="text-slate-500 hover:text-[#FFD600] transition shrink-0">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            <button onClick={() => setStep("confirm")}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FFD600] text-black text-sm font-bold hover:bg-[#FFE033] transition">
              I've scanned the code <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── CONFIRM: enter first OTP ──────────────────────────── */}
        {(step === "confirm" || step === "disable") && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold text-white mb-1">
                {step === "confirm" ? "Step 2 — Verify Setup" : "Confirm Disable MFA"}
              </p>
              <p className="text-[10px] text-slate-500">
                {step === "confirm"
                  ? "Enter the 6-digit code from your authenticator app to activate MFA."
                  : "Enter your current MFA code to confirm. MFA will be disabled after verification."}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                id="mfa-otp-input"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setError(""); }}
                placeholder="000000"
                className="flex-1 bg-slate-800/60 border border-white/15 rounded-xl px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder:text-slate-700 focus:outline-none focus:border-[#FFD600]/50 focus:bg-slate-800"
                onKeyDown={e => e.key === "Enter" && (step === "confirm" ? confirmOtp() : disableMfa())}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={resetState} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-bold hover:bg-white/5 transition">
                Cancel
              </button>
              <button
                id={step === "confirm" ? "mfa-confirm-btn" : "mfa-disable-confirm-btn"}
                onClick={step === "confirm" ? confirmOtp : disableMfa}
                disabled={loading || otp.length !== 6}
                className={`flex-2 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-60 ${
                  step === "confirm"
                    ? "bg-[#FFD600] text-black hover:bg-[#FFE033]"
                    : "bg-red-600 text-white hover:bg-red-500"
                }`}
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : step === "confirm" ? "Activate MFA" : "Disable MFA"}
              </button>
            </div>
          </div>
        )}

        {/* ── DONE: success ─────────────────────────────────────── */}
        {step === "done" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">MFA Activated! 🛡️</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your account now requires a TOTP code from your authenticator app on every login. Keep your app accessible.
              </p>
            </div>
            <button onClick={resetState}
              className="w-full py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
