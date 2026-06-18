import React, { useState, useRef, useEffect } from "react";
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, Loader2,
  ArrowRight, Shield, SmartphoneNfc, CheckCircle,
  AlertTriangle, User, Phone, UserPlus
} from "lucide-react";
import { LitSecureWordmark } from "./LitSecureLogo";

interface LoginPageProps {
  onLogin: (token: string, user: any) => void;
}

const MFA_ROLES = ["admin", "super_admin", "gov_admin", "soc_manager"];

const DEMO_ACCOUNTS = [
  { label: "Admin",        email: "admin@macra.mw",         password: "Admin@Sentinel2026!",    role: "admin",        desc: "Full platform access" },
  { label: "SOC Manager",  email: "socmanager@macra.mw",    password: "SocManager@2026!",       role: "soc_manager",  desc: "SOC operations + MFA" },
  { label: "Analyst",      email: "analyst@airtel.mw",      password: "Analyst@Sentinel2026!",  role: "analyst",      desc: "Intel & analysis view" },
  { label: "Investigator", email: "investigator@police.mw", password: "Investigator@2026!",     role: "investigator", desc: "Evidence & forensics" },
  { label: "Auditor",      email: "auditor@macra.mw",       password: "Auditor@Sentinel2026!",  role: "auditor",      desc: "Read-only full view" },
  { label: "Citizen",      email: "citizen@gmail.com",      password: "Citizen@Report2026!",    role: "org_user",     desc: "Report incidents" },
];

const ROLE_BADGE: Record<string, string> = {
  admin:        "text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10",
  super_admin:  "text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10",
  gov_admin:    "text-purple-400 border-purple-500/30 bg-purple-500/10",
  soc_manager:  "text-orange-400 border-orange-500/30 bg-orange-500/10",
  analyst:      "text-blue-400 border-blue-500/30 bg-blue-500/10",
  investigator: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  auditor:      "text-slate-400 border-slate-500/30 bg-slate-500/10",
  org_user:     "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  citizen:      "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
};

const DEMO_OTP = "372916";
type Mode = "login" | "signup";
type Step = "credentials" | "mfa" | "success" | "signup_success";

// ─── Password strength indicator ──────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase",     ok: /[A-Z]/.test(password) },
    { label: "Lowercase",     ok: /[a-z]/.test(password) },
    { label: "Number",        ok: /\d/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        {[1,2,3,4].map(i => (
          <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= score ? colors[score] : "bg-white/10"}`} />
        ))}
        <span className={`text-[9px] font-bold font-mono ml-1 ${score >= 4 ? "text-emerald-400" : score >= 3 ? "text-yellow-400" : "text-red-400"}`}>
          {labels[score]}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map(c => (
          <span key={c.label} className={`text-[9px] font-mono flex items-center gap-1 ${c.ok ? "text-emerald-400" : "text-slate-600"}`}>
            {c.ok ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode]         = useState<Mode>("login");
  const [step, setStep]         = useState<Step>("credentials");

  // Login state
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [pendingAuth, setPendingAuth] = useState<{ token: string; user: any } | null>(null);
  const [otp, setOtp]           = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [lockdownActive, setLockdownActive] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Signup state
  const [regName, setRegName]           = useState("");
  const [regEmail, setRegEmail]         = useState("");
  const [regPassword, setRegPassword]   = useState("");
  const [regConfirm, setRegConfirm]     = useState("");
  const [regPhone, setRegPhone]         = useState("");
  const [showRegPass, setShowRegPass]   = useState(false);
  const [regLoading, setRegLoading]     = useState(false);
  const [regError, setRegError]         = useState("");

  useEffect(() => {
    fetch("/api/health/lockdown-status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lockdownEnabled) setLockdownActive(true); })
      .catch(() => {});
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(""); setRegError("");
    setStep("credentials");
  };

  // ─── Login: Step 1 ────────────────────────────────────────────────────────
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Invalid email or password.");
      } else if (data.mfa_required) {
        // Server signals TOTP MFA is required — show OTP step
        setStep("mfa");
      } else if (data.token) {
        onLogin(data.token, data.user);
      }
    } catch {
      setError("Cannot connect to Sentinel server. Please ensure the server is running.");
    } finally { setLoading(false); }
  };

  // ─── Login: OTP verify (calls real /api/auth/login with mfa_token) ────────
  const verifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) { setOtpError("Please enter all 6 digits."); return; }
    setOtpVerifying(true); setOtpError("");
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password, mfa_token: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "MFA_INVALID") {
          setOtpError("Incorrect code. Check your authenticator app and try again.");
        } else if (data.error === "ACCOUNT_LOCKED") {
          setOtpError(data.message || "Account locked. Please try again later.");
        } else {
          setOtpError(data.message || "Verification failed. Please try again.");
        }
      } else if (data.token) {
        setStep("success");
        setTimeout(() => onLogin(data.token, data.user), 1200);
      }
    } catch {
      setOtpError("Cannot connect to Sentinel server. Please try again.");
    } finally { setOtpVerifying(false); }
  };

  // ─── OTP input helpers ────────────────────────────────────────────────────
  const handleOtpInput = (idx: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp]; next[idx] = val.slice(-1); setOtp(next); setOtpError("");
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKey = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) { setOtp(pasted.split("")); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };


  // ─── Signup handler ───────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (regPassword !== regConfirm) { setRegError("Passwords do not match."); return; }
    setRegLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword, phone: regPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.message || "Registration failed. Please try again.");
      } else {
        // Auto-login the new citizen
        setStep("signup_success");
        setTimeout(() => onLogin(data.token, data.user), 1600);
      }
    } catch {
      setRegError("Cannot connect to Sentinel server. Please try again.");
    } finally { setRegLoading(false); }
  };

  // ─── Shared input component ───────────────────────────────────────────────
  const InputRow = ({ id, type, value, onChange, icon: Icon, placeholder, ...rest }: any) => (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      <input
        id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
        autoComplete="off"
        className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono"
        {...rest}
      />
    </div>
  );

  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden bg-[#05080F]">
      <div className="absolute inset-0 hero-globe" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05080F]/60 via-transparent to-[#05080F]/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#05080F]/80 via-transparent to-[#05080F]/20" />

      {/* Lockdown banner */}
      {lockdownActive && (
        <div className="relative z-30 bg-red-500/90 border-b border-red-400/50 backdrop-blur px-6 py-2.5 flex items-center justify-center gap-3 text-white">
          <AlertTriangle className="w-4 h-4 animate-pulse shrink-0" />
          <span className="text-sm font-bold tracking-wider">⚠ NATIONAL ALERT MODE ACTIVE — Enhanced monitoring running. New account creation is suspended.</span>
          <AlertTriangle className="w-4 h-4 animate-pulse shrink-0" />
        </div>
      )}

      {/* Top nav */}
      <nav className="relative z-20 flex items-center justify-between px-8 md:px-16 py-5">
        <LitSecureWordmark size="md" showSubtitle={false} />
        <div className="hidden md:flex items-center gap-8 text-[13px] font-medium text-slate-300">
          <a href="#about"    onClick={e => { e.preventDefault(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); }}    className="hover:text-[#FFD600] transition">About</a>
          <a href="#mission"  onClick={e => { e.preventDefault(); document.getElementById('mission')?.scrollIntoView({ behavior: 'smooth' }); }}  className="hover:text-[#FFD600] transition">Mission</a>
          <a href="#coverage" onClick={e => { e.preventDefault(); document.getElementById('coverage')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#FFD600] transition">Coverage</a>
          <a href="#contact"  onClick={e => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }}  className="hover:text-[#FFD600] transition">Contact</a>
        </div>
      </nav>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-between px-8 md:px-16 pt-4 pb-10 gap-10 max-w-[1400px] mx-auto w-full">

        {/* Hero */}
        <div className="flex-1 max-w-2xl animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-[#FFD600]/10 border border-[#FFD600]/25 rounded-full px-4 py-1.5 mb-5">
            <span className="w-2 h-2 rounded-full bg-[#FFD600] animate-pulse" />
            <span className="text-[#FFD600] text-[11px] font-mono font-bold tracking-widest uppercase">MACRA — MACERT — MALAWI DEFENSE CYBER-CELL</span>
          </div>
          <h1 className="font-bebas text-[62px] md:text-[80px] leading-none text-white mb-4 tracking-wide">
            NATIONAL<br /><span className="text-[#FFD600]">CYBER</span><br />INTELLIGENCE
          </h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-lg mb-6 font-grotesk">
            AI-powered incident management, real-time threat intelligence, and coordinated national cyber response across Malawi's telecoms, banking, and government nodes.
          </p>
          <div className="flex items-center gap-8 mb-8">
            {[
              { value: "24/7", label: "Monitoring" },
              { value: "5+",   label: "CCTV Nodes" },
              { value: "GEMINI", label: "AI Engine" },
              { value: "MFA",  label: "Secured" },
            ].map(s => (
              <div key={s.label}>
                <div className="font-bebas text-3xl text-[#FFD600]">{s.value}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 max-w-md">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-emerald-400 font-bold text-sm">Public Reporting Portal</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-3">
              Are you a citizen, business, or organization wanting to report a cybercrime? <span className="text-emerald-400 font-semibold">Create a free account</span> to submit reports, track your cases, and access Malawi's Cyber Awareness Hub — no technical knowledge required.
            </p>
            <button
              id="public-report-hero-btn"
              onClick={() => window.location.href = '?report=1'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition"
            >
              <Shield className="w-3.5 h-3.5" />
              Report a Cyber Crime — No Account Required
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Auth card */}
        <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: "0.15s", opacity: 0, animationFillMode: "forwards" }}>
          <div className="card border border-white/10" style={{ background: "rgba(5,8,15,0.90)", backdropFilter: "blur(24px)" }}>

            {/* Mode switcher — Login / Sign Up */}
            {(step === "credentials" || step === "signup_success") && (
              <div className="flex border-b border-white/8">
                {(["login", "signup"] as Mode[]).map(m => (
                  <button
                    key={m}
                    id={`auth-tab-${m}`}
                    onClick={() => switchMode(m)}
                    className={`flex-1 py-3 text-xs font-bold tracking-wider uppercase transition ${
                      mode === m
                        ? "text-[#FFD600] border-b-2 border-[#FFD600] bg-[#FFD600]/5"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {m === "login" ? "Sign In" : "Create Account"}
                  </button>
                ))}
              </div>
            )}

            <div className="p-7">

              {/* ══════ LOGIN: CREDENTIALS ══════ */}
              {mode === "login" && step === "credentials" && (
                <>
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1 h-5 bg-[#FFD600] rounded" />
                      <span className="text-[#FFD600] text-[10px] font-mono font-bold tracking-widest uppercase">Secure Access Gateway</span>
                    </div>
                    <h2 className="font-grotesk text-xl font-bold text-white">Sign in to Sentinel</h2>
                    <p className="text-slate-500 text-xs mt-0.5">Authorized personnel only • All sessions audited</p>
                  </div>

                  <form onSubmit={handleCredentials} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                      <InputRow id="login-email" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} icon={Mail} placeholder="operator@macra.mw" required />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input
                          id="login-password" type={showPass ? "text" : "password"} value={password}
                          onChange={e => setPassword(e.target.value)} required placeholder="••••••••••••"
                          className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg pl-10 pr-11 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono"
                        />
                        <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition" tabIndex={-1}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
                      </div>
                    )}

                    <button id="login-submit-btn" type="submit" disabled={loading}
                      className="btn-accent w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm disabled:opacity-50">
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating...</> : <>ACCESS SENTINEL <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>

                  <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600 font-mono border border-white/5 rounded-lg px-3 py-2">
                    <Shield className="w-3 h-3 text-[#FFD600]/50 shrink-0" />
                    Government & Admin roles require OTP verification (MFA)
                  </div>

                  {/* Demo accounts */}
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider mb-2.5 text-center">— Demo Quick Access —</p>
                    <div className="space-y-1.5">
                      {DEMO_ACCOUNTS.map(acc => (
                        <button key={acc.role} id={`demo-${acc.role}`}
                          onClick={() => { setEmail(acc.email); setPassword(acc.password); setError(""); }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#0A0E1A] border border-white/5 hover:border-[#FFD600]/30 hover:bg-[#FFD600]/5 transition group text-left">
                          <div>
                            <div className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200 transition">{acc.email}</div>
                            <div className="text-[8px] text-slate-600">{acc.desc}</div>
                          </div>
                          <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border font-mono shrink-0 ml-2 ${ROLE_BADGE[acc.role] || ""}`}>{acc.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ══════ LOGIN: MFA OTP ══════ */}
              {mode === "login" && step === "mfa" && (
                <>
                  <div className="mb-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#FFD600]/10 border border-[#FFD600]/30 flex items-center justify-center mx-auto mb-4">
                      <SmartphoneNfc className="w-7 h-7 text-[#FFD600]" />
                    </div>
                    <h2 className="font-grotesk text-lg font-bold text-white">Two-Factor Verification</h2>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      Enter the 6-digit code from your authenticator app.<br />
                      <span className="text-slate-600">Google Authenticator · Authy · 1Password</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-4" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input key={i} ref={el => { otpRefs.current[i] = el; }} id={`otp-digit-${i}`}
                        type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={e => handleOtpInput(i, e.target.value)} onKeyDown={e => handleOtpKey(i, e)}
                        className={`w-11 h-12 text-center text-lg font-mono font-bold rounded-xl border outline-none transition ${digit ? "bg-[#FFD600]/10 border-[#FFD600]/50 text-[#FFD600]" : "bg-[#0A0E1A] border-white/10 text-white focus:border-[#FFD600]/40"}`}
                      />
                    ))}
                  </div>
                  {otpError && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400 mb-3">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {otpError}
                    </div>
                  )}
                  <button id="otp-verify-btn" onClick={verifyOtp} disabled={otpVerifying || otp.join("").length < 6}
                    className="btn-accent w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm disabled:opacity-50">
                    {otpVerifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><Shield className="w-4 h-4" /> Verify & Sign In</>}
                  </button>
                  <button onClick={() => { setStep("credentials"); setOtp(["","","","","",""]); setOtpError(""); }}
                    className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition mt-3">
                    ← Back to login
                  </button>
                </>
              )}

              {/* ══════ LOGIN: SUCCESS ══════ */}
              {(step === "success") && (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="font-grotesk text-lg font-bold text-white">Identity Verified</h2>
                    <p className="text-slate-500 text-xs mt-1">MFA confirmed. Loading your workspace…</p>
                  </div>
                  <Loader2 className="w-5 h-5 text-[#FFD600] animate-spin mx-auto" />
                </div>
              )}

              {/* ══════ SIGNUP FORM ══════ */}
              {mode === "signup" && step === "credentials" && (
                <>
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1 h-5 bg-emerald-400 rounded" />
                      <span className="text-emerald-400 text-[10px] font-mono font-bold tracking-widest uppercase">Public Reporting Account</span>
                    </div>
                    <h2 className="font-grotesk text-xl font-bold text-white">Create Your Account</h2>
                    <p className="text-slate-500 text-xs mt-0.5">Free for citizens · Report cyber crimes securely</p>
                  </div>

                  {lockdownActive ? (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-3 text-xs text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Registration is suspended during National Alert Mode. Please try again later.</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSignup} className="space-y-3.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Full Name</label>
                        <InputRow id="reg-name" type="text" value={regName} onChange={(e: any) => setRegName(e.target.value)} icon={User} placeholder="Your full name" required />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                        <InputRow id="reg-email" type="email" value={regEmail} onChange={(e: any) => setRegEmail(e.target.value)} icon={Mail} placeholder="you@example.com" required />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Phone (Optional)</label>
                        <InputRow id="reg-phone" type="tel" value={regPhone} onChange={(e: any) => setRegPhone(e.target.value)} icon={Phone} placeholder="+265 99 000 0000" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                          <input
                            id="reg-password" type={showRegPass ? "text" : "password"} value={regPassword}
                            onChange={e => setRegPassword(e.target.value)} required placeholder="••••••••••••"
                            className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg pl-10 pr-11 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono"
                          />
                          <button type="button" onClick={() => setShowRegPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition" tabIndex={-1}>
                            {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <PasswordStrength password={regPassword} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Confirm Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                          <input
                            id="reg-confirm" type="password" value={regConfirm}
                            onChange={e => setRegConfirm(e.target.value)} required placeholder="••••••••••••"
                            className={`w-full bg-[#0A0E1A] border rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono ${regConfirm && regConfirm !== regPassword ? "border-red-500/50 focus:border-red-500" : "border-white/10 focus:border-[#FFD600]/60"}`}
                          />
                        </div>
                        {regConfirm && regConfirm !== regPassword && (
                          <p className="text-[9px] text-red-400 font-mono mt-1">Passwords do not match</p>
                        )}
                      </div>

                      {regError && (
                        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{regError}</span>
                        </div>
                      )}

                      <button id="signup-submit-btn" type="submit" disabled={regLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-white transition disabled:opacity-50 mt-1">
                        {regLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account...</> : <><UserPlus className="w-4 h-4" /> CREATE FREE ACCOUNT</>}
                      </button>

                      <p className="text-[9px] text-slate-600 font-mono text-center leading-relaxed">
                        By creating an account, you agree to Malawi's cybercrime reporting policy. All reports are confidential.
                      </p>
                    </form>
                  )}
                </>
              )}

              {/* ══════ SIGNUP SUCCESS ══════ */}
              {step === "signup_success" && (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="font-grotesk text-lg font-bold text-white">Account Created!</h2>
                    <p className="text-slate-500 text-xs mt-1">Welcome to LitSecure Sentinel. Loading your reporting portal…</p>
                  </div>
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin mx-auto" />
                </div>
              )}

            </div>
          </div>

          <p className="text-center text-[10px] text-slate-600 mt-3 font-mono">
            MACRA SEC-80B • MACERT Hotline: 112 • All sessions are audited
          </p>
          <button
            id="public-report-login-btn"
            onClick={() => window.location.href = '?report=1'}
            className="w-full text-center text-[10px] text-emerald-500/60 hover:text-emerald-400 transition mt-2 font-mono underline underline-offset-2"
          >
            Report a cyber crime without an account →
          </button>
        </div>
      </div>

      {/* ─── ABOUT ──────────────────────────────────────────────────────── */}
      <section id="about" className="relative z-10 bg-[#05080F] border-t border-white/5 py-24 px-8 md:px-16">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-[#FFD600] rounded" />
            <span className="text-[#FFD600] text-xs font-mono font-bold tracking-[0.2em] uppercase">About LitSecure</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-bebas text-5xl md:text-6xl text-white leading-none mb-6">MALAWI'S SOVEREIGN<br /><span className="text-[#FFD600]">CYBER DEFENSE</span><br />PLATFORM</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                LitSecure Sentinel is Malawi's national-grade cyber intelligence and incident management platform, purpose-built for government ministries, financial institutions, telecoms, and critical infrastructure operators.
              </p>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Developed under the MACRA regulatory framework and aligned with the African Union Convention on Cyber Security, Sentinel provides a unified, AI-augmented command surface for detecting, triaging, and coordinating responses to digital threats across all national sectors.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { val: "2022", lbl: "Founded" },
                  { val: "28+", lbl: "Gov Agencies" },
                  { val: "ISO 27001", lbl: "Aligned" },
                  { val: "Gemini AI", lbl: "Powered" },
                ].map(s => (
                  <div key={s.lbl} className="bg-white/3 border border-white/8 rounded-xl p-4">
                    <div className="font-bebas text-2xl text-[#FFD600]">{s.val}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {[
                { icon: "🏛️", title: "Government-Grade Infrastructure", desc: "Encrypted at rest and in transit, with role-based access control enforced at every layer. Audit trails are tamper-evident and cryptographically signed." },
                { icon: "🤖", title: "AI-Powered Triage", desc: "Google Gemini AI automatically classifies incoming incidents, surfaces related cases, and drafts intelligence reports — reducing analyst workload by up to 70%." },
                { icon: "🔄", title: "Real-Time Situational Awareness", desc: "Live threat feeds from AbuseIPDB, VirusTotal, AlienVault OTX, and MITRE ATT&CK correlation give responders a complete operational picture within seconds." },
                { icon: "🔐", title: "TOTP Multi-Factor Authentication", desc: "All government and admin accounts are protected by time-based one-time passwords enforced server-side, with session revocation on logout." },
              ].map(item => (
                <div key={item.title} className="flex gap-4 bg-white/3 border border-white/8 rounded-xl p-4 hover:border-[#FFD600]/20 transition">
                  <span className="text-2xl shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <div className="font-grotesk font-bold text-white text-sm mb-1">{item.title}</div>
                    <div className="text-slate-500 text-xs leading-relaxed">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── MISSION ────────────────────────────────────────────────────── */}
      <section id="mission" className="relative z-10 bg-gradient-to-b from-[#05080F] to-[#080C18] border-t border-white/5 py-24 px-8 md:px-16">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#FFD600]/10 border border-[#FFD600]/20 rounded-full px-4 py-1.5 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-pulse" />
              <span className="text-[#FFD600] text-[11px] font-mono font-bold tracking-[0.2em] uppercase">Our Mission</span>
            </div>
            <h2 className="font-bebas text-5xl md:text-6xl text-white leading-none mb-4">SECURING MALAWI'S<br /><span className="text-[#FFD600]">DIGITAL FUTURE</span></h2>
            <p className="text-slate-400 text-sm max-w-2xl mx-auto leading-relaxed">
              Our mandate is to build, operate, and continuously improve a sovereign cyber defense capability that protects every citizen, business, and institution in Malawi from digital threats.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: "🛡️", color: "#FFD600", title: "Protect", desc: "Proactively defend Malawi's critical national infrastructure — power grids, water systems, banking rails, and government networks — from state and non-state cyber actors.", items: ["24/7 threat monitoring", "Proactive vulnerability scanning", "National firewall coordination"] },
              { icon: "🔍", color: "#3B82F6", title: "Detect", desc: "Deploy AI-driven detection engines across all connected sectors, ensuring zero dwell time for sophisticated intrusions, ransomware, and financial fraud patterns.", items: ["ML anomaly detection", "SIEM log correlation", "Behavioural baselining"] },
              { icon: "⚡", color: "#10B981", title: "Respond", desc: "Coordinate rapid national response across government, telecoms, and banking with clear command chains, playbooks, and international CERT partnerships.", items: ["72-hour incident SLA", "MACERT coordination", "INTERPOL Cybercrime liaison"] },
            ].map(pillar => (
              <div key={pillar.title} className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-white/15 transition group">
                <div className="text-4xl mb-4">{pillar.icon}</div>
                <div className="font-bebas text-3xl mb-2" style={{ color: pillar.color }}>{pillar.title}</div>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">{pillar.desc}</p>
                <ul className="space-y-1.5">
                  {pillar.items.map(i => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: pillar.color }} />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="bg-gradient-to-r from-[#FFD600]/5 via-transparent to-[#FFD600]/5 border border-[#FFD600]/15 rounded-2xl p-8 text-center">
            <div className="font-bebas text-2xl text-[#FFD600] mb-2">UN SUSTAINABLE DEVELOPMENT GOAL 17</div>
            <p className="text-slate-400 text-sm max-w-3xl mx-auto leading-relaxed">
              LitSecure Sentinel directly advances Malawi's Digital Economy Strategy 2031 and aligns with SADC Cybersecurity Model Law, ITU Global Cybersecurity Agenda, and the Budapest Convention principles — positioning Malawi as a regional leader in cyber sovereignty.
            </p>
          </div>
        </div>
      </section>

      {/* ─── COVERAGE ───────────────────────────────────────────────────── */}
      <section id="coverage" className="relative z-10 bg-[#05080F] border-t border-white/5 py-24 px-8 md:px-16">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-[#FFD600] rounded" />
            <span className="text-[#FFD600] text-xs font-mono font-bold tracking-[0.2em] uppercase">Operational Coverage</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-bebas text-5xl md:text-6xl text-white leading-none mb-6">NATIONWIDE<br /><span className="text-[#FFD600]">SENSOR</span><br />NETWORK</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-8">
                Sentinel's collection infrastructure spans all three of Malawi's regions, with active monitoring nodes across 12 districts and integration with all licensed telcos, Tier-1 banks, and government ministerial networks.
              </p>
              <div className="space-y-3">
                {[
                  { region: "Northern Region", districts: "Chitipa, Karonga, Nkhata Bay, Rumphi, Mzimba", status: "Active", color: "#10B981" },
                  { region: "Central Region", districts: "Kasungu, Ntchisi, Dowa, Salima, Lilongwe, Mchinji, Dedza, Ntcheu", status: "Active", color: "#10B981" },
                  { region: "Southern Region", districts: "Mangochi, Balaka, Zomba, Blantyre, Mwanza, Thyolo, Mulanje, Chiradzulu, Nsanje, Chikwawa", status: "Active", color: "#10B981" },
                ].map(r => (
                  <div key={r.region} className="bg-white/3 border border-white/8 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-grotesk font-bold text-white text-sm">{r.region}</div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border" style={{ color: r.color, borderColor: `${r.color}40`, backgroundColor: `${r.color}15` }}>{r.status}</span>
                    </div>
                    <div className="text-slate-500 text-xs">{r.districts}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: "🏛️", sector: "Government", nodes: "28 Ministries", desc: "All national ministries and key agencies including State House, MOF, MoICT, and NRA connected to Sentinel's incident management backbone." },
                { icon: "🏦", sector: "Banking", nodes: "14 Institutions", desc: "All RBM-licensed commercial banks, mobile money operators (Airtel Money, TNM Mpamba), and microfinance institutions under real-time fraud monitoring." },
                { icon: "📡", sector: "Telecoms", nodes: "5 Operators", desc: "Airtel Malawi, TNM, Access Communications, Malawi Telecommunications Ltd, and Smile Telecoms integrated for network anomaly detection and SS7 threat alerting." },
                { icon: "💡", sector: "Energy & Utilities", nodes: "ESCOM + WB", desc: "ESCOM power grid SCADA systems and Water Boards under OT/ICS monitoring — protecting against industrial control system attacks and ransomware targeting critical services." },
                { icon: "✈️", sector: "Transport", nodes: "Airports + Ports", desc: "Kamuzu International Airport, Chileka Airport, and Nsanje port systems monitored for cyber intrusions affecting travel, logistics, and trade infrastructure." },
                { icon: "🎓", sector: "Education & Health", nodes: "Public Sector", desc: "University networks, MHIS health information system, and NHSRC research platforms protected — safeguarding patient data and academic intellectual property." },
              ].map(s => (
                <div key={s.sector} className="bg-white/3 border border-white/8 rounded-xl p-4 hover:border-[#FFD600]/20 transition">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="font-grotesk font-bold text-white text-sm">{s.sector}</div>
                  <div className="text-[#FFD600] text-[10px] font-mono mb-2">{s.nodes}</div>
                  <div className="text-slate-500 text-xs leading-relaxed">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CONTACT ────────────────────────────────────────────────────── */}
      <section id="contact" className="relative z-10 bg-gradient-to-b from-[#080C18] to-[#05080F] border-t border-white/5 py-24 px-8 md:px-16">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#FFD600]/10 border border-[#FFD600]/20 rounded-full px-4 py-1.5 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-pulse" />
              <span className="text-[#FFD600] text-[11px] font-mono font-bold tracking-[0.2em] uppercase">Contact &amp; Partnerships</span>
            </div>
            <h2 className="font-bebas text-5xl md:text-6xl text-white leading-none mb-4">GET IN <span className="text-[#FFD600]">TOUCH</span></h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
              For pilot programmes, institutional onboarding, incident escalations, or partnership enquiries — our team is available 24/7.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact cards */}
            <div className="space-y-4">
              {[
                { icon: "🚨", color: "#EF4444", label: "Emergency Cyber Hotline", value: "112 / +265 (0) 1 770 777", sub: "MACERT 24/7 Incident Response — operational emergencies only" },
                { icon: "📧", color: "#3B82F6", label: "General Enquiries", value: "info@litsecure.mw", sub: "Pilot partnerships, onboarding, and commercial questions" },
                { icon: "🔒", color: "#10B981", label: "Security Disclosures", value: "security@litsecure.mw", sub: "Responsible vulnerability disclosure — PGP key available on request" },
                { icon: "🏛️", color: "#FFD600", label: "Headquarters", value: "MACRA House, PO Box 30350, Lilongwe 3", sub: "Malawi Communications Regulatory Authority Campus" },
                { icon: "📡", color: "#A855F7", label: "MACERT Coordination", value: "macert@macra.mw", sub: "For CERT-to-CERT coordination and international escalation" },
              ].map(c => (
                <div key={c.label} className="flex gap-4 bg-white/3 border border-white/8 rounded-xl p-4 hover:border-white/15 transition">
                  <span className="text-2xl shrink-0">{c.icon}</span>
                  <div>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider mb-0.5" style={{ color: c.color }}>{c.label}</div>
                    <div className="text-white text-sm font-grotesk font-semibold">{c.value}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{c.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Quick message form */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-7">
              <h3 className="font-grotesk font-bold text-white text-lg mb-1">Send a Message</h3>
              <p className="text-slate-500 text-xs mb-6">For non-emergency enquiries. We respond within 2 business days.</p>
              <form className="space-y-4" onSubmit={e => { e.preventDefault(); alert('Message sent! Our team will respond within 2 business days.'); (e.target as HTMLFormElement).reset(); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Full Name</label>
                    <input id="contact-name" type="text" required placeholder="Jane Banda" className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Organisation</label>
                    <input id="contact-org" type="text" placeholder="Ministry / Bank / NGO" className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                  <input id="contact-email" type="email" required placeholder="jane.banda@macra.mw" className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Enquiry Type</label>
                  <select id="contact-type" className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg px-4 py-2.5 text-sm text-slate-400 outline-none transition font-mono">
                    <option>Pilot Programme Request</option>
                    <option>Institutional Onboarding</option>
                    <option>Commercial Partnership</option>
                    <option>Media &amp; Press</option>
                    <option>General Enquiry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Message</label>
                  <textarea id="contact-message" required rows={4} placeholder="Describe your enquiry or use case..." className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/60 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono resize-none" />
                </div>
                <button id="contact-submit-btn" type="submit" className="btn-accent w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm">
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Partner logos */}
      <div className="relative z-10 border-t border-white/5 bg-[#05080F]/60 backdrop-blur px-6 py-4">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-3">
            <span className="text-[9px] font-orbitron font-bold tracking-[0.2em] text-slate-600 uppercase">Cooperative Partners &amp; International Organizations</span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: "🇲🇼", name: "MACRA",      full: "Malawi Communications Regulatory Authority" },
              { icon: "🛡️",  name: "MACERT",     full: "Malawi Computer Emergency Response Team" },
              { icon: "🌍",  name: "AfricaCERT", full: "African Computer Emergency Response Teams" },
              { icon: "🌐",  name: "FIRST",      full: "Forum of Incident Response & Security Teams" },
              { icon: "📡",  name: "ITU",        full: "International Telecommunication Union" },
              { icon: "🏛️", name: "AU-CSIRT",   full: "African Union Cybersecurity" },
              { icon: "🔵",  name: "INTERPOL",   full: "Cybercrime Division" },
              { icon: "🏦",  name: "RBM",        full: "Reserve Bank of Malawi" },
              { icon: "👮",  name: "MPS-CID",    full: "Malawi Police Service — Cybercrime" },
              { icon: "⚔️",  name: "MDC-CYBER",  full: "Malawi Defence Cyber-Cell" },
            ].map(p => (
              <div key={p.name} className="partner-logo group" title={p.full}>
                <span className="partner-logo-icon">{p.icon}</span>
                <span className="partner-logo-name transition-colors">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 border-t border-white/5 bg-[#05080F]/80 backdrop-blur px-8 md:px-16 py-3">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-slate-600">
          <span>© 2026 LitSecure Systems Ltd • Malawi Cyber Defense Coordinated Node</span>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-pulse" />
              System Operational
            </span>
            <span>API v1.4 • JWT + MFA Secured</span>
          </div>
        </div>
      </div>
    </div>
  );
}
