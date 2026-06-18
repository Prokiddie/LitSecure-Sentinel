import React, { useState, useEffect } from "react";
import {
  Settings, Shield, Bell, Key, Globe, Phone, Wifi,
  CheckCircle, XCircle, Loader2, AlertTriangle, Lock, Unlock,
  MessageSquare, Radio, Send, RefreshCw, Zap, Signal
} from "lucide-react";
import MfaSetupPanel from "./MfaSetupPanel";

interface LockdownStatus { isLocked: boolean; since?: string; by?: string; }
interface GsmStats { total_reports: number; confirmed_swaps: number; active_alerts: number; }

export default function IntegrationsSettings() {
  const [tab, setTab]             = useState<"gsm" | "mfa" | "lockdown" | "api" | "audit" | "at">("gsm");
  const [lockdown, setLockdown]   = useState<LockdownStatus>({ isLocked: false });
  const [gsmStats, setGsmStats]   = useState<GsmStats | null>(null);
  const [toggling, setToggling]   = useState(false);
  const [feedback, setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [gsmLoading, setGsmLoading] = useState(true);

  const [mfaPhone, setMfaPhone]   = useState("+265 88X XXX XXX");
  const [mfaSaving, setMfaSaving] = useState(false);

  // Africa's Talking state
  const [atStatus, setAtStatus]   = useState<any>(null);
  const [atLoading, setAtLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("+265");
  const [testMsg, setTestMsg]     = useState("LitSecure test message. Malawi cyber security is active.");
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [otpPhone, setOtpPhone]   = useState("+265");
  const [otpCode, setOtpCode]     = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpResult, setOtpResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [otpSent, setOtpSent]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // MFA state for the current user
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaUserId,  setMfaUserId]  = useState("");
  const [mfaEmail,   setMfaEmail]   = useState("");

  useEffect(() => {
    // Load current user's MFA status
    const authH2 = { Authorization: `Bearer ${sessionStorage.getItem("sentinel_token")}` };
    fetch("/api/auth/me", { headers: authH2 as any })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user) { setMfaEnabled(!!d.user.mfa_enabled); setMfaUserId(d.user.id); setMfaEmail(d.user.email); } })
      .catch(() => {});
  }, []);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  const loadStatus = async () => {
    try {
      const [lRes, gRes] = await Promise.all([
        fetch("/api/health/lockdown-status", { headers: authH() }),
        fetch("/api/gsm/stats",             { headers: authH() }),
      ]);
      if (lRes.ok) { const d = await lRes.json(); setLockdown({ isLocked: d.lockdownEnabled, since: d.since, by: d.by }); }
      if (gRes.ok) setGsmStats(await gRes.json());
    } finally { setGsmLoading(false); }
  };

  useEffect(() => { loadStatus(); }, []);

  const loadATStatus = async () => {
    setAtLoading(true);
    try {
      const r = await fetch("/api/at/status", { headers: authH() });
      if (r.ok) setAtStatus(await r.json());
    } catch {} finally { setAtLoading(false); }
  };

  const sendTestSMS = async () => {
    setSmsSending(true); setSmsResult(null);
    try {
      const r = await fetch("/api/at/sms/send", {
        method: "POST", headers: authH(),
        body: JSON.stringify({ to: testPhone, message: testMsg }),
      });
      const d = await r.json();
      setSmsResult({ ok: d.ok, msg: d.message || (d.ok ? "Sent!" : "Failed") });
    } catch (e: any) { setSmsResult({ ok: false, msg: e.message }); }
    finally { setSmsSending(false); }
  };

  const sendTestOTP = async () => {
    setOtpSending(true); setOtpResult(null); setVerifyResult(null);
    try {
      const r = await fetch("/api/at/otp/send", {
        method: "POST", headers: authH(),
        body: JSON.stringify({ phone: otpPhone, purpose: "test" }),
      });
      const d = await r.json();
      setOtpResult({ ok: d.ok, msg: d.message });
      if (d.ok) setOtpSent(true);
    } catch (e: any) { setOtpResult({ ok: false, msg: e.message }); }
    finally { setOtpSending(false); }
  };

  const verifyTestOTP = async () => {
    setVerifying(true); setVerifyResult(null);
    try {
      const r = await fetch("/api/at/otp/verify", {
        method: "POST", headers: authH(),
        body: JSON.stringify({ phone: otpPhone, code: otpCode }),
      });
      const d = await r.json();
      setVerifyResult({ ok: d.ok, msg: d.message });
      if (d.ok) setOtpSent(false);
    } catch (e: any) { setVerifyResult({ ok: false, msg: e.message }); }
    finally { setVerifying(false); }
  };

  const toggleLockdown = async () => {
    setToggling(true); setFeedback(null);
    try {
      const endpoint = lockdown.isLocked ? "/api/health/lockdown/disable" : "/api/health/lockdown/enable";
      const r = await fetch(endpoint, { method: "POST", headers: authH() });
      const d = await r.json();
      if (r.ok) {
        setLockdown({ isLocked: !lockdown.isLocked });
        setFeedback({ ok: true, msg: d.message || (lockdown.isLocked ? "National Alert Mode deactivated." : "⚠ National Alert Mode is now ACTIVE. All high-risk monitoring enabled.") });
      } else {
        setFeedback({ ok: false, msg: d.message || "Failed to toggle lockdown." });
      }
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message });
    } finally { setToggling(false); }
  };

  const TABS = [
    { id: "at",       label: "Africa's Talking", icon: Signal },
    { id: "gsm",      label: "GSM Monitoring",   icon: Phone },
    { id: "mfa",      label: "MFA Settings",     icon: Shield },
    { id: "lockdown", label: "Alert Mode",        icon: AlertTriangle },
    { id: "api",      label: "API Keys",          icon: Key },
    { id: "audit",    label: "Audit Log",         icon: Globe },
  ] as const;

  return (
    <div className="space-y-5" id="integrations-settings">

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-[#05080F] border border-white/8 rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`settings-tab-${t.id}`}
              onClick={() => {
                setTab(t.id);
                if (t.id === "at" && !atStatus) loadATStatus();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                tab === t.id ? "bg-[#FFD600] text-[#05080F]" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── AFRICA'S TALKING ─── */}
      {tab === "at" && (
        <div className="space-y-5">

          {/* Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-red-500/20 p-5">
            <div className="absolute -top-6 -right-6 w-40 h-40 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <Signal className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h2 className="font-bebas text-xl text-white tracking-widest">AFRICA'S TALKING — MALAWI</h2>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  SMS alerts · USSD citizen reporting · MFA OTP delivery · National broadcast
                </p>
              </div>
              <button
                onClick={loadATStatus}
                disabled={atLoading}
                className="shrink-0 p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white transition"
                id="at-refresh-btn"
              >
                <RefreshCw className={`w-4 h-4 ${atLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Connection status */}
          {atStatus ? (
            <div className={`card p-5 border ${
              atStatus.configured
                ? "border-green-500/20 bg-green-500/3"
                : "border-orange-500/20 bg-orange-500/3"
            }`}>
              <div className="flex items-center gap-3 mb-4">
                {atStatus.configured
                  ? <CheckCircle className="w-5 h-5 text-green-400" />
                  : <AlertTriangle className="w-5 h-5 text-orange-400" />}
                <div>
                  <p className={`text-sm font-bold ${
                    atStatus.configured ? "text-green-400" : "text-orange-400"
                  }`}>
                    {atStatus.configured ? "Africa's Talking Connected" : "Not Configured"}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {atStatus.configured
                      ? `Username: ${atStatus.username} | Mode: ${atStatus.sandbox ? "SANDBOX" : "LIVE"}`
                      : "API key not set — follow setup instructions below"}
                  </p>
                </div>
                {atStatus.sandbox && atStatus.configured && (
                  <span className="ml-auto text-[9px] font-bold font-mono px-2 py-1 rounded bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600]">
                    SANDBOX MODE
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: "SMS",  ok: atStatus.services?.sms,  icon: MessageSquare },
                  { label: "USSD", ok: atStatus.services?.ussd, icon: Radio },
                  { label: "OTP",  ok: atStatus.services?.otp,  icon: Shield },
                ] as const).map(({ label, ok, icon: Icon }) => (
                  <div key={label} className={`rounded-xl border px-4 py-3 text-center ${
                    ok
                      ? "border-green-500/20 bg-green-500/5"
                      : "border-white/5 bg-[#05080F]/40"
                  }`}>
                    <Icon className={`w-4 h-4 mx-auto mb-1 ${ok ? "text-green-400" : "text-slate-600"}`} />
                    <div className="text-xs font-bold text-white">{label}</div>
                    <div className={`text-[9px] font-mono uppercase mt-0.5 ${ok ? "text-green-400" : "text-slate-600"}`}>
                      {ok ? "Ready" : "Off"}
                    </div>
                  </div>
                ))}
              </div>

              {/* USSD code */}
              {atStatus.configured && (
                <div className="mt-4 bg-[#05080F] border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Radio className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">USSD Code</div>
                    <div className="text-[10px] text-slate-500 font-mono">Dial {atStatus.ussdCode} on any Malawi phone to report an incident</div>
                  </div>
                  <code className="ml-auto text-lg font-bebas tracking-widest text-red-400">{atStatus.ussdCode}</code>
                </div>
              )}

              {/* Setup instructions if not configured */}
              {!atStatus.configured && atStatus.setupInstructions && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-slate-400">{atStatus.setupInstructions.step1}</p>
                  <div className="bg-[#05080F] border border-white/5 rounded-xl px-4 py-3 font-mono text-[11px] text-green-300 space-y-1">
                    {atStatus.setupInstructions.vars.map((v: string) => (
                      <div key={v}>{v}</div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">{atStatus.setupInstructions.step2}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-8 text-center">
              {atLoading
                ? <><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-500 mb-2" /><p className="text-xs text-slate-600">Loading AT status...</p></>
                : <><Signal className="w-8 h-8 mx-auto text-slate-700 mb-2" /><p className="text-xs text-slate-600">Click refresh to check AT status</p></>}
            </div>
          )}

          {/* Send Test SMS */}
          <div className="card p-5 space-y-4">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <MessageSquare className="w-4 h-4 text-red-400" /> Send Test SMS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+265881234567"
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500/50 font-mono"
                  id="at-test-phone"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Message (max 160 chars)</label>
                <input
                  type="text"
                  value={testMsg}
                  onChange={e => setTestMsg(e.target.value.substring(0, 160))}
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500/50"
                  id="at-test-msg"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                id="at-send-sms-btn"
                onClick={sendTestSMS}
                disabled={smsSending || !testPhone.startsWith("+265")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/25 transition disabled:opacity-50"
              >
                {smsSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send SMS
              </button>
              {smsResult && (
                <span className={`text-xs font-mono ${smsResult.ok ? "text-green-400" : "text-red-400"}`}>
                  {smsResult.ok ? "✓" : "✗"} {smsResult.msg}
                </span>
              )}
            </div>
          </div>

          {/* Test OTP */}
          <div className="card p-5 space-y-4">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <Shield className="w-4 h-4 text-[#FFD600]" /> Test MFA OTP Delivery
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={otpPhone}
                  onChange={e => setOtpPhone(e.target.value)}
                  placeholder="+265881234567"
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 font-mono"
                  id="at-otp-phone"
                />
              </div>
              <button
                id="at-send-otp-btn"
                onClick={sendTestOTP}
                disabled={otpSending || otpSent}
                className="self-end flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-sm font-bold hover:bg-[#FFD600]/25 transition disabled:opacity-50"
              >
                {otpSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send OTP
              </button>
            </div>

            {otpResult && (
              <p className={`text-xs font-mono ${otpResult.ok ? "text-green-400" : "text-red-400"}`}>
                {otpResult.ok ? "✓" : "✗"} {otpResult.msg}
              </p>
            )}

            {otpSent && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Enter the OTP you received</label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
                    placeholder="6-digit code"
                    className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 font-mono text-center tracking-[0.5em]"
                    id="at-otp-input"
                  />
                </div>
                <button
                  id="at-verify-otp-btn"
                  onClick={verifyTestOTP}
                  disabled={otpCode.length !== 6 || verifying}
                  className="self-end flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-bold hover:bg-green-500/25 transition disabled:opacity-50"
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Verify
                </button>
              </div>
            )}

            {verifyResult && (
              <p className={`text-xs font-mono ${verifyResult.ok ? "text-green-400" : "text-red-400"}`}>
                {verifyResult.ok ? "✓ OTP verified successfully!" : "✗ " + verifyResult.msg}
              </p>
            )}
          </div>

          {/* USSD Flow preview */}
          <div className="card p-5 space-y-3">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <Radio className="w-4 h-4 text-purple-400" /> USSD Citizen Reporting Flow
              <span className="ml-auto text-[9px] text-purple-400 font-mono bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                No internet required
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Any Malawi citizen can dial <strong className="text-white font-mono">{atStatus?.ussdCode || "*860#"}</strong> from any mobile phone — smartphone or basic phone — to report a cyber incident, even without internet.
            </p>
            <div className="bg-[#05080F] border border-white/8 rounded-xl p-4 font-mono text-[11px] space-y-2 text-slate-300">
              <div className="text-[#FFD600] font-bold mb-2">📱 USSD Session Example:</div>
              {[
                { dir: "→", label: "Citizen dials",  text: `*860#` },
                { dir: "←", label: "System responds", text: "CON LitSecure Sentinel\n1. Report Cyber Incident\n2. Check Report Status\n3. Safety Tips" },
                { dir: "→", label: "Citizen enters",  text: "1" },
                { dir: "←", label: "System responds", text: "CON What type?\n1. Mobile Money Fraud\n2. SIM Swap\n3. Phishing" },
                { dir: "→", label: "Citizen enters",  text: "1" },
                { dir: "←", label: "System responds", text: "CON Describe what happened:" },
                { dir: "→", label: "Citizen types",   text: "Someone called me and stole my Airtel Money" },
                { dir: "←", label: "System responds", text: "END Report received!\nRef: LIT-2026-00042\nThank you!" },
              ].map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold ${step.dir === "→" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}`}>{step.dir}</span>
                  <div>
                    <span className="text-[9px] text-slate-600 uppercase">{step.label}:</span>
                    <pre className="whitespace-pre-wrap text-[10px] text-slate-300 leading-relaxed mt-0.5">{step.text}</pre>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 text-[10px] text-purple-300 leading-relaxed">
              <strong>Webhook URL to set in Africa's Talking dashboard:</strong>
              <div className="font-mono mt-1 text-white bg-[#05080F] px-3 py-1.5 rounded mt-1">
                https://your-domain.com/api/at/ussd
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ─── GSM USSD Monitoring ─── */}
      {tab === "gsm" && (
        <div className="card p-5 space-y-6">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
            <div className="w-1 h-4 bg-green-400 rounded" />
            GSM / USSD Telecom Monitoring
          </h3>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300 leading-relaxed">
            <p className="font-bold mb-1">📡 How This Works (Non-Intrusive)</p>
            <p>LitSecure <strong>does not intercept</strong> actual call content or SMS messages. Instead, it receives <strong>fraud report feeds</strong> and <strong>SIM swap alert feeds</strong> from Airtel Malawi and TNM. This is a voluntary data-sharing agreement, not surveillance.</p>
          </div>

          {gsmStats && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "SIM Swap Reports", val: gsmStats.total_reports, color: "text-[#FFD600]" },
                { label: "Confirmed Frauds",  val: gsmStats.confirmed_swaps, color: "text-red-400" },
                { label: "Active Alerts",     val: gsmStats.active_alerts, color: "text-orange-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-[#05080F]/60 border border-white/5 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bebas ${color}`}>{val}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase mt-1">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {[
              { name: "Airtel Malawi SIM Swap Feed",   status: "Connected", type: "Fraud Reports API", last: "2 min ago" },
              { name: "TNM Mpamba Fraud Alert Feed",    status: "Connected", type: "Fraud Reports API", last: "5 min ago" },
              { name: "MACRA Telecom Regulatory Data",  status: "Connected", type: "Regulatory API",   last: "1 hr ago" },
              { name: "National Law Enforcement LERS",  status: "Pending",   type: "Signed MOU Required", last: "N/A" },
            ].map(feed => (
              <div key={feed.name} className="flex items-center gap-4 bg-[#05080F]/60 border border-white/5 rounded-xl px-4 py-3">
                <Wifi className={`w-4 h-4 shrink-0 ${feed.status === "Connected" ? "text-green-400" : "text-slate-600"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{feed.name}</div>
                  <div className="text-[10px] font-mono text-slate-500">{feed.type}</div>
                </div>
                <span className={`text-[9px] font-mono ${feed.last === "N/A" ? "text-slate-600" : "text-slate-400"}`}>Last: {feed.last}</span>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${
                  feed.status === "Connected" ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-slate-500 border-slate-600/30 bg-slate-700/10"
                }`}>{feed.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MFA Settings ─── */}
      {tab === "mfa" && (
        <div className="space-y-5">
          {/* Role requirements overview */}
          <div className="card p-5 space-y-4">
            <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-1 h-4 bg-[#FFD600] rounded" />
              Platform MFA Requirements
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { role: "Super Admin",     mfaReq: true,  desc: "Always required — no exceptions." },
                { role: "Gov Admin",       mfaReq: true,  desc: "Required by MACRA security framework." },
                { role: "SOC Manager",     mfaReq: true,  desc: "Required — high-privilege role." },
                { role: "Analyst",         mfaReq: true,  desc: "Required — access to sensitive incidents." },
                { role: "Investigator",    mfaReq: false, desc: "Recommended but not enforced." },
                { role: "Citizen / Staff", mfaReq: false, desc: "Optional — encouraged for protection." },
              ].map(r => (
                <div key={r.role} className="flex items-center gap-3 bg-[#05080F]/60 border border-white/5 rounded-xl px-4 py-2.5">
                  <Shield className={`w-3.5 h-3.5 shrink-0 ${r.mfaReq ? "text-[#FFD600]" : "text-slate-600"}`} />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-white">{r.role}</div>
                    <div className="text-[10px] text-slate-500">{r.desc}</div>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono shrink-0 ${
                    r.mfaReq ? "text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10" : "text-slate-500 border-slate-600/30 bg-slate-700/10"
                  }`}>{r.mfaReq ? "ENFORCED" : "OPTIONAL"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-account TOTP setup panel */}
          {mfaUserId && (
            <MfaSetupPanel
              userId={mfaUserId}
              userEmail={mfaEmail}
              mfaEnabled={mfaEnabled}
              onMfaChange={setMfaEnabled}
            />
          )}
        </div>
      )}

      {/* ─── National Alert Mode ─── */}
      {tab === "lockdown" && (
        <div className="card p-5 space-y-6">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
            <div className={`w-1 h-4 rounded ${lockdown.isLocked ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
            National Alert Mode (Emergency Switch)
          </h3>

          {lockdown.isLocked ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
              <p className="text-red-300 text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                ⚠ NATIONAL ALERT MODE IS ACTIVE
              </p>
              <p className="text-xs text-slate-400">Activated by {lockdown.by || "Super Admin"}. Enhanced monitoring and audit logging are running. New account creation is disabled.</p>
              <p className="text-xs text-orange-300 mt-1 font-semibold">Analysts remain fully operational. This mode elevates security WITHOUT locking out responders.</p>
            </div>
          ) : (
            <div className="bg-[#05080F]/60 border border-white/5 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-300 mb-2">When should you activate National Alert Mode?</p>
              <ul className="space-y-1">
                {[
                  "A coordinated cyberattack is happening across multiple sectors simultaneously",
                  "A critical national system (power grid, banking, telecoms) is under attack",
                  "Malawi is experiencing a declared cyber emergency at government level",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[#FFD600] mt-0.5 shrink-0">→</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">What this mode does</p>
            {[
              { action: "Disable new account creation",    active: lockdown.isLocked },
              { action: "Force MFA revalidation for all analysts", active: lockdown.isLocked },
              { action: "Enable ultra-high-risk monitoring on all endpoints", active: lockdown.isLocked },
              { action: "Increase audit log verbosity × 5x", active: lockdown.isLocked },
              { action: "Trigger emergency communication to MACERT & Police", active: lockdown.isLocked },
              { action: "Analysts can still log in and work normally", active: true },
            ].map(item => (
              <div key={item.action} className="flex items-center gap-3 text-xs">
                {item.active
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                <span className={item.active ? "text-slate-300" : "text-slate-600"}>{item.action}</span>
              </div>
            ))}
          </div>

          {feedback && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs border ${
              feedback.ok ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}>
              {feedback.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {feedback.msg}
            </div>
          )}

          <button
            id="lockdown-toggle-btn"
            onClick={toggleLockdown}
            disabled={toggling}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 border transition disabled:opacity-50 ${
              lockdown.isLocked
                ? "text-green-400 border-green-500/40 bg-green-500/10 hover:bg-green-500/20"
                : "text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
            }`}
          >
            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : lockdown.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {toggling ? "Processing..." : lockdown.isLocked ? "Deactivate National Alert Mode" : "ACTIVATE National Alert Mode"}
          </button>
        </div>
      )}

      {/* ─── API Keys ─── */}
      {tab === "api" && (
        <div className="card p-5 space-y-4">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
            <div className="w-1 h-4 bg-blue-400 rounded" />
            Threat Intelligence API Integrations
          </h3>
          <p className="text-xs text-slate-500">Connect LitSecure to global threat intelligence networks. API keys are stored in environment variables — never in the database.</p>
          <div className="space-y-3">
            {[
              { name: "Gemini AI (SENTINEL Brain)", env: "GEMINI_API_KEY", doc: "AI classification, chat, IOC enrichment" },
              { name: "AbuseIPDB",                  env: "ABUSEIPDB_API_KEY", doc: "Malicious IP address reputation checks" },
              { name: "AlienVault OTX",              env: "OTX_API_KEY", doc: "Open threat exchange indicators" },
              { name: "VirusTotal",                  env: "VIRUSTOTAL_API_KEY", doc: "File and URL scanning" },
            ].map(api => (
              <div key={api.name} className="bg-[#05080F]/60 border border-white/5 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Key className="w-3.5 h-3.5 text-[#FFD600]" />
                  <span className="text-sm font-bold text-white">{api.name}</span>
                  <code className="text-[9px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">{api.env}</code>
                </div>
                <p className="text-[10px] text-slate-500">{api.doc}</p>
              </div>
            ))}
          </div>
          <div className="bg-[#FFD600]/5 border border-[#FFD600]/20 rounded-xl p-3 text-[10px] text-[#FFD600]/80 leading-relaxed">
            🔐 <strong>Security Note:</strong> Configure API keys in the <code>.env</code> file on the server. Never paste them here or store them in the database. Keys are loaded securely at server startup.
          </div>
        </div>
      )}

      {/* ─── Audit Settings ─── */}
      {tab === "audit" && (
        <div className="card p-5 space-y-4">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
            <div className="w-1 h-4 bg-orange-400 rounded" />
            Audit Log Configuration
          </h3>
          <p className="text-xs text-slate-500">Every significant action taken on this platform is recorded. This log is the official evidence trail for any legal proceedings.</p>
          <div className="space-y-3">
            {[
              { event: "User login and logout", level: "Always logged", note: "Includes IP, device, time" },
              { event: "Incident creation / update", level: "Always logged", note: "Who changed what and when" },
              { event: "Alert acknowledgement", level: "Always logged", note: "Response time measured" },
              { event: "Rule deployment", level: "Always logged", note: "Compiled content stored" },
              { event: "National Alert Mode toggle", level: "Always logged", note: "Timestamp + activating officer" },
              { event: "Password change", level: "Always logged", note: "Old hash removed securely" },
              { event: "API key access", level: "Always logged", note: "Never the key value, only access events" },
            ].map(item => (
              <div key={item.event} className="flex items-start gap-3 text-xs">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-slate-200 font-semibold">{item.event}</span>
                  <span className="text-slate-500 ml-2">— {item.note}</span>
                </div>
                <span className="text-[9px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded shrink-0">{item.level}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
